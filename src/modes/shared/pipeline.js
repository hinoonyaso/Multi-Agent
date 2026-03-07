import { createCodexRunner } from "../../core/codexRunner.js";
import { loadCoreSystemPrompt } from "../../core/promptLoader.js";
import {
  createRunState,
  saveStep
} from "../../core/stateStore.js";
import { validateOutput } from "../../core/validator.js";

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

export async function runJsonStage({
  runtime,
  modeName,
  stageName,
  roleName = null,
  rolePrompt,
  input,
  expectedOutput
}) {
  const run = await runtime.codexRunner.run({
    stage: `${modeName}:${stageName}`,
    systemPrompt: runtime.systemPrompt,
    rolePrompt,
    input,
    expectedOutput,
    cwd: runtime.input.workingDir
  });
  const validation = roleName
    ? await validateOutput({ roleName, output: run })
    : await validateOutput({ output: run.stdout ?? "" });

  return {
    stage: stageName,
    ok: run.ok && validation.ok,
    run,
    parsed: validation.parsed ?? null,
    validation,
    retry: createRetryMetadata(runtime)
  };
}

function createRetryMetadata(runtime) {
  const maxAttempts = runtime.retryPolicy?.maxAttempts ?? 1;

  return {
    attempts: 1,
    maxAttempts,
    // TODO: Apply retryPolicy here once mode stages support targeted prompt
    // revisions and deterministic replay rules.
    exhausted: 1 >= maxAttempts
  };
}
