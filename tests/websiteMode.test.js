import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

import { createRunState, loadRunState } from "../src/core/stateStore.js";
import { runWebsiteMode } from "../src/modes/website/index.js";

test("website mode runs architect-to-finalizer pipeline and persists each step", async () => {
  const stageRequests = [];
  const architectOutput = {
    site_type: "landing",
    pages: [
      {
        name: "home",
        purpose: "Explain the product and drive signups.",
        sections: [
          {
            name: "hero",
            goal: "Communicate the core value proposition quickly.",
            components: ["hero banner", "primary CTA"],
            content_requirements: ["primary headline", "supporting proof point", "CTA label"]
          }
        ]
      }
    ],
    design_system_guidance: {
      tone: "bold",
      layout_principles: ["Lead with the primary call to action."],
      responsive_notes: ["Stack hero content into a single column on mobile."]
    },
    implementation_notes: ["Use a single-page structure."]
  };
  const coderOutput = {
    files: [
      {
        path: "index.html",
        content: "<!doctype html><html><body><main class=\"hero\">Launch faster</main></body></html>"
      },
      {
        path: "styles.css",
        content: "body { margin: 0; font-family: sans-serif; }"
      }
    ],
    build_notes: ["Open index.html directly in a browser."],
    known_limitations: []
  };
  const finalArtifact = {
    mode: "website",
    output_type: "static_html_css_js",
    entrypoints: ["index.html"],
    files: coderOutput.files,
    build_notes: coderOutput.build_notes,
    known_limitations: coderOutput.known_limitations
  };

  const mockRunner = {
    async run(request) {
      stageRequests.push(request.stage);

      if (request.stage === "website:architect") {
        return createRunResult(architectOutput, request);
      }

      if (request.stage === "website:coder") {
        return createRunResult(coderOutput, request);
      }

      if (request.stage === "website:ui_critic") {
        return createRunResult(
          {
            issues: [],
            passes: ["Clear primary CTA hierarchy."],
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
                type: "bundle",
                content: JSON.stringify(finalArtifact, null, 2)
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

  const runState = await createRunState({
    userRequest: "Build a product landing page",
    workingDir: process.cwd()
  });
  const result = await runWebsiteMode({
    input: {
      userRequest: "Build a product landing page",
      workingDir: process.cwd()
    },
    runState,
    codexRunner: mockRunner,
    systemPrompt: "System prompt"
  });

  try {
    assert.deepEqual(stageRequests, [
      "website:architect",
      "website:coder",
      "website:ui_critic",
      "website:validator",
      "website:finalizer"
    ]);
    assert.deepEqual(result, finalArtifact);

    const runs = await loadRunState(runState.runId);

    assert.equal(runs.steps.architect.stage, "architect");
    assert.equal(runs.steps.coder.stage, "coder");
    assert.equal(runs.steps.ui_critic.stage, "ui_critic");
    assert.equal(runs.steps.validator.stage, "validator");
    assert.equal(runs.steps.finalizer.stage, "finalizer");
    assert.equal(runs.steps.validator.contractValidation.ok, true);
    assert.deepEqual(runs.steps.finalizer.artifact, finalArtifact);

    await rm(runs.runDir, { recursive: true, force: true });
  } catch (error) {
    await rm(runState.runDir, { recursive: true, force: true });
    throw error;
  }
});

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
