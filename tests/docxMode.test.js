import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

import { createRunState, loadRunState } from "../src/core/stateStore.js";
import { runDocxMode } from "../src/modes/docx/index.js";

test("docx mode runs outline-to-finalizer pipeline and persists each step", async () => {
  const stageRequests = [];
  const outlineOutput = {
    document_title: "Quarterly Operations Review",
    target_audience: "Executive leadership",
    tone: "executive",
    sections: [
      {
        heading: "Performance Summary",
        purpose: "Summarize the most important operational outcomes.",
        key_points: ["Top operational wins", "Material shortfalls to address"]
      },
      {
        heading: "Next-Quarter Priorities",
        purpose: "Clarify where leadership attention should focus next.",
        key_points: ["Immediate priorities", "Dependencies and follow-up actions"]
      }
    ]
  };
  const writerOutput = {
    title: "Quarterly Operations Review",
    body_markdown: [
      "# Quarterly Operations Review",
      "",
      "## Performance Summary",
      "",
      "Operations improved in the quarter, with stronger execution in the core delivery path and clearer ownership on escalations.",
      "",
      "The main shortfall was uneven follow-through on cross-team dependencies, which slowed a subset of initiatives.",
      "",
      "## Next-Quarter Priorities",
      "",
      "Leadership should focus on tightening dependency management, reducing review latency, and keeping execution against the highest-impact initiatives visible.",
      "",
      "These priorities require explicit owners, weekly status review, and a narrower set of active cross-functional commitments."
    ].join("\n"),
    notes_for_editor: []
  };
  const editorOutput = {
    edited_body_markdown: [
      "# Quarterly Operations Review",
      "",
      "## Performance Summary",
      "",
      "Operations improved during the quarter, with stronger execution in the core delivery path and clearer ownership for escalations.",
      "",
      "The main shortfall was inconsistent follow-through on cross-team dependencies, which slowed a subset of initiatives.",
      "",
      "## Next-Quarter Priorities",
      "",
      "Leadership should focus next on tightening dependency management, reducing review latency, and keeping progress on the highest-impact initiatives visible.",
      "",
      "These priorities require explicit owners, weekly status review, and a narrower set of active cross-functional commitments."
    ].join("\n"),
    changes_made: ["Tightened wording and smoothed transitions between sections."],
    remaining_issues: []
  };
  const finalArtifact = {
    mode: "docx",
    output_type: "markdown_document",
    title: "Quarterly Operations Review",
    sections: [
      {
        heading: "Performance Summary",
        content: [
          "Operations improved during the quarter, with stronger execution in the core delivery path and clearer ownership for escalations.",
          "",
          "The main shortfall was inconsistent follow-through on cross-team dependencies, which slowed a subset of initiatives."
        ].join("\n")
      },
      {
        heading: "Next-Quarter Priorities",
        content: [
          "Leadership should focus next on tightening dependency management, reducing review latency, and keeping progress on the highest-impact initiatives visible.",
          "",
          "These priorities require explicit owners, weekly status review, and a narrower set of active cross-functional commitments."
        ].join("\n")
      }
    ],
    body_markdown: editorOutput.edited_body_markdown,
    target_audience: "Executive leadership",
    tone: "executive",
    notes_for_editor: [],
    changes_made: editorOutput.changes_made,
    remaining_issues: []
  };

  const mockRunner = {
    async run(request) {
      stageRequests.push(request.stage);

      if (request.stage === "docx:outline_builder") {
        return createRunResult(outlineOutput, request);
      }

      if (request.stage === "docx:writer") {
        return createRunResult(writerOutput, request);
      }

      if (request.stage === "docx:editor") {
        return createRunResult(editorOutput, request);
      }

      if (request.stage === "docx:validator") {
        return createRunResult(
          {
            status: "approve",
            reasons: [],
            next_action: "Proceed to final packaging."
          },
          request
        );
      }

      if (request.stage === "docx:finalizer") {
        return createRunResult(
          {
            final_mode: "docx",
            deliverables: [
              {
                name: "Quarterly Operations Review",
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
    userRequest: "Write an executive quarterly operations review",
    workingDir: process.cwd()
  });
  const result = await runDocxMode({
    input: {
      userRequest: "Write an executive quarterly operations review",
      workingDir: process.cwd()
    },
    runState,
    codexRunner: mockRunner,
    systemPrompt: "System prompt"
  });

  try {
    assert.deepEqual(stageRequests, [
      "docx:outline_builder",
      "docx:writer",
      "docx:editor",
      "docx:validator",
      "docx:finalizer"
    ]);
    assert.deepEqual(result, finalArtifact);

    const persistedRunState = await loadRunState(runState.runId);

    assert.equal(persistedRunState.steps.outline_builder.stage, "outline_builder");
    assert.equal(persistedRunState.steps.writer.stage, "writer");
    assert.equal(persistedRunState.steps.editor.stage, "editor");
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
