import { createCodexRunner } from "./codexRunner.js";
import {
  buildPlannerContext,
  buildRouterContext,
  buildWebsiteArchitectContext
} from "./contextBuilder.js";
import {
  buildPlannerPrompt,
  buildRouterPrompt
} from "./promptBuilder.js";
import {
  loadContract,
  loadCoreSystemPrompt,
  loadRolePrompt
} from "./promptLoader.js";
import { createRetryPolicy } from "./retryPolicy.js";
import { selectModePipeline } from "./router.js";
import {
  createRunState,
  finalizeRun as persistFinalRun,
  loadRunState,
  saveStep
} from "./stateStore.js";
import { validateOutput } from "./validator.js";

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
  const { codexRunner, retryPolicy } = dependencies;
  const runState = await createRunState(input);

  const routing = await executeWithRetry({
    stageName: "router",
    retryPolicy,
    operation: () => runRoutingStage({ codexRunner, input })
  });
  await saveStep(runState, "router", routing);

  const selectedMode = resolveSelectedMode({
    routing,
    modeHint: input.modeHint
  });
  const modePipeline = selectModePipeline(selectedMode);
  const contract = await loadModeContract(selectedMode);

  const planning = await executeWithRetry({
    stageName: "planner",
    retryPolicy,
    operation: () =>
      runPlanningStage({
        codexRunner,
        input,
        routing,
        selectedMode,
        contract
      })
  });
  await saveStep(runState, "planner", planning);

  const pipelineResult = await modePipeline({
    input: {
      ...input,
      mode: selectedMode
    },
    routing,
    planning,
    contract,
    modeContext: buildModeContext({
      selectedMode,
      input,
      planning,
      contract
    }),
    runState,
    codexRunner,
    retryPolicy
  });
  await saveStep(runState, "pipelineResult", pipelineResult);

  const validation = await validateOutput({
    mode: selectedMode,
    output: pipelineResult
  });
  await saveStep(runState, "validation", validation);

  const finalization = await finalizeRun({
    codexRunner,
    input,
    selectedMode,
    routing,
    planning,
    pipelineResult,
    validation
  });
  await persistFinalRun(runState, finalization);

  return {
    ...finalization,
    state: await loadRunState(runState.runId)
  };
}

function createDefaultDependencies(overrides = {}) {
  return {
    codexRunner: overrides.codexRunner ?? createCodexRunner(),
    retryPolicy: overrides.retryPolicy ?? createRetryPolicy()
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

async function runRoutingStage({ codexRunner, input }) {
  const context = buildRouterContext({
    userRequest: input.userRequest,
    modeHint: input.modeHint
  });
  const expectedOutput = {
    mode: input.modeHint ?? DEFAULT_MODE,
    note: "TODO: replace placeholder routing output parsing with structured router results."
  };
  const prompt = await buildRouterPrompt({
    context,
    expectedOutput
  });

  return codexRunner.run({
    stage: "router",
    prompt,
    input: context,
    expectedOutput
  });
}

async function runPlanningStage({
  codexRunner,
  input,
  routing,
  selectedMode,
  contract
}) {
  const context = buildPlannerContext({
    userRequest: input.userRequest,
    routerResult: buildPlannerRouterResult(routing, selectedMode),
    contract
  });
  const expectedOutput = {
    selectedMode,
    steps: [],
    note: "TODO: planner should emit a structured execution plan for the target mode."
  };
  const prompt = await buildPlannerPrompt({
    context,
    expectedOutput
  });

  return codexRunner.run({
    stage: "planner",
    prompt,
    input: context,
    expectedOutput
  });
}

async function finalizeRun({
  codexRunner,
  input,
  selectedMode,
  routing,
  planning,
  pipelineResult,
  validation
}) {
  const coreSystemPrompt = await loadCoreSystemPrompt();
  const finalizerPrompt = await loadRolePrompt("finalizer");
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
    packaging: packagingResult
  };
}

function resolveSelectedMode({ routing, modeHint }) {
  const routedMode =
    routing?.mode ??
    routing?.output?.mode ??
    routing?.request?.expectedOutput?.mode;

  return routedMode ?? modeHint ?? DEFAULT_MODE;
}

function buildModeContext({ selectedMode, input, planning, contract }) {
  if (selectedMode === "website") {
    return {
      architect: buildWebsiteArchitectContext({
        userRequest: input.userRequest,
        plannerResult: planning,
        contract,
        researchResult: null
      })
    };
  }

  return {};
}

function buildPlannerRouterResult(routing, selectedMode) {
  return {
    primary_mode: resolveSelectedMode({
      routing,
      modeHint: selectedMode
    })
  };
}

async function loadModeContract(mode) {
  if (!mode) {
    return null;
  }

  try {
    return await loadContract(mode);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function executeWithRetry({ stageName, retryPolicy, operation }) {
  const maxAttempts = retryPolicy?.maxAttempts ?? 1;
  const backoffMs = retryPolicy?.backoffMs ?? 0;
  let attempt = 0;
  let lastError;

  // Keep retries centralized so stage functions only describe work and inputs.
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
