import {
  loadModePrompt,
  loadRolePrompt
} from "../../core/promptLoader.js";
import {
  parseJsonSafely,
  validateOutput
} from "../../core/validator.js";
import {
  createModeRuntime,
  runJsonStage
} from "../shared/pipeline.js";

const MODE_NAME = "website";
const DEFAULT_OUTPUT_TYPE = "static_html_css_js";
const STAGE_ORDER = [
  "architect",
  "coder",
  "ui_critic",
  "validator",
  "finalizer"
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

  const architect = await runArchitectStage(runtime);
  await runtime.save("architect", architect);

  const coder = await runCoderStage(runtime, architect);
  await runtime.save("coder", coder);

  const artifactCandidate = buildWebsiteArtifact(coder.parsed);
  const uiCritic = await runUiCriticStage(runtime, architect, coder, artifactCandidate);
  await runtime.save("ui_critic", uiCritic);

  const validator = await runValidatorStage(
    runtime,
    architect,
    coder,
    uiCritic,
    artifactCandidate
  );
  await runtime.save("validator", validator);

  const finalizer = await runFinalizerStage(runtime, artifactCandidate, validator);
  await runtime.save("finalizer", finalizer);

  return extractFinalArtifact(finalizer.parsed) ?? artifactCandidate;
}

async function runArchitectStage(runtime) {
  const prompt = await loadModePrompt(MODE_NAME, "architect");

  return runJsonStage({
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

async function runCoderStage(runtime, architect) {
  const prompt = await loadModePrompt(MODE_NAME, "coder");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "coder",
    roleName: "website_coder",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      routing: runtime.routing,
      planning: runtime.planning,
      architecture: architect.parsed
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
}

async function runUiCriticStage(runtime, architect, coder, artifactCandidate) {
  const prompt = await loadModePrompt(MODE_NAME, "ui_critic");

  return runJsonStage({
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
  coder,
  uiCritic,
  artifactCandidate
) {
  const prompt = await loadRolePrompt("validator");
  const contractValidation = await validateOutput({
    mode: MODE_NAME,
    output: artifactCandidate
  });
  const validatorDecision = decideRevision({
    coder,
    uiCritic,
    contractValidation
  });

  const stage = await runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "validator",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      architecture: architect.parsed,
      implementation: artifactCandidate,
      coder_output: coder.parsed,
      ui_review: uiCritic.parsed,
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
      // TODO: Use retryPolicy plus stage-specific patching to drive automatic
      // critique-informed revisions instead of only emitting a placeholder.
      nextTargetStage: validatorDecision.needsRevision ? "coder" : null
    }
  };
}

async function runFinalizerStage(runtime, artifactCandidate, validator) {
  const prompt = await loadRolePrompt("finalizer");
  const deliverableType = artifactCandidate.files.length > 1 ? "bundle" : "file";

  const stage = await runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "finalizer",
    roleName: "finalizer",
    rolePrompt: prompt,
    input: {
      userRequest: runtime.input.userRequest,
      selectedMode: MODE_NAME,
      approvedDraft: artifactCandidate,
      validation: {
        contract: validator.contractValidation,
        recommendation: validator.approval
      }
    },
    expectedOutput: {
      final_mode: MODE_NAME,
      deliverables: [
        {
          name: "website-artifact",
          type: deliverableType,
          content: JSON.stringify(artifactCandidate, null, 2)
        }
      ],
      delivery_notes: []
    }
  });

  return {
    ...stage,
    artifact: extractFinalArtifact(stage.parsed) ?? artifactCandidate,
    revision: {
      needsRevision: false,
      reason: null,
      // TODO: Route packaging failures back through validator once finalizer
      // outputs are contract-checked independently.
      nextTargetStage: null
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

function extractFinalArtifact(finalizerOutput) {
  if (!finalizerOutput || !Array.isArray(finalizerOutput.deliverables)) {
    return null;
  }

  for (const deliverable of finalizerOutput.deliverables) {
    if (typeof deliverable?.content !== "string") {
      continue;
    }

    const parsed = parseJsonSafely(deliverable.content);

    if (parsed.ok && isWebsiteArtifact(parsed.value)) {
      return parsed.value;
    }
  }

  return null;
}

function decideRevision({ coder, uiCritic, contractValidation }) {
  const criticRecommendation = uiCritic?.parsed?.final_recommendation;
  const criticNeedsRevision = criticRecommendation === "revise";
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

function isWebsiteArtifact(value) {
  return value?.mode === MODE_NAME && Array.isArray(value?.files);
}

export const websiteModeStageOrder = STAGE_ORDER;
