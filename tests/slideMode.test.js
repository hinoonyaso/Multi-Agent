import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

import { createRunState, loadRunState } from "../src/core/stateStore.js";
import { runSlideMode } from "../src/modes/slide/index.js";

test("slide mode runs strategist-to-finalizer pipeline and persists each step", async () => {
  const stageRequests = [];
  const strategistOutput = {
    presentation_title: "2026 Growth Plan",
    audience: "Executive leadership team",
    core_message: "Concentrated execution on three bets should drive the next growth step.",
    slides: [
      {
        slide_number: 1,
        slide_title: "Three focused bets can accelerate 2026 growth",
        slide_goal: "Open with the deck's central recommendation.",
        key_points: ["Why focus matters now", "What the three bets are"],
        suggested_visual: "stat callout"
      },
      {
        slide_number: 2,
        slide_title: "Current growth is constrained by fragmented execution",
        slide_goal: "Explain the operational problem that justifies the plan.",
        key_points: ["Too many priorities dilute effort", "Cross-team handoffs slow delivery"],
        suggested_visual: "diagram"
      }
    ]
  };
  const writerOutput = {
    slides: [
      {
        slide_number: 1,
        title: "Three focused bets can accelerate 2026 growth",
        bullets: [
          "Growth has plateaued under fragmented execution",
          "Three bets concentrate spend and leadership attention",
          "Focused delivery should improve speed and conversion"
        ],
        speaker_note: "Set up the deck with the recommendation first."
      },
      {
        slide_number: 2,
        title: "Current growth is constrained by fragmented execution",
        bullets: [
          "Teams are pursuing too many initiatives at once",
          "Cross-functional dependencies create avoidable delay",
          "Delivery variance weakens forecast confidence"
        ],
        speaker_note: ""
      }
    ]
  };
  const consistencyOutput = {
    critical_issues: [],
    minor_issues: ["Slide 2 could use a tighter second bullet."],
    approved_if_fixed: true
  };
  const finalArtifact = {
    mode: "slide",
    output_type: "structured_slides_json",
    title: "2026 Growth Plan",
    slides: [
      {
        slide_number: 1,
        title: "Three focused bets can accelerate 2026 growth",
        content: [
          "Growth has plateaued under fragmented execution",
          "Three bets concentrate spend and leadership attention",
          "Focused delivery should improve speed and conversion"
        ].join("\n"),
        bullets: writerOutput.slides[0].bullets,
        speaker_note: "Set up the deck with the recommendation first.",
        slide_goal: "Open with the deck's central recommendation.",
        suggested_visual: "stat callout"
      },
      {
        slide_number: 2,
        title: "Current growth is constrained by fragmented execution",
        content: [
          "Teams are pursuing too many initiatives at once",
          "Cross-functional dependencies create avoidable delay",
          "Delivery variance weakens forecast confidence"
        ].join("\n"),
        bullets: writerOutput.slides[1].bullets,
        speaker_note: "",
        slide_goal: "Explain the operational problem that justifies the plan.",
        suggested_visual: "diagram"
      }
    ],
    audience: "Executive leadership team",
    core_message: "Concentrated execution on three bets should drive the next growth step."
  };

  const mockRunner = {
    async run(request) {
      stageRequests.push(request.stage);

      if (request.stage === "slide:strategist") {
        return createRunResult(strategistOutput, request);
      }

      if (request.stage === "slide:writer") {
        return createRunResult(writerOutput, request);
      }

      if (request.stage === "slide:consistency_checker") {
        return createRunResult(consistencyOutput, request);
      }

      if (request.stage === "slide:validator") {
        return createRunResult(
          {
            status: "approve",
            reasons: [],
            next_action: "Proceed to final packaging."
          },
          request
        );
      }

      if (request.stage === "slide:finalizer") {
        return createRunResult(
          {
            final_mode: "slide",
            deliverables: [
              {
                name: "2026 Growth Plan",
                type: "content",
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
    userRequest: "Draft a short executive deck for the 2026 growth plan",
    workingDir: process.cwd()
  });
  const result = await runSlideMode({
    input: {
      userRequest: "Draft a short executive deck for the 2026 growth plan",
      workingDir: process.cwd()
    },
    runState,
    codexRunner: mockRunner,
    systemPrompt: "System prompt"
  });

  try {
    assert.deepEqual(stageRequests, [
      "slide:strategist",
      "slide:writer",
      "slide:consistency_checker",
      "slide:validator",
      "slide:finalizer"
    ]);
    assert.deepEqual(result, finalArtifact);

    const persistedRunState = await loadRunState(runState.runId);

    assert.equal(persistedRunState.steps.strategist.stage, "strategist");
    assert.equal(persistedRunState.steps.writer.stage, "writer");
    assert.equal(persistedRunState.steps.consistency_checker.stage, "consistency_checker");
    assert.equal(persistedRunState.steps.validator.stage, "validator");
    assert.equal(persistedRunState.steps.finalizer.stage, "finalizer");
    assert.equal(persistedRunState.steps.validator.contractValidation.ok, true);
    assert.deepEqual(persistedRunState.steps.finalizer.artifact, finalArtifact);

    await rm(runState.runDir, { recursive: true, force: true });
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
