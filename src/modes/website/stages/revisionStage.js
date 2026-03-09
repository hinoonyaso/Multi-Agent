import { validateOutput } from "../../../core/validator.js";
import { buildContractRepairPrompt } from "../../../core/repairPromptBuilder.js";
import { buildRevisionTrace } from "../../../core/revisionTraceBuilder.js";
import { diffFileArtifacts } from "../../../core/artifactDiff.js";
import {
  MODE_NAME,
  MAX_CODER_REVISIONS,
  STEP_KEYS,
  RETRY_ERROR_TYPES,
  buildWebsiteArtifact,
  normalizeCriticIssues,
  buildRevisionInstructions,
  buildRetryRolePrompt,
  buildRetryPolicyInstruction,
  buildContractRetryStageName,
  createContractRepairPlan,
  persistWebsiteStep,
  persistRetryFailure,
  shouldRetryWithPolicy,
  getRetryLimit,
  createFollowUpUiCritic,
  createFollowUpRevisionSummary,
  emitStageEvent
} from "./shared.js";
import { runCoderStage } from "./coderStage.js";

export async function revisionNodeRunner(ctx) {
  let revision;

  if (ctx.followUpArtifact) {
    const firstPass = ctx.firstPass;
    await persistWebsiteStep(ctx.runtime, STEP_KEYS.uiCritic, ctx.uiCritic ?? createFollowUpUiCritic());
    emitStageEvent(
      ctx.emit,
      "ui_critic_completed",
      "ui_critic",
      ctx.uiCritic?.parsed?.final_recommendation === "revise"
        ? "Lightweight critic found issues."
        : "Follow-up lightweight critique passed."
    );
    revision = {
      firstPassCoder: firstPass.coder,
      firstPassArtifactCandidate: ctx.followUpArtifact,
      revisedCoder: null,
      finalCoder: firstPass.coder,
      finalArtifactCandidate: firstPass.artifactCandidate,
      summary: createFollowUpRevisionSummary(ctx.followUpArtifact, firstPass.artifactCandidate)
    };
  } else {
    revision = await runRevisionStage(
      ctx.runtime,
      ctx.architect,
      ctx.firstPass,
      { uiCritic: ctx.uiCritic },
      ctx.emit
    );
  }

  const validatedRevision = await retryRevisionForValidatorFailure(
    ctx.runtime,
    ctx.architect,
    revision,
    ctx.emit
  );
  await persistRevisionArtifacts(ctx.runtime, validatedRevision);
  return validatedRevision;
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
      summary: createRevisionSummary({ plan, selectedStage: firstPass.coder.stage, revisedCoder: null })
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
  emitStageEvent(emit, "revision_completed", "revision", `Revision completed with ${plan.issues.length} issue(s) addressed.`);

  return {
    firstPassCoder: firstPass.coder,
    firstPassArtifactCandidate: firstPass.artifactCandidate,
    revisedCoder,
    finalCoder: revisedCoder,
    finalArtifactCandidate: buildWebsiteArtifact(revisedCoder.parsed),
    summary: createRevisionSummary({ plan, selectedStage: revisedCoder.stage, revisedCoder })
  };
}

export async function retryRevisionForValidatorFailure(runtime, architect, revision, emit) {
  const maxAttempts = getRetryLimit(runtime, RETRY_ERROR_TYPES.CONTRACT_VALIDATION_FAILURE);
  let attempt = 1;
  let currentRevision = revision;
  let contractValidation = await validateOutput({
    mode: MODE_NAME,
    output: currentRevision.finalArtifactCandidate
  });

  while (
    !contractValidation.ok &&
    shouldRetryWithPolicy(runtime, RETRY_ERROR_TYPES.CONTRACT_VALIDATION_FAILURE, attempt) &&
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
            currentRevision.finalCoder?.parsed ?? currentRevision.finalCoder?.run?.stdout ?? null
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
    contractValidation = await validateOutput({ mode: MODE_NAME, output: currentRevision.finalArtifactCandidate });
    attempt += 1;
  }

  return { ...currentRevision, contractValidation };
}

export async function persistRevisionArtifacts(runtime, revision) {
  await persistWebsiteStep(runtime, STEP_KEYS.revisionSummary, revision.summary);
  if (revision.revisedCoder) {
    await persistWebsiteStep(runtime, STEP_KEYS.coderRevision, revision.revisedCoder);
  }
  if (revision.validatorRetryCoder) {
    await persistWebsiteStep(runtime, revision.validatorRetryCoder.stage, revision.validatorRetryCoder);
  }
  await persistWebsiteStep(runtime, STEP_KEYS.coderFinal, revision.finalCoder);
}

export async function persistRevisionTrace(runtime, uiCritic, revision, validator) {
  if (!revision?.revisedCoder) return null;
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

function createRevisionPlan(uiCritic) {
  const recommendation = uiCritic?.parsed?.final_recommendation;
  const issues = normalizeCriticIssues(uiCritic?.parsed?.issues);
  const shouldRevise = recommendation === "revise" && MAX_CODER_REVISIONS > 0;
  return {
    maxAttempts: MAX_CODER_REVISIONS,
    attempts: shouldRevise ? 1 : 0,
    recommendation: typeof recommendation === "string" ? recommendation : null,
    issues,
    instructions: shouldRevise ? buildRevisionInstructions(issues, recommendation) : [],
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

function buildRevisionTraceMetadata(runtime, artifactDiff) {
  return {
    created_at: new Date().toISOString(),
    run_id: runtime.runState?.runId ?? null,
    trace_scope: "single_revision",
    source_step_name: STEP_KEYS.coderFirstPass,
    source_step_type: "agent",
    source_step: { selection: buildRevisionTraceSelection(artifactDiff) }
  };
}

function buildRevisionTraceSelection(artifactDiff) {
  const summaries = Array.isArray(artifactDiff?.per_file_summary) ? artifactDiff.per_file_summary : [];
  return summaries
    .filter((e) => e?.content_changed)
    .map((e) => ({ artifact_type: "file", path: e.path, note: e.summary }));
}

export { createRevisionPlan, createRevisionSummary };
