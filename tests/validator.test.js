import test from "node:test";
import assert from "node:assert/strict";

import {
  parseJsonSafely,
  validateModeContract,
  validateOutput,
  validateRoleOutput
} from "../src/core/validator.js";

test("parseJsonSafely parses valid JSON text", () => {
  const result = parseJsonSafely('{"primary_mode":"website"}');

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { primary_mode: "website" });
  assert.equal(result.error, null);
});

test("parseJsonSafely returns a structured error for invalid JSON", () => {
  const result = parseJsonSafely("{invalid");

  assert.equal(result.ok, false);
  assert.equal(result.value, null);
  assert.equal(result.error.code, "invalid_json");
});

test("validateRoleOutput enforces required top-level fields for known roles", () => {
  const valid = validateRoleOutput("router", {
    primary_mode: "website",
    task_type: "landing page",
    requires_research: false,
    selected_agents: ["planner", "finalizer"],
    reasoning_summary: ["artifact is a website"],
    risks: []
  });
  const invalid = validateRoleOutput("router", {
    primary_mode: "website",
    task_type: "landing page",
    selected_agents: ["planner"],
    reasoning_summary: []
  });

  assert.equal(valid.ok, true);
  assert.deepEqual(valid.missingFields, []);
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.missingFields, ["requires_research", "risks"]);
});

test("validateRoleOutput rejects unexpected top-level fields for strict role schemas", () => {
  const result = validateRoleOutput("planner", {
    mode: "website",
    execution_steps: [],
    artifact_contract: {},
    open_questions_to_resolve: [],
    risks: [],
    extra: true
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.unexpectedFields, ["extra"]);
});

test("validateModeContract checks required top-level mode fields", async () => {
  const valid = await validateModeContract("website", {
    mode: "website",
    output_type: "static_html_css_js",
    entrypoints: ["index.html"],
    files: [
      {
        path: "index.html",
        content: "<!doctype html><html></html>"
      }
    ]
  });
  const invalid = await validateModeContract("website", {
    mode: "website",
    output_type: "static_html_css_js",
    entrypoints: ["index.html"]
  });

  assert.equal(valid.ok, true);
  assert.deepEqual(valid.missingFields, []);
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.missingFields, ["files"]);
});

test("validateOutput parses Codex stdout when JSON is expected", async () => {
  const result = await validateOutput({
    roleName: "router",
    output: {
      stdout:
        '{"primary_mode":"website","task_type":"landing page","requires_research":false,"selected_agents":["planner"],"reasoning_summary":["fits website mode"],"risks":[]}'
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, "codex_stdout");
  assert.equal(result.role?.ok, true);
});

test("validateOutput returns parse errors when JSON is expected but invalid", async () => {
  const result = await validateOutput({
    roleName: "finalizer",
    output: {
      stdout: "not json"
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "invalid_json");
  assert.equal(result.role, null);
});
