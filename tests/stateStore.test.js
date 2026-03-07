import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

import {
  createRunState,
  finalizeRun,
  loadRunState,
  saveStep
} from "../src/core/stateStore.js";

test("run state persists input, steps, validation, and final output to runs/", async () => {
  const runState = await createRunState({
    userRequest: "Build a landing page",
    modeHint: "website"
  });

  try {
    assert.match(runState.runId, /^\d{4}-\d{2}-\d{2}T.+-[0-9a-f]{6}$/);
    await stat(runState.runDir);

    await saveStep(runState, "router", { mode: "website" });
    await saveStep(runState, "planner", { steps: ["plan"] });
    await saveStep(runState, "pipelineResult", {
      status: "placeholder",
      helper: function placeholderHelper() {}
    });
    await saveStep(runState, "validation", { ok: true });
    await finalizeRun(runState, { status: "ok", artifact: { files: [] } });

    const reloaded = await loadRunState(runState.runId);

    assert.deepEqual(reloaded.input, {
      userRequest: "Build a landing page",
      modeHint: "website"
    });
    assert.deepEqual(reloaded.router, { mode: "website" });
    assert.deepEqual(reloaded.planner, { steps: ["plan"] });
    assert.equal(
      reloaded.steps.pipelineResult.helper,
      "[Function placeholderHelper]"
    );
    assert.deepEqual(reloaded.validation, { ok: true });
    assert.deepEqual(reloaded.final, {
      status: "ok",
      artifact: { files: [] }
    });

    const metadata = JSON.parse(
      await readFile(path.join(runState.runDir, "run.json"), "utf8")
    );

    assert.equal(metadata.files.router, "router.json");
    assert.equal(metadata.files.planner, "planner.json");
    assert.equal(metadata.files.validation, "validation.json");
    assert.equal(metadata.files.final, "final.json");
    assert.deepEqual(metadata.files.steps, ["steps/pipelineResult.json"]);
    assert.ok(metadata.finalizedAt);
  } finally {
    await rm(runState.runDir, { recursive: true, force: true });
  }
});
