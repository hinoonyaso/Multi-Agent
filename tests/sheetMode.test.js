import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

import { createRunState, loadRunState } from "../src/core/stateStore.js";
import { runSheetMode } from "../src/modes/sheet/index.js";

test("sheet mode runs schema-to-finalizer pipeline and persists each step", async () => {
  const stageRequests = [];
  const schemaOutput = {
    workbook_name: "Revenue Forecast Model",
    tabs: [
      {
        tab_name: "Inputs",
        purpose: "Capture planning assumptions for each region.",
        columns: [
          {
            name: "Region",
            type: "text",
            required: true,
            description: "Business region for the forecast row."
          },
          {
            name: "Pipeline",
            type: "currency",
            required: true,
            description: "Qualified pipeline value for the period."
          },
          {
            name: "Win Rate",
            type: "percentage",
            required: true,
            description: "Expected conversion rate for the row."
          }
        ]
      },
      {
        tab_name: "Forecast",
        purpose: "Calculate expected bookings from the input assumptions.",
        columns: [
          {
            name: "Region",
            type: "text",
            required: true,
            description: "Region carried forward from Inputs."
          },
          {
            name: "Expected Bookings",
            type: "formula",
            required: true,
            description: "Calculated bookings based on pipeline and win rate."
          }
        ]
      }
    ],
    data_flow_notes: [
      "Inputs feeds Forecast by Region.",
      "Forecast should remain formula-driven rather than manual."
    ]
  };
  const formulaOutput = {
    tabs: [
      {
        tab_name: "Inputs",
        role: "input",
        formulas: [],
        validations: [
          {
            scope: "Inputs!A:A",
            rule: "Region must be selected from the approved region list",
            condition: "Pass when the cell matches a supported region value",
            message: "Choose a valid region."
          },
          {
            scope: "Inputs!B:C",
            rule: "Pipeline and Win Rate are required",
            condition: "Pass when both cells are populated with numeric values",
            message: "Enter pipeline and win rate."
          }
        ]
      },
      {
        tab_name: "Forecast",
        role: "calculation",
        formulas: [
          {
            target: "Forecast!B:B",
            formula: "=Inputs!B2*Inputs!C2",
            purpose: "Calculate expected bookings for each region row.",
            fill_scope: "fill_down"
          }
        ],
        validations: []
      }
    ],
    workbook_checks: [
      "Forecast totals should reconcile to the sum of row-level expected bookings."
    ]
  };
  const auditorOutput = {
    issues: [],
    strengths: [
      "Workbook separates input entry from calculated output, which improves traceability."
    ],
    final_recommendation: "approve"
  };
  const finalArtifact = {
    mode: "sheet",
    output_type: "structured_workbook_json",
    workbook: {
      name: "Revenue Forecast Model",
      tab_order: ["Inputs", "Forecast"],
      data_flow_notes: schemaOutput.data_flow_notes,
      workbook_checks: formulaOutput.workbook_checks
    },
    tabs: [
      {
        tab_name: "Inputs",
        role: "input",
        purpose: "Capture planning assumptions for each region.",
        schema: schemaOutput.tabs[0].columns,
        formulas: [],
        validations: formulaOutput.tabs[0].validations,
        audit_checks: []
      },
      {
        tab_name: "Forecast",
        role: "calculation",
        purpose: "Calculate expected bookings from the input assumptions.",
        schema: schemaOutput.tabs[1].columns,
        formulas: formulaOutput.tabs[1].formulas,
        validations: [],
        audit_checks: []
      }
    ]
  };

  const mockRunner = {
    async run(request) {
      stageRequests.push(request.stage);

      if (request.stage === "sheet:schema_designer") {
        return createRunResult(schemaOutput, request);
      }

      if (request.stage === "sheet:formula_builder") {
        return createRunResult(formulaOutput, request);
      }

      if (request.stage === "sheet:auditor") {
        return createRunResult(auditorOutput, request);
      }

      if (request.stage === "sheet:validator") {
        return createRunResult(
          {
            status: "approve",
            reasons: [],
            next_action: "Proceed to final packaging."
          },
          request
        );
      }

      if (request.stage === "sheet:finalizer") {
        return createRunResult(
          {
            final_mode: "sheet",
            deliverables: [
              {
                name: "Revenue Forecast Model",
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
    userRequest: "Create a revenue forecast workbook",
    workingDir: process.cwd()
  });
  const result = await runSheetMode({
    input: {
      userRequest: "Create a revenue forecast workbook",
      workingDir: process.cwd()
    },
    runState,
    codexRunner: mockRunner,
    systemPrompt: "System prompt"
  });

  try {
    assert.deepEqual(stageRequests, [
      "sheet:schema_designer",
      "sheet:formula_builder",
      "sheet:auditor",
      "sheet:validator",
      "sheet:finalizer"
    ]);
    assert.deepEqual(result, finalArtifact);

    const persistedRunState = await loadRunState(runState.runId);

    assert.equal(persistedRunState.steps.schema_designer.stage, "schema_designer");
    assert.equal(persistedRunState.steps.formula_builder.stage, "formula_builder");
    assert.equal(persistedRunState.steps.auditor.stage, "auditor");
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
