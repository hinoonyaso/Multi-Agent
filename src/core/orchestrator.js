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

export async function runPipeline({
  userRequest,
  modeHint,
  workingDir,
  onEvent
} = {}) {
  return runPipelineInternal(
    normalizePipelineInput({ userRequest, modeHint, workingDir }),
    createDefaultDependencies(),
    onEvent
  );
}

export function createOrchestrator(overrides = {}) {
  const dependencies = createDefaultDependencies(overrides);

  return {
    async run(input = {}) {
      return runPipelineInternal(
        normalizeLegacyInput(input),
        dependencies,
        typeof input.onEvent === "function" ? input.onEvent : null
      );
    }
  };
}

async function runPipelineInternal(input, dependencies, onEvent = null) {
  const { codexRunner, retryPolicy } = dependencies;
  let runState = null;
  let selectedMode = input.modeHint ?? DEFAULT_MODE;
  let currentStep = "run";
  const emit = createEventEmitter({
    onEvent,
    getRunId: () => runState?.runId ?? null
  });

  try {
    runState = await createRunState(input);
    emit({
      type: "run_started",
      step: "run",
      mode: selectedMode,
      summary: "Pipeline execution started."
    });

    currentStep = "router";
    emit({
      type: "router_started",
      step: "router",
      summary: "Routing request to a mode."
    });
    const routing = await executeWithRetry({
      stageName: "router",
      retryPolicy,
      operation: () => runRoutingStage({ codexRunner, input })
    });
    await saveStep(runState, "router", routing);

    selectedMode = resolveSelectedMode({
      routing,
      modeHint: input.modeHint
    });
    emit({
      type: "router_completed",
      step: "router",
      mode: selectedMode,
      summary: `Routing selected mode "${selectedMode}".`
    });

    const modePipeline = selectModePipeline(selectedMode);
    const contract = await loadModeContract(selectedMode);

    currentStep = "planner";
    emit({
      type: "planner_started",
      step: "planner",
      mode: selectedMode,
      summary: `Planning "${selectedMode}" execution.`
    });
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
    emit({
      type: "planner_completed",
      step: "planner",
      mode: selectedMode,
      summary: `Plan ready for mode "${selectedMode}".`
    });

    currentStep = "mode";
    emit({
      type: "mode_started",
      step: "mode",
      agent: selectedMode,
      mode: selectedMode,
      summary: `Mode pipeline "${selectedMode}" started.`
    });
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
      codexRunner: createObservableModeRunner({
        codexRunner,
        emit,
        mode: selectedMode
      }),
      retryPolicy,
      onEvent
    });
    await saveStep(runState, "pipelineResult", pipelineResult);

    currentStep = "validator";
    emit({
      type: "validator_started",
      step: "validator",
      mode: selectedMode,
      summary: "Validating pipeline output."
    });
    const validation = await validateOutput({
      mode: selectedMode,
      output: pipelineResult
    });
    await saveStep(runState, "validation", validation);
    emit({
      type: "validator_completed",
      step: "validator",
      mode: selectedMode,
      summary: validation.ok
        ? "Validation completed successfully."
        : `Validation completed with ${validation.errors?.length ?? 0} error(s).`
    });

    currentStep = "finalizer";
    emit({
      type: "finalizer_started",
      step: "finalizer",
      mode: selectedMode,
      summary: "Packaging final response."
    });
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
    emit({
      type: "finalizer_completed",
      step: "finalizer",
      mode: selectedMode,
      summary: "Final response packaging completed."
    });

    const state = await loadRunState(runState.runId);
    const result = {
      ...finalization,
      state
    };

    emit({
      type: "run_completed",
      step: "run",
      mode: selectedMode,
      summary: `Run completed with status "${result.status}".`
    });

    return result;
  } catch (error) {
    emit({
      type: "run_failed",
      step: error?.step ?? currentStep,
      agent: error?.agent ?? null,
      mode: selectedMode,
      summary: buildFailureSummary(error, currentStep),
      error: serializeError(error)
    });
    throw error;
  }
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

function createEventEmitter({ onEvent, getRunId }) {
  return (event = {}) => {
    if (typeof onEvent !== "function") {
      return;
    }

    try {
      onEvent({
        runId: getRunId(),
        timestamp: new Date().toISOString(),
        ...event
      });
    } catch {
      // Ignore observer failures so pipeline execution remains authoritative.
    }
  };
}

function createObservableModeRunner({ codexRunner, emit, mode }) {
  return {
    ...codexRunner,
    async run(request = {}) {
      const agent = getAgentName(request.stage);

      emit({
        type: "agent_step_started",
        step: agent,
        agent,
        mode,
        summary: `Agent step "${agent}" started.`
      });

      try {
        const result = await codexRunner.run(request);

        emit({
          type: "agent_step_completed",
          step: agent,
          agent,
          mode,
          summary: result.ok
            ? `Agent step "${agent}" completed.`
            : `Agent step "${agent}" completed with runner errors.`
        });

        return result;
      } catch (error) {
        annotateError(error, {
          step: agent,
          agent
        });
        throw error;
      }
    }
  };
}

function getAgentName(stageName) {
  if (typeof stageName !== "string" || !stageName.trim()) {
    return "unknown_agent";
  }

  const [, nestedStage = stageName] = stageName.split(":");
  return nestedStage;
}

function buildFailureSummary(error, currentStep) {
  const prefix = currentStep ? `Execution failed during "${currentStep}".` : "Execution failed.";

  if (error instanceof Error && error.message) {
    return `${prefix} ${error.message}`;
  }

  return prefix;
}

function annotateError(error, metadata) {
  if (!error || typeof error !== "object") {
    return;
  }

  Object.assign(error, metadata);
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return {
    message: String(error)
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
