import { loadContract } from "./promptLoader.js";

const ROLE_SPECS = {
  critic: createRoleSpec(
    ["critical_issues", "minor_issues", "approved_if_fixed"],
    {
      critical_issues: "array",
      minor_issues: "array",
      approved_if_fixed: "boolean"
    }
  ),
  deep_research_citation_checker: createRoleSpec(
    [
      "unsupported_or_weak_claims",
      "coverage_assessment",
      "final_recommendation"
    ],
    {
      unsupported_or_weak_claims: "array",
      coverage_assessment: "string",
      final_recommendation: "string"
    }
  ),
  deep_research_query_planner: createRoleSpec(
    ["research_goal", "sub_questions", "evidence_plan"],
    {
      research_goal: "string",
      sub_questions: "array",
      evidence_plan: "array"
    }
  ),
  deep_research_synthesizer: createRoleSpec(
    [
      "executive_summary",
      "key_findings",
      "conflicts_or_uncertainties",
      "recommended_conclusion"
    ],
    {
      executive_summary: "string",
      key_findings: "array",
      conflicts_or_uncertainties: "array",
      recommended_conclusion: "string"
    }
  ),
  docx_editor: createRoleSpec(
    ["edited_body_markdown", "changes_made", "remaining_issues"],
    {
      edited_body_markdown: "string",
      changes_made: "array",
      remaining_issues: "array"
    }
  ),
  docx_outline_builder: createRoleSpec(
    ["document_title", "target_audience", "tone", "sections"],
    {
      document_title: "string",
      target_audience: "string",
      tone: "string",
      sections: "array"
    }
  ),
  docx_writer: createRoleSpec(
    ["title", "body_markdown", "notes_for_editor"],
    {
      title: "string",
      body_markdown: "string",
      notes_for_editor: "array"
    }
  ),
  finalizer: createRoleSpec(
    ["final_mode", "deliverables", "delivery_notes"],
    {
      final_mode: "string",
      deliverables: "array",
      delivery_notes: "array"
    }
  ),
  planner: createRoleSpec(
    [
      "mode",
      "execution_steps",
      "artifact_contract",
      "open_questions_to_resolve",
      "risks"
    ],
    {
      mode: "string",
      execution_steps: "array",
      artifact_contract: "object",
      open_questions_to_resolve: "array",
      risks: "array"
    }
  ),
  researcher: createRoleSpec(
    ["research_summary", "unresolved_gaps", "recommendations_for_next_stage"],
    {
      research_summary: "array",
      unresolved_gaps: "array",
      recommendations_for_next_stage: "array"
    }
  ),
  router: createRoleSpec(
    [
      "primary_mode",
      "task_type",
      "requires_research",
      "selected_agents",
      "reasoning_summary",
      "risks"
    ],
    {
      primary_mode: "string",
      task_type: "string",
      requires_research: "boolean",
      selected_agents: "array",
      reasoning_summary: "array",
      risks: "array"
    }
  ),
  sheet_auditor: createRoleSpec(
    ["issues", "strengths", "final_recommendation"],
    {
      issues: "array",
      strengths: "array",
      final_recommendation: "string"
    }
  ),
  sheet_schema_designer: createRoleSpec(
    ["workbook_name", "tabs", "data_flow_notes"],
    {
      workbook_name: "string",
      tabs: "array",
      data_flow_notes: "array"
    }
  ),
  slide_strategist: createRoleSpec(
    ["presentation_title", "audience", "core_message", "slides"],
    {
      presentation_title: "string",
      audience: "string",
      core_message: "string",
      slides: "array"
    }
  ),
  slide_writer: createRoleSpec(["slides"], {
    slides: "array"
  }),
  website_architect: createRoleSpec(
    [
      "site_type",
      "pages",
      "design_system_guidance",
      "implementation_notes"
    ],
    {
      site_type: "string",
      pages: "array",
      design_system_guidance: "object",
      implementation_notes: "array"
    }
  ),
  website_coder: createRoleSpec(
    ["files", "build_notes", "known_limitations"],
    {
      files: "array",
      build_notes: "array",
      known_limitations: "array"
    }
  ),
  website_ui_critic: createRoleSpec(
    ["issues", "passes", "final_recommendation"],
    {
      issues: "array",
      passes: "array",
      final_recommendation: "string"
    }
  )
};

export function parseJsonSafely(text) {
  if (typeof text !== "string") {
    return {
      ok: false,
      value: null,
      error: {
        code: "invalid_json_input",
        message: "Expected a JSON string."
      }
    };
  }

  const trimmed = text.trim();

  if (!trimmed) {
    return {
      ok: false,
      value: null,
      error: {
        code: "empty_json_input",
        message: "Expected non-empty JSON text."
      }
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(trimmed),
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      value: null,
      error: {
        code: "invalid_json",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export function validateRoleOutput(roleName, parsed) {
  const normalizedRoleName = normalizeRoleName(roleName);
  const spec = ROLE_SPECS[normalizedRoleName];

  if (!spec) {
    return {
      ok: true,
      kind: "role",
      roleName: normalizedRoleName,
      skipped: true,
      expectedFields: [],
      missingFields: [],
      unexpectedFields: [],
      errors: [],
      warnings: [
        {
          code: "unknown_role",
          message: `No validation spec is defined for role '${normalizedRoleName}'.`
        }
      ]
    };
  }

  return validateAgainstSpec({
    kind: "role",
    name: normalizedRoleName,
    parsed,
    spec,
    allowUnknownFields: false
  });
}

export async function validateModeContract(mode, parsed) {
  const contract = await loadContract(mode);
  const requiredFields =
    contract?.required_deliverables?.artifact_metadata?.fields ?? [];

  const spec = {
    requiredFields,
    fieldTypes: inferModeFieldTypes(requiredFields),
    customChecks: [
      (value) =>
        value?.mode === contract.mode
          ? null
          : createIssue(
              "invalid_mode",
              `Field 'mode' must equal '${contract.mode}'.`,
              "mode"
            ),
      (value) =>
        typeof value?.output_type === "string" &&
        contract.supported_output_types.includes(value.output_type)
          ? null
          : createIssue(
              "invalid_output_type",
              `Field 'output_type' must be one of: ${contract.supported_output_types.join(", ")}.`,
              "output_type"
            )
    ]
  };

  return {
    ...(validateAgainstSpec({
      kind: "mode",
      name: contract.mode,
      parsed,
      spec,
      allowUnknownFields: true
    })),
    contractVersion: contract.version,
    artifactKind: contract.artifact_kind,
    supportedOutputTypes: contract.supported_output_types
  };
}

export async function validateOutput({ mode, roleName, output } = {}) {
  const normalized = normalizeOutput(output);
  const result = {
    ok: true,
    expectsJson: Boolean(mode || roleName),
    source: normalized.source,
    parsed: normalized.parsed ?? null,
    json: normalized.json ?? null,
    role: null,
    mode: null,
    errors: [],
    warnings: []
  };

  if (!result.expectsJson) {
    return result;
  }

  if (!normalized.ok) {
    result.ok = false;
    result.errors.push(normalized.error);
    return result;
  }

  if (roleName) {
    result.role = validateRoleOutput(roleName, normalized.parsed);
    result.ok &&= result.role.ok;
    result.errors.push(...result.role.errors);
    result.warnings.push(...result.role.warnings);
  }

  if (mode) {
    result.mode = await validateModeContract(mode, normalized.parsed);
    result.ok &&= result.mode.ok;
    result.errors.push(...result.mode.errors);
    result.warnings.push(...result.mode.warnings);
  }

  return result;
}

function createRoleSpec(requiredFields, fieldTypes = {}) {
  return {
    requiredFields,
    fieldTypes
  };
}

function validateAgainstSpec({
  kind,
  name,
  parsed,
  spec,
  allowUnknownFields
}) {
  const result = {
    ok: true,
    kind,
    [`${kind}Name`]: name,
    expectedFields: [...spec.requiredFields],
    missingFields: [],
    unexpectedFields: [],
    errors: [],
    warnings: []
  };

  if (!isPlainObject(parsed)) {
    result.ok = false;
    result.errors.push(
      createIssue(
        "invalid_root_type",
        "Parsed output must be a JSON object.",
        "$"
      )
    );
    return result;
  }

  const keys = Object.keys(parsed);
  result.missingFields = spec.requiredFields.filter((field) => !(field in parsed));

  if (result.missingFields.length > 0) {
    result.ok = false;
    result.errors.push(
      ...result.missingFields.map((field) =>
        createIssue(
          "missing_field",
          `Missing required field '${field}'.`,
          field
        )
      )
    );
  }

  if (!allowUnknownFields) {
    result.unexpectedFields = keys.filter(
      (field) => !spec.requiredFields.includes(field)
    );

    if (result.unexpectedFields.length > 0) {
      result.ok = false;
      result.errors.push(
        ...result.unexpectedFields.map((field) =>
          createIssue(
            "unexpected_field",
            `Unexpected field '${field}'.`,
            field
          )
        )
      );
    }
  }

  for (const [field, expectedType] of Object.entries(spec.fieldTypes ?? {})) {
    if (!(field in parsed)) {
      continue;
    }

    if (!matchesType(parsed[field], expectedType)) {
      result.ok = false;
      result.errors.push(
        createIssue(
          "invalid_field_type",
          `Field '${field}' must be ${expectedType}.`,
          field,
          {
            expectedType,
            actualType: describeType(parsed[field])
          }
        )
      );
    }
  }

  for (const check of spec.customChecks ?? []) {
    const issue = check(parsed);

    if (issue) {
      result.ok = false;
      result.errors.push(issue);
    }
  }

  return result;
}

function normalizeOutput(output) {
  if (typeof output === "string") {
    const json = parseJsonSafely(output);

    return {
      ...json,
      source: "text",
      parsed: json.value
    };
  }

  if (isCodexRunResult(output)) {
    const json = parseJsonSafely(output.stdout ?? "");

    return {
      ...json,
      source: "codex_stdout",
      parsed: json.value
    };
  }

  if (isPlainObject(output) || Array.isArray(output)) {
    return {
      ok: true,
      source: "object",
      parsed: output,
      json: null,
      error: null
    };
  }

  return {
    ok: false,
    source: "unknown",
    parsed: null,
    json: null,
    error: createIssue(
      "unsupported_output_type",
      "Output must be a JSON string, a parsed object, or a Codex runner result.",
      "$"
    )
  };
}

function inferModeFieldTypes(requiredFields) {
  return Object.fromEntries(
    requiredFields
      .map((field) => [field, guessFieldType(field)])
      .filter(([, type]) => Boolean(type))
  );
}

function guessFieldType(fieldName) {
  if (fieldName === "mode" || fieldName === "output_type") {
    return "string";
  }

  if (fieldName === "files" || fieldName === "entrypoints" || fieldName === "sections" || fieldName === "slides" || fieldName === "findings" || fieldName === "sources") {
    return "array";
  }

  return null;
}

function createIssue(code, message, path, details) {
  return {
    code,
    message,
    path,
    ...(details ? { details } : {})
  };
}

function normalizeRoleName(roleName) {
  if (typeof roleName !== "string" || !roleName.trim()) {
    throw new TypeError("roleName must be a non-empty string.");
  }

  return roleName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function matchesType(value, expectedType) {
  if (expectedType === "array") {
    return Array.isArray(value);
  }

  if (expectedType === "object") {
    return isPlainObject(value);
  }

  if (expectedType === "string") {
    return typeof value === "string";
  }

  if (expectedType === "boolean") {
    return typeof value === "boolean";
  }

  if (expectedType === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }

  return true;
}

function describeType(value) {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function isCodexRunResult(value) {
  return isPlainObject(value) && typeof value.stdout === "string";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
