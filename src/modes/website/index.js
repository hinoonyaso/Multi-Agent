import {
  loadModePrompt,
  loadRolePrompt
} from "../../core/promptLoader.js";
import {
  validateOutput
} from "../../core/validator.js";
import {
  buildContractRepairPrompt,
  buildInvalidJsonRepairPrompt
} from "../../core/repairPromptBuilder.js";
import { buildRevisionTrace } from "../../core/revisionTraceBuilder.js";
import { diffFileArtifacts } from "../../core/artifactDiff.js";
import { RETRY_ERROR_TYPES } from "../../core/retryPolicy.js";
import {
  createModeRuntime,
  runJsonStage
} from "../shared/pipeline.js";

const MODE_NAME = "website";
const DEFAULT_OUTPUT_TYPE = "static_html_css_js";
const MAX_CODER_REVISIONS = 1;
const STEP_KEYS = Object.freeze({
  architect: "architect",
  coderFirstPass: "coder_first_pass",
  uiCritic: "ui_critic",
  revisionSummary: "revision_summary",
  revisionTrace: "revision_trace",
  coderRevision: "coder_revision",
  coderFinal: "coder_final",
  validator: "validator"
});
const STAGE_ORDER = [
  "architect",
  "coder_first_pass",
  "ui_critic",
  "revision",
  "validator"
];
const STATIC_ENTRYPOINT_CANDIDATES = ["index.html", "main.html", "app.html"];
const REACT_RUNTIME_ENTRYPOINT_CANDIDATES = [
  "src/main.tsx",
  "src/main.jsx",
  "src/main.js",
  "src/main.ts"
];
const REACT_ENTRYPOINT_CANDIDATES = [
  ...REACT_RUNTIME_ENTRYPOINT_CANDIDATES,
  "index.html"
];

export async function runWebsiteMode(context = {}) {
  const runtime = await createModeRuntime(context);
  const emit = createModeEventEmitter(context.onEvent, runtime);

  emitStageEvent(emit, "architect_started", "architect", "Generating website architecture.");
  const architect = await runArchitectStage(runtime);
  emitStageEvent(
    emit,
    "architect_completed",
    "architect",
    summarizeArchitectResult(architect)
  );
  await persistWebsiteStep(runtime, STEP_KEYS.architect, architect);

  const firstPass = await runFirstPassGeneration(runtime, architect, emit);
  await persistWebsiteStep(runtime, STEP_KEYS.coderFirstPass, firstPass.coder);

  emitStageEvent(emit, "ui_critic_started", "ui_critic", "Reviewing first-pass implementation.");
  const critique = await runCritiqueStage(runtime, architect, firstPass);
  emitStageEvent(
    emit,
    "ui_critic_completed",
    "ui_critic",
    summarizeCritiqueResult(critique.uiCritic)
  );
  await persistWebsiteStep(runtime, STEP_KEYS.uiCritic, critique.uiCritic);

  const revision = await runRevisionStage(runtime, architect, firstPass, critique, emit);
  const validatedRevision = await retryRevisionForValidatorFailure(
    runtime,
    architect,
    revision,
    emit
  );
  await persistRevisionArtifacts(runtime, validatedRevision);

  emitStageEvent(emit, "validator_started", "validator", "Validating website artifact.");
  const validator = await runValidatorStage(
    runtime,
    architect,
    critique.uiCritic,
    validatedRevision
  );
  emitStageEvent(
    emit,
    "validator_completed",
    "validator",
    summarizeValidatorResult(validator)
  );
  await persistWebsiteStep(runtime, STEP_KEYS.validator, validator);
  await persistRevisionTrace(runtime, critique.uiCritic, validatedRevision, validator);

  return validatedRevision.finalArtifactCandidate;
}

async function runArchitectStage(runtime) {
  const prompt = await loadModePrompt(MODE_NAME, "architect");

  return runWebsiteJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "architect",
    roleName: "website_architect",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      routing: runtime.routing,
      planning: runtime.planning
    },
    expectedOutput: {
      site_type: "landing",
      pages: [],
      design_system_guidance: {
        tone: "minimal",
        layout_principles: [],
        responsive_notes: []
      },
      implementation_notes: []
    }
  });
}

async function runFirstPassGeneration(runtime, architect, emit) {
  const coder = await runCoderStage(runtime, architect, {
    stageName: "coder_first_pass",
    passName: "first_pass",
    emit
  });

  return {
    coder,
    artifactCandidate: buildWebsiteArtifact(coder.parsed)
  };
}

async function runCritiqueStage(runtime, architect, firstPass) {
  const uiCritic = await runUiCriticStage(
    runtime,
    architect,
    firstPass.coder,
    firstPass.artifactCandidate
  );

  return { uiCritic };
}

async function runRevisionStage(runtime, architect, firstPass, critique, emit) {
  const plan = createRevisionPlan(critique.uiCritic);

  if (!plan.shouldRevise) {
    return {
      firstPassCoder: firstPass.coder,
      firstPassArtifactCandidate: firstPass.artifactCandidate,
      revisedCoder: null,
      finalCoder: firstPass.coder,
      finalArtifactCandidate: firstPass.artifactCandidate,
      summary: createRevisionSummary({
        plan,
        selectedStage: firstPass.coder.stage,
        revisedCoder: null
      })
    };
  }

  emitStageEvent(emit, "revision_started", "revision", "Applying UI critique revisions.");
  const revisedCoder = await runCoderStage(runtime, architect, {
    stageName: "coder_revision",
    passName: "revision",
    previousCoder: firstPass.coder,
    revisionPlan: plan,
    emit
  });
  emitStageEvent(
    emit,
    "revision_completed",
    "revision",
    `Revision completed with ${plan.issues.length} issue(s) addressed.`
  );

  return {
    firstPassCoder: firstPass.coder,
    firstPassArtifactCandidate: firstPass.artifactCandidate,
    revisedCoder,
    finalCoder: revisedCoder,
    finalArtifactCandidate: buildWebsiteArtifact(revisedCoder.parsed),
    summary: createRevisionSummary({
      plan,
      selectedStage: revisedCoder.stage,
      revisedCoder
    })
  };
}

async function runCoderStage(
  runtime,
  architect,
  {
    stageName = "coder",
    passName = "first_pass",
    previousCoder = null,
    revisionPlan = null,
    repairPrompt = "",
    emit = null
  } = {}
) {
  const prompt = await loadModePrompt(MODE_NAME, "coder");

  emitStageEvent(
    emit,
    "coder_started",
    "coder",
    summarizeCoderStart(passName, stageName)
  );

  const result = await runWebsiteJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName,
    roleName: "website_coder",
    rolePrompt: buildRetryRolePrompt({
      basePrompt: prompt,
      repairPrompt
    }),
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      routing: runtime.routing,
      planning: runtime.planning,
      architecture: architect.parsed,
      generation: createCoderGenerationInput({
        passName,
        previousCoder,
        revisionPlan
      })
    },
    expectedOutput: {
      files: [
        {
          path: "index.html",
          content: "<!doctype html><html><body></body></html>"
        }
      ],
      build_notes: [],
      known_limitations: []
    }
  });

  emitStageEvent(
    emit,
    "coder_completed",
    "coder",
    summarizeCoderResult(passName, result)
  );

  return result;
}

async function runUiCriticStage(runtime, architect, coder, artifactCandidate) {
  const prompt = await loadModePrompt(MODE_NAME, "ui_critic");

  return runWebsiteJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "ui_critic",
    roleName: "website_ui_critic",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      architecture: architect.parsed,
      implementation: artifactCandidate,
      coder_output: coder.parsed
    },
    expectedOutput: {
      issues: [],
      passes: [],
      final_recommendation: "approve"
    }
  });
}

async function runValidatorStage(
  runtime,
  architect,
  uiCritic,
  revision
) {
  const prompt = await loadRolePrompt("validator");
  const contractValidation = await validateOutput({
    mode: MODE_NAME,
    output: revision.finalArtifactCandidate
  });
  const validatorDecision = decideRevision({
    coder: revision.finalCoder,
    uiCritic,
    contractValidation,
    revision
  });

  const stage = await runWebsiteJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "validator",
    roleName: "validator",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      architecture: architect.parsed,
      implementation: revision.finalArtifactCandidate,
      coder_output: revision.finalCoder.parsed,
      first_pass_coder_output: revision.firstPassCoder.parsed,
      revised_coder_output: revision.revisedCoder?.parsed ?? null,
      ui_review: uiCritic.parsed,
      revision_summary: revision.summary,
      contract_validation: contractValidation,
      revision_signal: validatorDecision
    },
    expectedOutput: {
      status: validatorDecision.needsRevision ? "revise" : "approve",
      reasons: contractValidation.errors.map((issue) => issue.message),
      next_action: validatorDecision.needsRevision
        ? "Request a targeted revision from the coder stage."
        : "Proceed to final packaging."
    }
  });

  return {
    ...stage,
    contractValidation,
    approval: {
      ok: contractValidation.ok && !validatorDecision.needsRevision,
      recommendation: validatorDecision.needsRevision ? "revise" : "approve"
    },
    revision: {
      ...validatorDecision,
      nextTargetStage: validatorDecision.needsRevision ? "coder" : null
    }
  };
}

function buildWebsiteArtifact(coderOutput) {
  const files = normalizeFiles(coderOutput?.files);
  const outputType = detectOutputType(files);
  const entrypoints = detectEntrypoints(files, outputType);

  return {
    mode: MODE_NAME,
    output_type: outputType,
    entrypoints,
    files,
    build_notes: normalizeStringArray(coderOutput?.build_notes),
    known_limitations: normalizeStringArray(coderOutput?.known_limitations)
  };
}

function decideRevision({ coder, uiCritic, contractValidation, revision }) {
  const criticRecommendation = uiCritic?.parsed?.final_recommendation;
  const criticNeedsRevision =
    criticRecommendation === "revise" && revision?.summary?.attempts === 0;
  const coderInvalid = Boolean(coder) && !coder.ok;

  return {
    needsRevision: coderInvalid || criticNeedsRevision || !contractValidation.ok,
    reasons: [
      ...(coderInvalid ? ["coder_output_invalid"] : []),
      ...(criticNeedsRevision ? ["ui_critic_requested_revision"] : []),
      ...(!contractValidation.ok ? ["website_contract_validation_failed"] : [])
    ]
  };
}

function createRevisionPlan(uiCritic) {
  const recommendation = uiCritic?.parsed?.final_recommendation;
  const issues = normalizeCriticIssues(uiCritic?.parsed?.issues);
  const shouldRevise = recommendation === "revise" && MAX_CODER_REVISIONS > 0;
  const instructions = shouldRevise
    ? buildRevisionInstructions(issues, recommendation)
    : [];

  return {
    maxAttempts: MAX_CODER_REVISIONS,
    attempts: shouldRevise ? 1 : 0,
    recommendation: typeof recommendation === "string" ? recommendation : null,
    issues,
    instructions,
    shouldRevise
  };
}

function createRevisionSummary({ plan, selectedStage, revisedCoder }) {
  return {
    stage: "revision",
    triggered: plan.shouldRevise,
    attempts: plan.attempts,
    maxAttempts: plan.maxAttempts,
    recommendation: plan.recommendation,
    issues: plan.issues,
    instructions: plan.instructions,
    revisedCoderStage: revisedCoder?.stage ?? null,
    selectedCoderStage: selectedStage
  };
}

function createCoderGenerationInput({ passName, previousCoder, revisionPlan }) {
  if (passName === "first_pass") {
    return {
      pass: "first_pass",
      revision_count: 0,
      max_revision_count: MAX_CODER_REVISIONS
    };
  }

  if (passName === "repair") {
    return {
      pass: "repair",
      revision_count: 0,
      max_revision_count: MAX_CODER_REVISIONS,
      previous_coder_output: previousCoder?.parsed ?? null,
      contract_repair_issues: revisionPlan?.issues ?? [],
      revision_instructions: revisionPlan?.instructions ?? []
    };
  }

  return {
    pass: "revision",
    revision_count: 1,
    max_revision_count: MAX_CODER_REVISIONS,
    previous_coder_output: previousCoder?.parsed ?? null,
    critic_issues: revisionPlan?.issues ?? [],
    revision_instructions: revisionPlan?.instructions ?? []
  };
}

function normalizeCriticIssues(issues) {
  if (!Array.isArray(issues)) {
    return [];
  }

  return issues
    .map((issue, index) => stringifyCriticIssue(issue, index))
    .filter(Boolean);
}

function buildRevisionInstructions(issues, recommendation) {
  const instructions = issues.map(
    (issue, index) => `Revision ${index + 1}: Address this UI issue: ${issue}`
  );

  if (instructions.length > 0) {
    return instructions;
  }

  return recommendation === "revise"
    ? ["Revision 1: Address the UI critic feedback and improve the implementation."]
    : [];
}

function stringifyCriticIssue(issue, index) {
  if (typeof issue === "string") {
    const value = issue.trim();
    return value || null;
  }

  if (issue && typeof issue === "object") {
    const preferredFields = [
      issue.summary,
      issue.issue,
      issue.title,
      issue.description,
      issue.message
    ];

    for (const value of preferredFields) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    const serialized = JSON.stringify(issue);
    return serialized === undefined ? `Issue ${index + 1}` : serialized;
  }

  if (issue === null || issue === undefined) {
    return null;
  }

  return String(issue);
}

function normalizeFiles(files) {
  if (!Array.isArray(files)) {
    return [];
  }

  return files
    .filter((file) => typeof file?.path === "string" && typeof file?.content === "string")
    .map((file) => ({
      path: file.path.trim(),
      content: file.content
    }))
    .filter((file) => file.path && file.content);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function detectOutputType(files) {
  const filePaths = new Set(files.map((file) => file.path));
  const hasReactEntrypoint = REACT_RUNTIME_ENTRYPOINT_CANDIDATES.some((path) =>
    filePaths.has(path)
  );
  const hasPackageJson = filePaths.has("package.json");

  if (hasPackageJson && hasReactEntrypoint) {
    return "react_vite_app";
  }

  return DEFAULT_OUTPUT_TYPE;
}

function detectEntrypoints(files, outputType) {
  const candidates =
    outputType === "react_vite_app"
      ? REACT_ENTRYPOINT_CANDIDATES
      : STATIC_ENTRYPOINT_CANDIDATES;
  const available = new Set(files.map((file) => file.path));
  const entrypoints = candidates.filter((path) => available.has(path));

  if (entrypoints.length > 0) {
    return entrypoints;
  }

  return files.length > 0 ? [files[0].path] : [];
}

async function runWebsiteJsonStage({
  runtime,
  modeName,
  stageName,
  roleName,
  rolePrompt,
  input,
  expectedOutput
}) {
  const maxAttempts = getRetryLimit(runtime, RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT);
  let attempt = 1;
  let stage = null;

  while (attempt <= maxAttempts) {
    const promptForAttempt =
      attempt === 1
        ? rolePrompt
        : buildRetryRolePrompt({
            basePrompt: rolePrompt,
            retryInstruction: buildRetryPolicyInstruction(
              runtime,
              RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT,
              { stage: stageName, roleName }
            ),
            repairPrompt: buildInvalidJsonRepairPrompt({
              roleName,
              rawOutput: stage?.run?.stdout ?? "",
              expectedSchemaSummary: safeSerialize(expectedOutput)
            })
          });

    stage = await runJsonStage({
      runtime,
      modeName,
      stageName,
      roleName,
      rolePrompt: promptForAttempt,
      input,
      expectedOutput
    });
    stage.retry = createRetryState(attempt, maxAttempts);

    if (!shouldRetryInvalidJson(runtime, stage, attempt)) {
      return stage;
    }

    await persistRetryFailure(runtime, {
      stageName,
      errorType: RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT,
      attempt,
      failure: {
        roleName,
        rawOutput: stage.run?.stdout ?? "",
        stderr: stage.run?.stderr ?? "",
        validation: stage.validation
      }
    });

    attempt += 1;
  }

  return stage;
}

async function retryRevisionForValidatorFailure(runtime, architect, revision, emit) {
  const maxAttempts = getRetryLimit(
    runtime,
    RETRY_ERROR_TYPES.CONTRACT_VALIDATION_FAILURE
  );
  let attempt = 1;
  let currentRevision = revision;
  let contractValidation = await validateOutput({
    mode: MODE_NAME,
    output: currentRevision.finalArtifactCandidate
  });

  while (
    !contractValidation.ok &&
    shouldRetryWithPolicy(
      runtime,
      RETRY_ERROR_TYPES.CONTRACT_VALIDATION_FAILURE,
      attempt
    ) &&
    attempt <= maxAttempts
  ) {
    await persistRetryFailure(runtime, {
      stageName: currentRevision.finalCoder?.stage ?? STEP_KEYS.coderFinal,
      errorType: RETRY_ERROR_TYPES.CONTRACT_VALIDATION_FAILURE,
      attempt,
      failure: {
        rawOutput: currentRevision.finalCoder?.run?.stdout ?? "",
        previousOutput: currentRevision.finalCoder?.parsed ?? null,
        artifactCandidate: currentRevision.finalArtifactCandidate,
        validation: contractValidation
      }
    });

    const repairedCoder = await runCoderStage(runtime, architect, {
      stageName: buildContractRetryStageName(attempt),
      passName: "repair",
      previousCoder: currentRevision.finalCoder,
      revisionPlan: createContractRepairPlan(contractValidation),
      emit,
      repairPrompt: buildRetryRolePrompt({
        basePrompt: "",
        retryInstruction: buildRetryPolicyInstruction(
          runtime,
          RETRY_ERROR_TYPES.CONTRACT_VALIDATION_FAILURE,
          contractValidation.errors
        ),
        repairPrompt: buildContractRepairPrompt({
          roleName: "website_coder",
          violations: contractValidation.errors,
          previousOutput:
            currentRevision.finalCoder?.parsed ??
            currentRevision.finalCoder?.run?.stdout ??
            null
        })
      })
    });

    currentRevision = {
      ...currentRevision,
      validatorRetryCoder: repairedCoder,
      finalCoder: repairedCoder,
      finalArtifactCandidate: buildWebsiteArtifact(repairedCoder.parsed),
      summary: {
        ...currentRevision.summary,
        validator_repair_attempts: attempt,
        validator_repair_stage: repairedCoder.stage
      }
    };
    contractValidation = await validateOutput({
      mode: MODE_NAME,
      output: currentRevision.finalArtifactCandidate
    });
    attempt += 1;
  }

  return {
    ...currentRevision,
    contractValidation
  };
}

async function persistRevisionArtifacts(runtime, revision) {
  await persistWebsiteStep(runtime, STEP_KEYS.revisionSummary, revision.summary);

  if (revision.revisedCoder) {
    await persistWebsiteStep(runtime, STEP_KEYS.coderRevision, revision.revisedCoder);
  }

  if (revision.validatorRetryCoder) {
    await persistWebsiteStep(runtime, revision.validatorRetryCoder.stage, revision.validatorRetryCoder);
  }

  await persistWebsiteStep(runtime, STEP_KEYS.coderFinal, revision.finalCoder);
}

async function persistRevisionTrace(runtime, uiCritic, revision, validator) {
  if (!revision?.revisedCoder) {
    return null;
  }

  const previousFiles = revision.firstPassArtifactCandidate?.files ?? [];
  const revisedFiles = revision.finalArtifactCandidate?.files ?? [];
  const artifactDiff = diffFileArtifacts(previousFiles, revisedFiles);
  const trace = buildRevisionTrace({
    mode: MODE_NAME,
    criticResult: uiCritic,
    revisionInstruction: revision.summary?.instructions ?? [],
    previousArtifact: revision.firstPassArtifactCandidate,
    revisedArtifact: revision.finalArtifactCandidate,
    validatorResult: validator,
    metadata: buildRevisionTraceMetadata(runtime, artifactDiff)
  });

  await persistWebsiteStep(runtime, STEP_KEYS.revisionTrace, trace);
  return trace;
}

async function persistWebsiteStep(runtime, stepName, data) {
  return runtime.save(stepName, data);
}

async function persistRetryFailure(runtime, { stageName, errorType, attempt, failure }) {
  return persistWebsiteStep(
    runtime,
    buildRetryFailureStepKey(stageName, errorType, attempt),
    failure
  );
}

function shouldRetryInvalidJson(runtime, stage, attempt) {
  return (
    hasInvalidJsonFailure(stage?.validation) &&
    shouldRetryWithPolicy(runtime, RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT, attempt)
  );
}

function shouldRetryWithPolicy(runtime, errorType, attempt) {
  if (runtime.retryPolicy?.shouldRetry) {
    return runtime.retryPolicy.shouldRetry(errorType, attempt);
  }

  return false;
}

function getRetryLimit(runtime, errorType) {
  if (runtime.retryPolicy?.maxAttemptsFor) {
    return runtime.retryPolicy.maxAttemptsFor(errorType);
  }

  return runtime.retryPolicy?.maxAttempts ?? 1;
}

function hasInvalidJsonFailure(validation) {
  return Boolean(
    validation?.errors?.some((issue) =>
      ["invalid_json_input", "empty_json_input", "invalid_json"].includes(issue?.code)
    )
  );
}

function buildRetryFailureStepKey(stageName, errorType, attempt) {
  return `${normalizeStepKey(stageName)}_${normalizeStepKey(errorType)}_attempt_${attempt}_failed`;
}

function buildContractRetryStageName(attempt) {
  return `coder_validator_retry_${attempt}`;
}

function buildRetryRolePrompt({ basePrompt, retryInstruction, repairPrompt }) {
  return [basePrompt, retryInstruction, repairPrompt].filter(Boolean).join("\n\n");
}

function buildRetryPolicyInstruction(runtime, errorType, details) {
  if (!runtime.retryPolicy?.buildRetryInstruction) {
    return "";
  }

  return runtime.retryPolicy.buildRetryInstruction(errorType, details);
}

function createRetryState(attempts, maxAttempts) {
  return {
    attempts,
    maxAttempts,
    exhausted: attempts >= maxAttempts
  };
}

function createContractRepairPlan(contractValidation) {
  const issues = contractValidation?.errors?.map((issue) => issue.message).filter(Boolean) ?? [];

  return {
    maxAttempts: 1,
    attempts: 1,
    recommendation: "repair_contract",
    issues,
    instructions: issues,
    shouldRevise: true
  };
}

function buildRevisionTraceMetadata(runtime, artifactDiff) {
  return {
    created_at: new Date().toISOString(),
    run_id: runtime.runState?.runId ?? null,
    trace_scope: "single_revision",
    source_step_name: STEP_KEYS.coderFirstPass,
    source_step_type: "agent",
    source_step: {
      selection: buildRevisionTraceSelection(artifactDiff)
    }
  };
}

function buildRevisionTraceSelection(artifactDiff) {
  const summaries = Array.isArray(artifactDiff?.per_file_summary)
    ? artifactDiff.per_file_summary
    : [];

  return summaries
    .filter((entry) => entry?.content_changed)
    .map((entry) => ({
      artifact_type: "file",
      path: entry.path,
      note: entry.summary
    }));
}

function normalizeStepKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeSerialize(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(error?.message ?? error ?? "");
  }
}

function createModeEventEmitter(onEvent, runtime) {
  return (eventType, payload = {}) => {
    if (typeof onEvent !== "function") {
      return;
    }

    onEvent({
      type: eventType,
      mode: MODE_NAME,
      runId: runtime.runState?.runId ?? null,
      timestamp: new Date().toISOString(),
      ...payload
    });
  };
}

function emitStageEvent(emit, type, step, summary) {
  if (typeof emit !== "function") {
    return;
  }

  emit(type, {
    step,
    summary
  });
}

function summarizeArchitectResult(stage) {
  const pageCount = Array.isArray(stage?.parsed?.pages) ? stage.parsed.pages.length : 0;
  return `Architecture completed with ${pageCount} planned page(s).`;
}

function summarizeCoderStart(passName, stageName) {
  if (passName === "revision") {
    return `Running coder revision via "${stageName}".`;
  }

  if (passName === "repair") {
    return `Running coder repair via "${stageName}".`;
  }

  return "Running initial coder pass.";
}

function summarizeCoderResult(passName, stage) {
  const fileCount = Array.isArray(stage?.parsed?.files) ? stage.parsed.files.length : 0;

  if (passName === "revision") {
    return `Coder revision completed with ${fileCount} file(s).`;
  }

  if (passName === "repair") {
    return `Coder repair completed with ${fileCount} file(s).`;
  }

  return `Coder completed first pass with ${fileCount} file(s).`;
}

function summarizeCritiqueResult(stage) {
  const issueCount = Array.isArray(stage?.parsed?.issues) ? stage.parsed.issues.length : 0;
  const recommendation = stage?.parsed?.final_recommendation ?? "unknown";
  return `UI critique completed with ${issueCount} issue(s); recommendation: ${recommendation}.`;
}

function summarizeValidatorResult(stage) {
  const recommendation = stage?.approval?.recommendation ?? "unknown";
  const errorCount = stage?.contractValidation?.errors?.length ?? 0;
  return `Validator completed with recommendation "${recommendation}" and ${errorCount} contract issue(s).`;
}

export const websiteModeStageOrder = STAGE_ORDER;
