import {
  loadModePrompt,
  loadRolePrompt
} from "../../core/promptLoader.js";
import {
  parseJsonSafely,
  validateOutput
} from "../../core/validator.js";
import {
  createModeRuntime,
  runJsonStage
} from "../shared/pipeline.js";

const MODE_NAME = "sheet";
const DEFAULT_OUTPUT_TYPE = "structured_workbook_json";
const STAGE_ORDER = [
  "schema_designer",
  "formula_builder",
  "auditor",
  "validator",
  "finalizer"
];

export async function runSheetMode(context = {}) {
  const runtime = await createModeRuntime(context);

  const schemaDesigner = await runSchemaDesignerStage(runtime);
  await runtime.save("schema_designer", schemaDesigner);

  const formulaBuilder = await runFormulaBuilderStage(runtime, schemaDesigner);
  await runtime.save("formula_builder", formulaBuilder);

  const artifactCandidate = buildSheetArtifact({
    schemaDesigner: schemaDesigner.parsed,
    formulaBuilder: formulaBuilder.parsed
  });
  const auditor = await runAuditorStage(
    runtime,
    schemaDesigner,
    formulaBuilder,
    artifactCandidate
  );
  await runtime.save("auditor", auditor);

  const validator = await runValidatorStage(
    runtime,
    schemaDesigner,
    formulaBuilder,
    auditor,
    artifactCandidate
  );
  await runtime.save("validator", validator);

  const finalizer = await runFinalizerStage(runtime, artifactCandidate, validator);
  await runtime.save("finalizer", finalizer);

  return extractFinalArtifact(finalizer.parsed) ?? artifactCandidate;
}

async function runSchemaDesignerStage(runtime) {
  const prompt = await loadModePrompt(MODE_NAME, "schema_designer");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "schema_designer",
    roleName: "sheet_schema_designer",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      routing: runtime.routing,
      planning: runtime.planning
    },
    expectedOutput: {
      workbook_name: "Workbook Name",
      tabs: [
        {
          tab_name: "Inputs",
          purpose: "Capture the primary input records.",
          columns: [
            {
              name: "Record ID",
              type: "text",
              required: true,
              description: "Stable unique identifier for each row."
            }
          ]
        }
      ],
      data_flow_notes: []
    }
  });
}

async function runFormulaBuilderStage(runtime, schemaDesigner) {
  const prompt = await loadModePrompt(MODE_NAME, "formula_builder");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "formula_builder",
    roleName: "sheet_formula_builder",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      routing: runtime.routing,
      planning: runtime.planning,
      approved_schema: schemaDesigner.parsed
    },
    expectedOutput: {
      tabs: [
        {
          tab_name: schemaDesigner.parsed?.tabs?.[0]?.tab_name ?? "Inputs",
          role: "input",
          formulas: [],
          validations: [
            {
              scope: "Record ID column",
              rule: "Value must be present",
              condition: "Pass when the cell is not blank",
              message: "Record ID is required."
            }
          ]
        }
      ],
      workbook_checks: []
    }
  });
}

async function runAuditorStage(
  runtime,
  schemaDesigner,
  formulaBuilder,
  artifactCandidate
) {
  const prompt = await loadModePrompt(MODE_NAME, "auditor");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "auditor",
    roleName: "sheet_auditor",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      approved_schema: schemaDesigner.parsed,
      formula_plan: formulaBuilder.parsed,
      workbook: artifactCandidate
    },
    expectedOutput: {
      issues: [],
      strengths: [],
      final_recommendation: "approve"
    }
  });
}

async function runValidatorStage(
  runtime,
  schemaDesigner,
  formulaBuilder,
  auditor,
  artifactCandidate
) {
  const prompt = await loadRolePrompt("validator");
  const contractValidation = await validateOutput({
    mode: MODE_NAME,
    output: artifactCandidate
  });
  const validatorDecision = decideRevision({
    schemaDesigner,
    formulaBuilder,
    auditor,
    contractValidation
  });

  const stage = await runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "validator",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      approved_schema: schemaDesigner.parsed,
      formula_plan: formulaBuilder.parsed,
      audit: auditor.parsed,
      workbook: artifactCandidate,
      contract_validation: contractValidation,
      revision_signal: validatorDecision
    },
    expectedOutput: {
      status: validatorDecision.needsRevision ? "revise" : "approve",
      reasons: contractValidation.errors.map((issue) => issue.message),
      next_action: validatorDecision.needsRevision
        ? "Request a targeted revision from the formula builder stage."
        : "Proceed to final packaging."
    }
  });

  return {
    ...stage,
    contractValidation,
    approval: {
      ok: contractValidation.ok && !validatorDecision.needsRevision,
      recommendation: validatorDecision.needsRevision ? "revise" : "approve"
    },
    revision: {
      ...validatorDecision,
      // TODO: Use retryPolicy plus targeted schema/formula revisions to close
      // workbook audit gaps before final packaging.
      nextTargetStage: validatorDecision.needsRevision ? "formula_builder" : null
    }
  };
}

async function runFinalizerStage(runtime, artifactCandidate, validator) {
  const prompt = await loadRolePrompt("finalizer");
  const deliverableName = artifactCandidate.workbook?.name || "workbook-artifact";

  const stage = await runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "finalizer",
    roleName: "finalizer",
    rolePrompt: prompt,
    input: {
      userRequest: runtime.input.userRequest,
      selectedMode: MODE_NAME,
      approvedDraft: artifactCandidate,
      validation: {
        contract: validator.contractValidation,
        recommendation: validator.approval
      }
    },
    expectedOutput: {
      final_mode: MODE_NAME,
      deliverables: [
        {
          name: deliverableName,
          type: "content",
          content: JSON.stringify(artifactCandidate, null, 2)
        }
      ],
      delivery_notes: []
    }
  });

  return {
    ...stage,
    artifact: extractFinalArtifact(stage.parsed) ?? artifactCandidate,
    revision: {
      needsRevision: false,
      reasons: [],
      // TODO: Route packaging-only failures back through validator once
      // finalizer outputs receive dedicated contract checks.
      nextTargetStage: null
    }
  };
}

function buildSheetArtifact({ schemaDesigner, formulaBuilder }) {
  const schemaTabs = Array.isArray(schemaDesigner?.tabs) ? schemaDesigner.tabs : [];
  const formulaTabs = Array.isArray(formulaBuilder?.tabs) ? formulaBuilder.tabs : [];
  const formulaTabsByName = new Map(
    formulaTabs
      .filter((tab) => typeof tab?.tab_name === "string")
      .map((tab) => [tab.tab_name, tab])
  );
  const tabs = schemaTabs
    .map((schemaTab) => mergeTabDefinition(schemaTab, formulaTabsByName.get(schemaTab?.tab_name)))
    .filter(Boolean);

  return {
    mode: MODE_NAME,
    output_type: DEFAULT_OUTPUT_TYPE,
    workbook: {
      name: normalizeString(schemaDesigner?.workbook_name),
      tab_order: tabs.map((tab) => tab.tab_name),
      data_flow_notes: normalizeStringArray(schemaDesigner?.data_flow_notes),
      workbook_checks: normalizeStringArray(formulaBuilder?.workbook_checks)
    },
    tabs
  };
}

function mergeTabDefinition(schemaTab, formulaTab) {
  const tabName = normalizeString(schemaTab?.tab_name);

  if (!tabName) {
    return null;
  }

  return {
    tab_name: tabName,
    role: normalizeTabRole(formulaTab?.role, schemaTab?.columns),
    purpose: normalizeString(schemaTab?.purpose),
    schema: normalizeColumns(schemaTab?.columns),
    formulas: normalizeFormulaEntries(formulaTab?.formulas),
    validations: normalizeValidationEntries(formulaTab?.validations),
    audit_checks: normalizeStringArray(formulaTab?.audit_checks)
  };
}

function normalizeTabRole(value, columns) {
  const normalized = normalizeString(value);

  if (normalized) {
    return normalized;
  }

  const hasFormulaColumns = Array.isArray(columns) &&
    columns.some((column) => normalizeString(column?.type) === "formula");

  return hasFormulaColumns ? "calculation" : "input";
}

function normalizeColumns(columns) {
  if (!Array.isArray(columns)) {
    return [];
  }

  return columns
    .filter((column) => typeof column?.name === "string")
    .map((column) => ({
      name: normalizeString(column.name),
      type: normalizeString(column.type),
      required: Boolean(column.required),
      description: normalizeString(column.description)
    }))
    .filter((column) => column.name && column.type);
}

function normalizeFormulaEntries(formulas) {
  if (!Array.isArray(formulas)) {
    return [];
  }

  return formulas
    .filter((entry) => typeof entry?.target === "string" && typeof entry?.formula === "string")
    .map((entry) => ({
      target: normalizeString(entry.target),
      formula: normalizeString(entry.formula),
      purpose: normalizeString(entry.purpose),
      fill_scope: normalizeString(entry.fill_scope)
    }))
    .filter((entry) => entry.target && entry.formula);
}

function normalizeValidationEntries(validations) {
  if (!Array.isArray(validations)) {
    return [];
  }

  return validations
    .filter((entry) => typeof entry?.scope === "string" && typeof entry?.rule === "string")
    .map((entry) => ({
      scope: normalizeString(entry.scope),
      rule: normalizeString(entry.rule),
      condition: normalizeString(entry.condition),
      message: normalizeString(entry.message)
    }))
    .filter((entry) => entry.scope && entry.rule);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractFinalArtifact(finalizerOutput) {
  if (!finalizerOutput || !Array.isArray(finalizerOutput.deliverables)) {
    return null;
  }

  for (const deliverable of finalizerOutput.deliverables) {
    if (typeof deliverable?.content !== "string") {
      continue;
    }

    const parsed = parseJsonSafely(deliverable.content);

    if (parsed.ok && isSheetArtifact(parsed.value)) {
      return parsed.value;
    }
  }

  return null;
}

function isSheetArtifact(value) {
  return value?.mode === MODE_NAME && value?.workbook && Array.isArray(value?.tabs);
}

function decideRevision({
  schemaDesigner,
  formulaBuilder,
  auditor,
  contractValidation
}) {
  const stageInvalid = !schemaDesigner.ok || !formulaBuilder.ok || !auditor.ok;
  const auditNeedsRevision = auditor?.parsed?.final_recommendation === "revise";

  return {
    needsRevision: stageInvalid || auditNeedsRevision || !contractValidation.ok,
    reasons: [
      ...(stageInvalid ? ["sheet_stage_output_invalid"] : []),
      ...(auditNeedsRevision ? ["auditor_requested_revision"] : []),
      ...(!contractValidation.ok ? ["sheet_contract_validation_failed"] : [])
    ]
  };
}

export const sheetModeStageOrder = STAGE_ORDER;
