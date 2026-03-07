import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

import { createRunState } from "../src/core/stateStore.js";
import { createOrchestrator } from "../src/core/orchestrator.js";
import { selectModePipeline } from "../src/core/router.js";

test("router returns callable pipelines for supported and unsupported modes", async () => {
  const websitePipeline = selectModePipeline("website");
  const unsupportedPipeline = selectModePipeline("unknown_mode");
  const runState = await createRunState({
    userRequest: "Smoke test website pipeline",
    workingDir: process.cwd()
  });

  try {
    assert.equal(typeof websitePipeline, "function");
    assert.equal(typeof unsupportedPipeline, "function");

    await assert.doesNotReject(() =>
      websitePipeline({
        input: {
          userRequest: "Smoke test website pipeline",
          workingDir: process.cwd()
        },
        runState,
        codexRunner: createModeRunnerMock(),
        systemPrompt: "System prompt"
      })
    );

    await assert.doesNotReject(() =>
      unsupportedPipeline({
        input: {
          mode: "unknown_mode"
        }
      })
    );
  } finally {
    await rm(runState.runDir, { recursive: true, force: true });
  }
});

test("orchestrator smoke run calls router, planner, and a mode pipeline", async () => {
  const stageRequests = [];
  const orchestrator = createOrchestrator({
    codexRunner: createOrchestratorRunnerMock(stageRequests)
  });

  const result = await orchestrator.run({
    userRequest: "Build a smoke-test landing page",
    modeHint: "website",
    workingDir: process.cwd()
  });

  try {
    assert.deepEqual(stageRequests, [
      "router",
      "planner",
      "website:architect",
      "website:coder",
      "website:ui_critic",
      "website:validator",
      "website:finalizer",
      "finalizer"
    ]);
    assert.equal(result.status, "ok");
    assert.equal(result.mode, "website");
    assert.equal(result.routing.request.stage, "router");
    assert.equal(result.planning.request.stage, "planner");
    assert.equal(result.pipelineResult.mode, "website");
    assert.equal(result.validation.ok, true);
    assert.equal(result.state.router.request.stage, "router");
    assert.equal(result.state.planner.request.stage, "planner");
    assert.equal(result.state.steps.architect.stage, "architect");
  } finally {
    await rm(result.state.runDir, { recursive: true, force: true });
  }
});

function createOrchestratorRunnerMock(stageRequests) {
  const finalArtifact = createWebsiteArtifact();

  return {
    async run(request) {
      stageRequests.push(request.stage);

      if (request.stage === "router") {
        return createRunResult(
          {
            primary_mode: "website",
            task_type: "build",
            requires_research: false,
            selected_agents: ["router", "planner", "website"],
            reasoning_summary: ["Website mode fits the request."],
            risks: []
          },
          request
        );
      }

      if (request.stage === "planner") {
        return createRunResult(
          {
            mode: "website",
            execution_steps: ["architect", "coder", "validator", "finalizer"],
            artifact_contract: {
              mode: "website",
              output_type: "static_html_css_js"
            },
            open_questions_to_resolve: [],
            risks: []
          },
          request
        );
      }

      if (request.stage === "website:architect") {
        return createRunResult(
          {
            site_type: "landing",
            pages: [],
            design_system_guidance: {
              tone: "minimal",
              layout_principles: [],
              responsive_notes: []
            },
            implementation_notes: []
          },
          request
        );
      }

      if (request.stage === "website:coder") {
        return createRunResult(
          {
            files: finalArtifact.files,
            build_notes: [],
            known_limitations: []
          },
          request
        );
      }

      if (request.stage === "website:ui_critic") {
        return createRunResult(
          {
            issues: [],
            passes: ["Pipeline artifact is structurally valid."],
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

      if (request.stage === "website:finalizer") {
        return createRunResult(
          {
            final_mode: "website",
            deliverables: [
              {
                name: "website-artifact",
                type: "file",
                content: JSON.stringify(finalArtifact)
              }
            ],
            delivery_notes: []
          },
          request
        );
      }

      if (request.stage === "finalizer") {
        return createRunResult(
          {
            final_mode: "website",
            deliverables: [
              {
                name: "orchestrator-summary",
                type: "content",
                content: JSON.stringify({ ok: true })
              }
            ],
            delivery_notes: []
          },
          request
        );
      }

      throw new Error(`Unexpected stage: ${request.stage}`);
    }
  };
}

function createModeRunnerMock() {
  const finalArtifact = createWebsiteArtifact();

  return {
    async run(request) {
      if (request.stage === "website:architect") {
        return createRunResult(
          {
            site_type: "landing",
            pages: [],
            design_system_guidance: {
              tone: "minimal",
              layout_principles: [],
              responsive_notes: []
            },
            implementation_notes: []
          },
          request
        );
      }

      if (request.stage === "website:coder") {
        return createRunResult(
          {
            files: finalArtifact.files,
            build_notes: [],
            known_limitations: []
          },
          request
        );
      }

      if (request.stage === "website:ui_critic") {
        return createRunResult(
          {
            issues: [],
            passes: [],
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

      if (request.stage === "website:finalizer") {
        return createRunResult(
          {
            final_mode: "website",
            deliverables: [
              {
                name: "website-artifact",
                type: "file",
                content: JSON.stringify(finalArtifact)
              }
            ],
            delivery_notes: []
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
        content: "<!doctype html><html><body><main>Smoke test</main></body></html>"
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
