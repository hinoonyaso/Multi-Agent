import test from "node:test";
import assert from "node:assert/strict";

import {
  loadContract,
  loadCoreSystemPrompt,
  loadModePrompt,
  loadRolePrompt
} from "../src/core/promptLoader.js";

test("loadCoreSystemPrompt reads the core system prompt", async () => {
  const prompt = await loadCoreSystemPrompt();

  assert.match(prompt, /shared core system prompt/i);
});

test("loadRolePrompt reads role prompt text by logical name", async () => {
  const prompt = await loadRolePrompt("router");

  assert.match(prompt, /^Role: Router/m);
});

test("loadModePrompt reads mode prompt text by mode and prompt name", async () => {
  const prompt = await loadModePrompt("website", "architect");

  assert.match(prompt, /Role:\s*Website Architect/i);
});

test("loadContract reads and parses mode contract JSON", async () => {
  const contract = await loadContract("website");

  assert.equal(contract.mode, "website");
  assert.equal(contract.artifact_kind, "implementation_ready_frontend");
});

test("helper arguments reject traversal-like names", async () => {
  await assert.rejects(() => loadRolePrompt("../router"));
  await assert.rejects(() => loadModePrompt("website/../docx", "writer"));
  await assert.rejects(() => loadContract("../website"));
});
