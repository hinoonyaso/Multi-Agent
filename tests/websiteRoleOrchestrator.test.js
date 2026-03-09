import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

import { createRunState, loadRunState } from "../src/core/stateStore.js";
import { runWebsiteMode } from "../src/modes/website/index.js";

test("website role orchestration persists role metadata and selection cycles", async () => {
  const stageRequests = [];
  const runState = await createRunState({
    userRequest: "Build a product landing page with hero, pricing, FAQ, and strong mobile layout.",
    workingDir: process.cwd()
  });

  const result = await runWebsiteMode({
    input: {
      userRequest: "Build a product landing page with hero, pricing, FAQ, and strong mobile layout.",
      workingDir: process.cwd()
    },
    runState,
    codexRunner: createWebsiteRunnerMock(stageRequests),
    systemPrompt: "System prompt"
  });

  try {
    assert.equal(result.mode, "website");
    assert.deepEqual(stageRequests, [
      "website:architect",
      "website:coder_first_pass",
      "website:ui_critic",
      "website:validator"
    ]);

    const persisted = await loadRunState(runState.runId);

    assert.equal(persisted.steps.request_interpreter.stage, "request_interpreter");
    assert.equal(persisted.steps.role_registry.mode, "website");
    assert.equal(persisted.steps.worker_pool.mode, "website");
    assert.deepEqual(persisted.steps.role_selection_cycle_1.selected_roles, ["request_interpreter"]);
    assert.deepEqual(persisted.steps.role_selection_cycle_2.selected_roles, ["information_architect"]);
    assert.deepEqual(persisted.steps.role_selection_cycle_3.selected_roles, ["frontend_coder"]);
    assert.deepEqual(persisted.steps.role_selection_cycle_4.selected_roles, ["ui_critic"]);
    assert.deepEqual(persisted.steps.role_selection_cycle_5.selected_roles, ["retry_planner"]);
    assert.deepEqual(persisted.steps.role_selection_cycle_6.selected_roles, ["validator_gate"]);
    assert.equal(
      persisted.steps.worker_assignments.assignments.information_architect.id,
      "website_planning_worker"
    );
    assert.equal(
      persisted.steps.worker_assignments.assignments.frontend_coder.id,
      "website_builder_worker"
    );
    assert.equal(persisted.steps.retry_planner.action, "proceed_to_validator");
  } finally {
    await rm(runState.runDir, { recursive: true, force: true });
  }
});

test("follow-up website requests run change impact analysis and skip the full ui critic stage", async () => {
  const stageRequests = [];
  const runState = await createRunState({
    userRequest: "Update the hero copy and tighten the CTA spacing.",
    previousArtifact: createWebsiteArtifact(),
    workingDir: process.cwd()
  });

  const result = await runWebsiteMode({
    input: {
      userRequest: "Update the hero copy and tighten the CTA spacing.",
      previousArtifact: createWebsiteArtifact(),
      workingDir: process.cwd()
    },
    runState,
    codexRunner: createWebsiteRunnerMock(stageRequests),
    systemPrompt: "System prompt"
  });

  try {
    assert.equal(result.mode, "website");
    assert.deepEqual(stageRequests, [
      "website:architect",
      "website:coder_first_pass",
      "website:validator"
    ]);

    const persisted = await loadRunState(runState.runId);

    assert.equal(
      persisted.steps.change_impact_analyzer.stage,
      "change_impact_analyzer"
    );
    assert.equal(persisted.steps.ui_critic.stage, "ui_critic");
    assert.equal(persisted.steps.retry_planner.action, "proceed_to_validator");
    assert.deepEqual(
      persisted.steps.role_selection_cycle_1.selected_roles,
      ["request_interpreter", "change_impact_analyzer"]
    );
  } finally {
    await rm(runState.runDir, { recursive: true, force: true });
  }
});

function createWebsiteRunnerMock(stageRequests) {
  const artifact = createWebsiteArtifact();

  return {
    async run(request) {
      stageRequests.push(request.stage);

      if (request.stage === "website:architect") {
        return createRunResult(
          {
            site_type: "landing",
            pages: [],
            design_system_guidance: {
              tone: "confident",
              layout_principles: ["Lead with a clear CTA."],
              responsive_notes: ["Prioritize a single-column mobile flow."]
            },
            implementation_notes: []
          },
          request
        );
      }

      if (request.stage === "website:coder_first_pass") {
        return createRunResult(
          {
            files: artifact.files,
            build_notes: ["Open index.html in a browser."],
            known_limitations: []
          },
          request
        );
      }

      if (request.stage === "website:ui_critic") {
        return createRunResult(
          {
            issues: [],
            passes: ["Clear mobile-first hierarchy."],
            final_recommendation: "approve"
          },
          request
        );
      }

      if (request.stage === "website:validator") {
        return createRunResult(
          {
            status: "approve",
            reasons: [],
            next_action: "Proceed to final packaging."
          },
          request
        );
      }

      throw new Error(`Unexpected stage: ${request.stage}`);
    }
  };
}

function createWebsiteArtifact() {
  return {
    mode: "website",
    output_type: "static_html_css_js",
    entrypoints: ["index.html"],
    files: [
      {
        path: "index.html",
        content: "<!doctype html><html><body><main>Website artifact</main></body></html>"
      },
      {
        path: "styles.css",
        content: "body { margin: 0; font-family: sans-serif; }"
      }
    ],
    build_notes: [],
    known_limitations: []
  };
}

function createRunResult(payload, request) {
  return {
    ok: true,
    stdout: JSON.stringify(payload),
    stderr: "",
    exitCode: 0,
    timedOut: false,
    cli: "mock-codex",
    model: "test-model",
    request
  };
}
