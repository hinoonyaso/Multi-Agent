import { createCodexRunner } from "../../core/codexRunner.js";
import { loadCoreSystemPrompt } from "../../core/promptLoader.js";
import {
  createRunState,
  saveStep
} from "../../core/stateStore.js";
import { validateOutput } from "../../core/validator.js";
import { RETRY_ERROR_TYPES } from "../../core/retryPolicy.js";

export async function createModeRuntime(context = {}) {
  const input = context.input ?? {};
  const runState = context.runState ?? await createRunState(input);

  return {
    input,
    planning: context.planning ?? null,
    routing: context.routing ?? null,
    retryPolicy: context.retryPolicy ?? null,
    runState,
    codexRunner: context.codexRunner ?? createCodexRunner(),
    systemPrompt: context.systemPrompt ?? await loadCoreSystemPrompt(),
    async save(stepName, data) {
      return saveStep(runState, stepName, data);
    }
  };
}

/**
 * @typedef {Object} RetryConfig
 * @property {string} [errorType] - RETRY_ERROR_TYPES value
 * @property {number} [maxAttempts] - Max retries for this error type
 * @property {Function} [onRetry] - Async (attempt, failure) => void for persistence
 * @property {Function} [buildRepairPrompt] - (failure, attempt) => string
 */

/**
 * Run a JSON-emitting stage with optional retry on invalid JSON.
 * @param {Object} params
 * @param {Object} params.runtime - Mode runtime
 * @param {string} params.modeName - Mode name
 * @param {string} params.stageName - Stage name
 * @param {string|null} params.roleName - Validator role name
 * @param {string} params.rolePrompt - Prompt text
 * @param {Object} params.input - Stage input
 * @param {Object} params.expectedOutput - Expected schema for repair prompts
 * @param {RetryConfig|RetryConfig[]} [params.retryConfig] - Retry configuration
 */
export async function runJsonStage({
  runtime,
  modeName,
  stageName,
  roleName = null,
  rolePrompt,
  input,
  expectedOutput,
  retryConfig = null
}) {
  const invalidJsonConfig = normalizeRetryConfig(retryConfig, RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT);
  const maxAttempts = invalidJsonConfig?.maxAttempts ?? 1;
  let attempt = 1;
  let stage = null;

  while (attempt <= maxAttempts) {
    const promptForAttempt =
      attempt === 1
        ? rolePrompt
        : (invalidJsonConfig?.buildRepairPrompt?.(stage, attempt) ?? rolePrompt);

    const run = await runtime.codexRunner.run({
      stage: `${modeName}:${stageName}`,
      systemPrompt: runtime.systemPrompt,
      rolePrompt: promptForAttempt,
      input,
      expectedOutput,
      cwd: runtime.input?.workingDir ?? process.cwd()
    });

    const validation = roleName
      ? await validateOutput({ roleName, output: run })
      : await validateOutput({ output: run.stdout ?? "" });

    stage = {
      stage: stageName,
      ok: run.ok && validation.ok,
      run,
      parsed: validation.parsed ?? null,
      validation,
      retry: {
        attempts: attempt,
        maxAttempts,
        exhausted: attempt >= maxAttempts
      }
    };

    if (!hasInvalidJsonFailure(stage?.validation) || attempt >= maxAttempts) {
      return stage;
    }

    if (invalidJsonConfig?.onRetry) {
      await invalidJsonConfig.onRetry(attempt, stage);
    }

    attempt += 1;
  }

  return stage;
}

function normalizeRetryConfig(retryConfig, errorType) {
  if (!retryConfig) return null;
  if (Array.isArray(retryConfig)) {
    const match = retryConfig.find((c) => c?.errorType === errorType);
    return match ?? null;
  }
  return retryConfig;
}

function hasInvalidJsonFailure(validation) {
  return Boolean(
    validation?.errors?.some((issue) =>
      ["invalid_json_input", "empty_json_input", "invalid_json"].includes(issue?.code)
    )
  );
}
