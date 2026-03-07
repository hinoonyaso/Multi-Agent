import { createCodexRunner } from "./codexRunner.js";
import { loadPrompt } from "./promptLoader.js";
import { createRetryPolicy } from "./retryPolicy.js";
import { selectModePipeline } from "./router.js";
import { createStateStore } from "./stateStore.js";
import { validateOutput } from "./validator.js";

const CORE_SYSTEM_PROMPT_PATH = "core/system.txt";
const ROUTER_PROMPT_PATH = "roles/router.txt";
const PLANNER_PROMPT_PATH = "roles/planner.txt";
const FINALIZER_PROMPT_PATH = "roles/finalizer.txt";
const DEFAULT_MODE = "website";

export async function runPipeline({ userRequest, modeHint, workingDir } = {}) {
  return runPipelineInternal(
    normalizePipelineInput({ userRequest, modeHint, workingDir }),
    createDefaultDependencies()
  );
}

export function createOrchestrator(overrides = {}) {
  const dependencies = createDefaultDependencies(overrides);

  return {
    async run(input = {}) {
      return runPipelineInternal(normalizeLegacyInput(input), dependencies);
    }
  };
}

async function runPipelineInternal(input, dependencies) {
  const { codexRunner, retryPolicy, stateStore } = dependencies;
  const coreSystemPrompt = await loadPrompt(CORE_SYSTEM_PROMPT_PATH);

  stateStore.set("lastRun", {
    input,
    startedAt: new Date().toISOString()
  });

  // Routing: ask the router role to choose the most appropriate mode before
  // any downstream work starts. The current runner is a placeholder, so mode
  // extraction falls back to the caller-provided hint when needed.
  const routing = await executeWithRetry({
    stageName: "router",
    retryPolicy,
    operation: () =>
      runRoutingStage({
        codexRunner,
        coreSystemPrompt,
        input
      })
  });
  stateStore.set("routing", routing);

  const selectedMode = resolveSelectedMode({
    routing,
    modeHint: input.modeHint
  });
  const modePipeline = selectModePipeline(selectedMode);

  // Planning: ask the planner role for execution structure after routing has
  // resolved the target mode. Detailed plan enforcement remains a TODO.
  const planning = await executeWithRetry({
    stageName: "planner",
    retryPolicy,
    operation: () =>
      runPlanningStage({
        codexRunner,
        coreSystemPrompt,
        input,
        routing,
        selectedMode
      })
  });
  stateStore.set("planning", planning);

  // Pipeline execution: hand the shared orchestration context to the selected
  // mode pipeline. Mode-specific agents and artifact generation stay inside the
  // mode modules rather than being hardcoded here.
  const pipelineResult = await modePipeline({
    input: {
      ...input,
      mode: selectedMode
    },
    routing,
    planning,
    stateStore,
    codexRunner,
    retryPolicy,
    systemPrompt: coreSystemPrompt
  });
  stateStore.set("pipelineResult", pipelineResult);

  // Validation: keep contract checks behind the validator helper so this file
  // only coordinates the stage ordering. Strict schema enforcement is a TODO.
  const validation = await validateOutput({
    mode: selectedMode,
    output: pipelineResult
  });
  stateStore.set("validation", validation);

  // Finalization: package the run into a stable return shape. The finalizer
  // prompt is loaded through the prompt loader so prompt text stays external.
  const finalization = await finalizeRun({
    codexRunner,
    coreSystemPrompt,
    input,
    selectedMode,
    routing,
    planning,
    pipelineResult,
    validation,
    stateStore
  });
  stateStore.set("finalization", finalization);

  return finalization;
}

function createDefaultDependencies(overrides = {}) {
  return {
    codexRunner: overrides.codexRunner ?? createCodexRunner(),
    retryPolicy: overrides.retryPolicy ?? createRetryPolicy(),
    stateStore: overrides.stateStore ?? createStateStore()
  };
}

function normalizePipelineInput({ userRequest, modeHint, workingDir } = {}) {
  return {
    userRequest: userRequest ?? "",
    modeHint: modeHint ?? null,
    workingDir: workingDir ?? process.cwd()
  };
}

function normalizeLegacyInput(input = {}) {
  return normalizePipelineInput({
    userRequest: input.userRequest ?? input.task ?? "",
    modeHint: input.modeHint ?? input.mode ?? null,
    workingDir: input.workingDir
  });
}

async function runRoutingStage({ codexRunner, coreSystemPrompt, input }) {
  const routerPrompt = await loadPrompt(ROUTER_PROMPT_PATH);

  return codexRunner.run({
    stage: "router",
    systemPrompt: coreSystemPrompt,
    rolePrompt: routerPrompt,
    input,
    expectedOutput: {
      mode: input.modeHint ?? DEFAULT_MODE,
      note: "TODO: replace placeholder routing output parsing with structured router results."
    }
  });
}

async function runPlanningStage({
  codexRunner,
  coreSystemPrompt,
  input,
  routing,
  selectedMode
}) {
  const plannerPrompt = await loadPrompt(PLANNER_PROMPT_PATH);

  return codexRunner.run({
    stage: "planner",
    systemPrompt: coreSystemPrompt,
    rolePrompt: plannerPrompt,
    input: {
      ...input,
      selectedMode,
      routing
    },
    expectedOutput: {
      selectedMode,
      steps: [],
      note: "TODO: planner should emit a structured execution plan for the target mode."
    }
  });
}

async function finalizeRun({
  codexRunner,
  coreSystemPrompt,
  input,
  selectedMode,
  routing,
  planning,
  pipelineResult,
  validation,
  stateStore
}) {
  const finalizerPrompt = await loadPrompt(FINALIZER_PROMPT_PATH);
  const packagingResult = await codexRunner.run({
    stage: "finalizer",
    systemPrompt: coreSystemPrompt,
    rolePrompt: finalizerPrompt,
    input: {
      userRequest: input.userRequest,
      selectedMode,
      pipelineResult,
      validation
    },
    expectedOutput: {
      artifact: pipelineResult,
      note: "TODO: replace placeholder packaging with deliverable-specific final output formatting."
    }
  });

  return {
    status: validation.ok ? "ok" : "validation_failed",
    userRequest: input.userRequest,
    mode: selectedMode,
    workingDir: input.workingDir,
    routing,
    planning,
    pipelineResult,
    validation,
    packaging: packagingResult,
    state: stateStore.snapshot()
  };
}

function resolveSelectedMode({ routing, modeHint }) {
  const routedMode =
    routing?.mode ??
    routing?.output?.mode ??
    routing?.request?.expectedOutput?.mode;

  return routedMode ?? modeHint ?? DEFAULT_MODE;
}

async function executeWithRetry({ stageName, retryPolicy, operation }) {
  const maxAttempts = retryPolicy?.maxAttempts ?? 1;
  const backoffMs = retryPolicy?.backoffMs ?? 0;
  let attempt = 0;
  let lastError;

  // Retry handling: keep retries centralized so individual orchestration stages
  // stay focused on their own inputs and outputs. Backoff is intentionally
  // minimal until real subprocess failures and retry rules are implemented.
  while (attempt < maxAttempts) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts) {
        break;
      }

      await delay(backoffMs);
    }
  }

  throw new Error(
    `Stage "${stageName}" failed after ${maxAttempts} attempt(s): ${lastError?.message ?? "Unknown error"}`
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
