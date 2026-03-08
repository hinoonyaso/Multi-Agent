import {
  loadAgentPrompt,
  loadModePrompt,
  loadRolePrompt
} from "../../../core/promptLoader.js";
import { getAgent } from "../../../agents/registry.js";
import {
  buildContractRepairPrompt,
  buildInvalidJsonRepairPrompt
} from "../../../core/repairPromptBuilder.js";
import { RETRY_ERROR_TYPES } from "../../../core/retryPolicy.js";
import { runJsonStage } from "../../shared/pipeline.js";

export { getAgent, loadAgentPrompt, loadModePrompt, loadRolePrompt, RETRY_ERROR_TYPES };

export const MODE_NAME = "website";
export const DEFAULT_OUTPUT_TYPE = "static_html_css_js";
export const MAX_CODER_REVISIONS = 1;
export const STEP_KEYS = Object.freeze({
  architect: "architect",
  coderFirstPass: "coder_first_pass",
  uiCritic: "ui_critic",
  revisionSummary: "revision_summary",
  revisionTrace: "revision_trace",
  coderRevision: "coder_revision",
  coderFinal: "coder_final",
  validator: "validator"
});
export const STAGE_ORDER = ["architect", "coder_first_pass", "ui_critic", "revision", "validator"];
export const STATIC_ENTRYPOINT_CANDIDATES = ["index.html", "main.html", "app.html"];
export const REACT_RUNTIME_ENTRYPOINT_CANDIDATES = [
  "src/main.tsx",
  "src/main.jsx",
  "src/main.js",
  "src/main.ts"
];
export const REACT_ENTRYPOINT_CANDIDATES = [...REACT_RUNTIME_ENTRYPOINT_CANDIDATES, "index.html"];

// ---------------------------------------------------------------------------
// JSON stage runner
// ---------------------------------------------------------------------------

export async function runWebsiteJsonStage({
  runtime,
  modeName,
  stageName,
  roleName,
  rolePrompt,
  input,
  expectedOutput,
  agent = null
}) {
  const runtimeLimit = getRetryLimit(runtime, RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT);
  const agentLimit = agent?.retryPolicy?.[RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT];
  const maxAttempts = agentLimit ?? runtimeLimit;
  const retryConfig = {
    errorType: RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT,
    maxAttempts,
    onRetry: async (attempt, failure) => {
      await persistRetryFailure(runtime, {
        stageName,
        errorType: RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT,
        attempt,
        failure: {
          roleName,
          rawOutput: failure?.run?.stdout ?? "",
          stderr: failure?.run?.stderr ?? "",
          validation: failure?.validation
        }
      });
    },
    buildRepairPrompt: (stage) =>
      buildRetryRolePrompt({
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
      })
  };

  return runJsonStage({
    runtime,
    modeName,
    stageName,
    roleName,
    rolePrompt,
    input,
    expectedOutput,
    retryConfig,
    agent
  });
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

export async function persistWebsiteStep(runtime, stepName, data) {
  return runtime.save(stepName, data);
}

export async function persistRetryFailure(runtime, { stageName, errorType, attempt, failure }) {
  return persistWebsiteStep(
    runtime,
    buildRetryFailureStepKey(stageName, errorType, attempt),
    failure
  );
}

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------

export function shouldRetryWithPolicy(runtime, errorType, attempt) {
  return runtime.retryPolicy?.shouldRetry?.(errorType, attempt) ?? false;
}

export function getRetryLimit(runtime, errorType) {
  if (runtime.retryPolicy?.maxAttemptsFor) return runtime.retryPolicy.maxAttemptsFor(errorType);
  return runtime.retryPolicy?.maxAttempts ?? 1;
}

export function buildRetryRolePrompt({ basePrompt, retryInstruction, repairPrompt }) {
  return [basePrompt, retryInstruction, repairPrompt].filter(Boolean).join("\n\n");
}

export function buildRetryPolicyInstruction(runtime, errorType, details) {
  return runtime.retryPolicy?.buildRetryInstruction?.(errorType, details) ?? "";
}

export function buildRetryFailureStepKey(stageName, errorType, attempt) {
  return `${normalizeStepKey(stageName)}_${normalizeStepKey(errorType)}_attempt_${attempt}_failed`;
}

export function buildContractRetryStageName(attempt) {
  return `coder_validator_retry_${attempt}`;
}

export function createContractRepairPlan(contractValidation) {
  const issues = contractValidation?.errors?.map((i) => i.message).filter(Boolean) ?? [];
  return { maxAttempts: 1, attempts: 1, recommendation: "repair_contract", issues, instructions: issues, shouldRevise: true };
}

// ---------------------------------------------------------------------------
// Artifact helpers
// ---------------------------------------------------------------------------

export function buildWebsiteArtifact(coderOutput) {
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

export function detectOutputType(files) {
  const filePaths = new Set(files.map((f) => f.path));
  const hasReactEntrypoint = REACT_RUNTIME_ENTRYPOINT_CANDIDATES.some((p) => filePaths.has(p));
  if (filePaths.has("package.json") && hasReactEntrypoint) return "react_vite_app";
  return DEFAULT_OUTPUT_TYPE;
}

export function detectEntrypoints(files, outputType) {
  const candidates = outputType === "react_vite_app" ? REACT_ENTRYPOINT_CANDIDATES : STATIC_ENTRYPOINT_CANDIDATES;
  const available = new Set(files.map((f) => f.path));
  const found = candidates.filter((p) => available.has(p));
  return found.length > 0 ? found : files.length > 0 ? [files[0].path] : [];
}

// ---------------------------------------------------------------------------
// Follow-up helpers
// ---------------------------------------------------------------------------

export function sanitizeFollowUpArtifact(previousArtifact) {
  if (!previousArtifact || typeof previousArtifact !== "object") return null;
  const files = normalizeFiles(previousArtifact.files);
  if (files.length === 0) return null;
  return {
    mode: typeof previousArtifact.mode === "string" ? previousArtifact.mode : MODE_NAME,
    output_type:
      typeof previousArtifact.output_type === "string"
        ? previousArtifact.output_type
        : detectOutputType(files),
    entrypoints: Array.isArray(previousArtifact.entrypoints)
      ? previousArtifact.entrypoints.filter((e) => typeof e === "string" && e.trim())
      : detectEntrypoints(
          files,
          typeof previousArtifact.output_type === "string"
            ? previousArtifact.output_type
            : detectOutputType(files)
        ),
    files,
    build_notes: normalizeStringArray(previousArtifact.build_notes),
    known_limitations: normalizeStringArray(previousArtifact.known_limitations)
  };
}

export function getFollowUpContext(input) {
  const previousArtifact = sanitizeFollowUpArtifact(input?.previousArtifact);
  const previousRunId =
    typeof input?.previousRunId === "string" && input.previousRunId.trim()
      ? input.previousRunId.trim()
      : null;
  const previousRequest =
    typeof input?.previousRequest === "string" && input.previousRequest.trim()
      ? input.previousRequest.trim()
      : null;
  return {
    previousRequest,
    previousRun:
      previousArtifact || previousRunId || previousRequest
        ? {
            run_id: previousRunId,
            user_request: previousRequest,
            artifact_summary: previousArtifact
              ? {
                  mode: previousArtifact.mode ?? null,
                  output_type: previousArtifact.output_type ?? null,
                  entrypoints: previousArtifact.entrypoints ?? [],
                  file_paths: previousArtifact.files.map((f) => f.path)
                }
              : null
          }
        : null
  };
}

export function createFollowUpUiCritic() {
  return {
    stage: "ui_critic",
    ok: true,
    parsed: {
      issues: [],
      passes: ["Follow-up fast path reused the previous artifact and skipped a separate critique pass."],
      final_recommendation: "approve"
    }
  };
}

export function createFollowUpRevisionSummary(previousArtifact, nextArtifact) {
  const previousFiles = Array.isArray(previousArtifact?.files) ? previousArtifact.files.length : 0;
  const nextFiles = Array.isArray(nextArtifact?.files) ? nextArtifact.files.length : 0;
  return {
    stage: "revision",
    triggered: true,
    attempts: 1,
    maxAttempts: MAX_CODER_REVISIONS,
    recommendation: "approve",
    issues: [],
    instructions: ["Apply the user's follow-up request as a targeted update while preserving the existing implementation."],
    revisedCoderStage: "coder_first_pass",
    selectedCoderStage: "coder_first_pass",
    notes: [`Follow-up update adjusted ${previousFiles} existing file(s) into ${nextFiles} output file(s).`]
  };
}

// ---------------------------------------------------------------------------
// Critic/revision helpers
// ---------------------------------------------------------------------------

export function normalizeCriticIssues(issues) {
  if (!Array.isArray(issues)) return [];
  return issues.map((issue, i) => stringifyCriticIssue(issue, i)).filter(Boolean);
}

export function buildRevisionInstructions(issues, recommendation) {
  const instructions = issues.map((issue, i) => `Revision ${i + 1}: Address this UI issue: ${issue}`);
  if (instructions.length > 0) return instructions;
  return recommendation === "revise"
    ? ["Revision 1: Address the UI critic feedback and improve the implementation."]
    : [];
}

export function stringifyCriticIssue(issue, index) {
  if (typeof issue === "string") return issue.trim() || null;
  if (issue && typeof issue === "object") {
    for (const v of [issue.summary, issue.issue, issue.title, issue.description, issue.message]) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    const s = JSON.stringify(issue);
    return s === undefined ? `Issue ${index + 1}` : s;
  }
  if (issue === null || issue === undefined) return null;
  return String(issue);
}

export function createCoderGenerationInput({ passName, previousCoder, revisionPlan, followUpArtifact }) {
  if (passName === "first_pass") {
    if (followUpArtifact) {
      return {
        pass: "follow_up_revision",
        revision_count: 0,
        max_revision_count: MAX_CODER_REVISIONS,
        preserve_existing_files: true,
        requested_change_scope: "targeted_update",
        previous_artifact: followUpArtifact
      };
    }
    return { pass: "first_pass", revision_count: 0, max_revision_count: MAX_CODER_REVISIONS };
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

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

export function normalizeFiles(files) {
  if (!Array.isArray(files)) return [];
  return files
    .filter((f) => typeof f?.path === "string" && typeof f?.content === "string")
    .map((f) => ({ path: f.path.trim(), content: f.content }))
    .filter((f) => f.path && f.content);
}

export function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((e) => typeof e === "string").map((e) => e.trim()).filter(Boolean);
}

export function normalizeStepKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function safeSerialize(value) {
  try { return JSON.stringify(value); } catch (e) { return String(e?.message ?? e ?? ""); }
}

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

export function createModeEventEmitter(onEvent, runtime) {
  return (eventType, payload = {}) => {
    if (typeof onEvent !== "function") return;
    onEvent({
      type: eventType,
      mode: MODE_NAME,
      runId: runtime.runState?.runId ?? null,
      timestamp: new Date().toISOString(),
      ...payload
    });
  };
}

export function emitStageEvent(emit, type, step, summary) {
  if (typeof emit !== "function") return;
  emit(type, { step, summary });
}

// ---------------------------------------------------------------------------
// Summary helpers
// ---------------------------------------------------------------------------

export function summarizeArchitectResult(stage) {
  const pageCount = Array.isArray(stage?.parsed?.pages) ? stage.parsed.pages.length : 0;
  return `Architecture completed with ${pageCount} planned page(s).`;
}

export function summarizeCoderStart(passName, stageName) {
  if (passName === "revision") return `Running coder revision via "${stageName}".`;
  if (passName === "repair") return `Running coder repair via "${stageName}".`;
  return "Running initial coder pass.";
}

export function summarizeCoderResult(passName, stage) {
  const fileCount = Array.isArray(stage?.parsed?.files) ? stage.parsed.files.length : 0;
  if (passName === "revision") return `Coder revision completed with ${fileCount} file(s).`;
  if (passName === "repair") return `Coder repair completed with ${fileCount} file(s).`;
  return `Coder completed first pass with ${fileCount} file(s).`;
}

export function summarizeCritiqueResult(stage) {
  const issueCount = Array.isArray(stage?.parsed?.issues) ? stage.parsed.issues.length : 0;
  const recommendation = stage?.parsed?.final_recommendation ?? "unknown";
  return `UI critique completed with ${issueCount} issue(s); recommendation: ${recommendation}.`;
}

export function summarizeValidatorResult(stage) {
  const recommendation = stage?.approval?.recommendation ?? "unknown";
  const errorCount = stage?.contractValidation?.errors?.length ?? 0;
  return `Validator completed with recommendation "${recommendation}" and ${errorCount} contract issue(s).`;
}

export { buildContractRepairPrompt };
