import { loadContract } from "./promptLoader.js";

const WEBSITE_ENTRY_CANDIDATES = new Set([
  "index.html",
  "main.html",
  "app.html",
  "src/main.jsx",
  "src/main.js",
  "src/main.tsx",
  "src/main.ts",
  "src/app.jsx",
  "src/app.js",
  "src/app.tsx",
  "src/app.ts",
  "app.jsx",
  "app.js",
  "app.tsx",
  "app.ts"
]);

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
  sheet_formula_builder: createRoleSpec(
    ["tabs", "workbook_checks"],
    {
      tabs: "array",
      workbook_checks: "array"
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

  const result = {
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

  if (contract.mode === "website") {
    const websiteFiles = validateWebsiteFiles(parsed?.files);
    const websiteContract = validateWebsiteAgainstContract(parsed?.files, contract, parsed);
    const website = mergeValidationResults(websiteFiles, websiteContract);

    result.website = website;
    result.websiteFiles = websiteFiles;
    result.websiteContract = websiteContract;
    result.ok &&= website.pass;
    result.errors.push(...website.violations);
    result.warnings.push(...website.warnings);
  }

  return result;
}

export function validateWebsiteFiles(files) {
  const result = {
    pass: true,
    violations: [],
    warnings: []
  };

  if (!Array.isArray(files)) {
    result.pass = false;
    result.violations.push(
      createIssue(
        "website_files_missing",
        "Field 'files' must be an array.",
        "files"
      )
    );
    return result;
  }

  const seenPaths = new Set();
  const normalizedPaths = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const filePath = `files[${index}]`;

    if (!isPlainObject(file)) {
      result.pass = false;
      result.violations.push(
        createIssue(
          "website_file_invalid",
          "Each file must be an object with 'path' and 'content'.",
          filePath
        )
      );
      continue;
    }

    const rawPath = typeof file.path === "string" ? file.path.trim() : "";
    const rawContent = typeof file.content === "string" ? file.content : "";

    if (!rawPath) {
      result.pass = false;
      result.violations.push(
        createIssue(
          "website_file_missing_path",
          "Each file must include a non-empty 'path'.",
          `${filePath}.path`
        )
      );
    } else {
      const normalizedPath = normalizeWebsiteFilePath(rawPath);

      if (seenPaths.has(normalizedPath)) {
        result.pass = false;
        result.violations.push(
          createIssue(
            "website_file_duplicate_path",
            `File path '${rawPath}' must be unique.`,
            `${filePath}.path`
          )
        );
      } else {
        seenPaths.add(normalizedPath);
        normalizedPaths.push(normalizedPath);
      }
    }

    if (typeof file.content !== "string") {
      result.pass = false;
      result.violations.push(
        createIssue(
          "website_file_missing_content",
          "Each file must include string 'content'.",
          `${filePath}.content`
        )
      );
      continue;
    }

    if (!rawContent.trim()) {
      result.pass = false;
      result.violations.push(
        createIssue(
          "website_file_empty_content",
          "Each file must include non-empty content.",
          `${filePath}.content`
        )
      );
    }
  }

  if (files.length === 0) {
    result.pass = false;
    result.violations.push(
      createIssue(
        "website_files_empty",
        "At least one file must be provided.",
        "files"
      )
    );
  }

  if (!normalizedPaths.some((filePath) => isWebsiteEntryCandidate(filePath))) {
    result.pass = false;
    result.violations.push(
      createIssue(
        "website_entry_file_missing",
        "At least one likely frontend entry file must exist.",
        "files",
        {
          expectedCandidates: [...WEBSITE_ENTRY_CANDIDATES]
        }
      )
    );
  }

  if (
    normalizedPaths.length > 0 &&
    !normalizedPaths.some((filePath) => filePath.endsWith(".html"))
  ) {
    result.warnings.push(
      createIssue(
        "website_no_html_file",
        "No HTML file was found. This may be valid for some app setups, but verify the delivered entry flow.",
        "files"
      )
    );
  }

  return result;
}

export function validateWebsiteAgainstContract(files, contract, parsed = null) {
  const result = {
    pass: true,
    violations: [],
    warnings: []
  };

  if (!Array.isArray(files)) {
    result.pass = false;
    result.violations.push(
      createIssue(
        "website_contract_files_missing",
        "Cannot apply website contract checks because 'files' is not a valid array.",
        "files"
      )
    );
    return result;
  }

  if (!isPlainObject(contract)) {
    result.warnings.push(
      createIssue(
        "website_contract_unavailable",
        "Website contract was not available for deterministic post-checks.",
        "$"
      )
    );
    return result;
  }

  const fileFacts = collectWebsiteFileFacts(files);
  const requiredDeliverables = contract.required_deliverables ?? {};

  applyRequiredDeliverableChecks(result, fileFacts, requiredDeliverables);
  applyEntrypointContractChecks(result, fileFacts, requiredDeliverables.entrypoints);
  applyValidationSchemaChecks(result, fileFacts, contract, parsed);

  return result;
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

function mergeValidationResults(...results) {
  const merged = {
    pass: true,
    violations: [],
    warnings: []
  };

  for (const result of results) {
    if (!result || typeof result !== "object") {
      continue;
    }

    merged.pass &&= result.pass !== false;
    appendUniqueIssues(merged.violations, result.violations);
    appendUniqueIssues(merged.warnings, result.warnings);
  }

  return merged;
}

function appendUniqueIssues(target, issues) {
  if (!Array.isArray(issues)) {
    return;
  }

  for (const issue of issues) {
    if (!isPlainObject(issue)) {
      continue;
    }

    const exists = target.some(
      (entry) =>
        entry.code === issue.code &&
        entry.path === issue.path &&
        entry.message === issue.message
    );

    if (!exists) {
      target.push(issue);
    }
  }
}

function collectWebsiteFileFacts(files) {
  const normalizedPaths = files
    .filter((file) => isPlainObject(file))
    .map((file) => normalizeWebsiteFilePath(file.path ?? ""))
    .filter(Boolean);
  const contents = files
    .filter((file) => isPlainObject(file) && typeof file.content === "string")
    .map((file) => file.content);
  const allContractText = contents.join("\n").toLowerCase();

  return {
    count: normalizedPaths.length,
    paths: normalizedPaths,
    hasEntryCandidate: normalizedPaths.some((filePath) => isWebsiteEntryCandidate(filePath)),
    hasHtmlFile: normalizedPaths.some((filePath) => filePath.endsWith(".html")),
    hasCssFile: normalizedPaths.some((filePath) =>
      [".css", ".scss", ".sass", ".less"].some((suffix) => filePath.endsWith(suffix))
    ),
    hasRuntimeScriptFile: normalizedPaths.some((filePath) =>
      [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].some((suffix) =>
        filePath.endsWith(suffix)
      )
    ),
    hasPackageJson: normalizedPaths.includes("package.json"),
    hasSrcDirectoryFile: normalizedPaths.some((filePath) => filePath.startsWith("src/")),
    hasStyleMarker:
      normalizedPaths.some((filePath) =>
        [".css", ".scss", ".sass", ".less"].some((suffix) => filePath.endsWith(suffix))
      ) || allContractText.includes("<style"),
    hasInteractionMarker:
      normalizedPaths.some((filePath) =>
        [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].some((suffix) =>
          filePath.endsWith(suffix)
        )
      ) ||
      allContractText.includes("<script") ||
      allContractText.includes("addEventListener".toLowerCase()),
    hasReactRuntimeEntry: normalizedPaths.some((filePath) =>
      [
        "src/main.jsx",
        "src/main.js",
        "src/main.tsx",
        "src/main.ts"
      ].includes(filePath)
    )
  };
}

function applyRequiredDeliverableChecks(result, fileFacts, requiredDeliverables) {
  if (!isPlainObject(requiredDeliverables)) {
    return;
  }

  if (requiredDeliverables.files?.required && fileFacts.count === 0) {
    result.pass = false;
    result.violations.push(
      createIssue(
        "website_contract_missing_files_deliverable",
        "Contract requires delivered files, but no valid files were found.",
        "files"
      )
    );
  }

  if (requiredDeliverables.entrypoints?.required && !fileFacts.hasEntryCandidate) {
    result.pass = false;
    result.violations.push(
      createIssue(
        "website_contract_missing_entrypoint_deliverable",
        "Contract requires an entrypoint deliverable, but no likely frontend entry file was found.",
        "files"
      )
    );
  }

  if (requiredDeliverables.implementation_scope?.required && !hasFrontendImplementation(fileFacts)) {
    result.pass = false;
    result.violations.push(
      createIssue(
        "website_contract_missing_implementation_scope",
        "Contract requires an implementation-ready frontend, but the delivered files do not show clear frontend structure markers.",
        "files"
      )
    );
  }
}

function applyEntrypointContractChecks(result, fileFacts, entrypointsContract) {
  if (!isPlainObject(entrypointsContract) || entrypointsContract.required !== true) {
    return;
  }

  const allowedExamples = normalizeAllowedExamples(entrypointsContract.allowed_examples);

  if (
    allowedExamples.length > 0 &&
    !fileFacts.paths.some((filePath) => allowedExamples.includes(filePath))
  ) {
    result.pass = false;
    result.violations.push(
      createIssue(
        "website_contract_entrypoint_examples_missing",
        "Contract entrypoint expectation was not satisfied by any delivered file.",
        "files",
        {
          allowedExamples: entrypointsContract.allowed_examples
        }
      )
    );
  }
}

function applyValidationSchemaChecks(result, fileFacts, contract, parsed) {
  const schema = contract?.validation_schema;
  if (!isPlainObject(schema)) {
    return;
  }

  const outputType = typeof parsed?.output_type === "string" ? parsed.output_type : null;

  if (schema.required_entrypoints === true && !fileFacts.hasEntryCandidate) {
    result.pass = false;
    result.violations.push(
      createIssue(
        "website_schema_missing_entrypoints",
        "Schema requires entrypoints, but no valid entry file was found.",
        "files"
      )
    );
  }

  if (Array.isArray(schema.allowed_output_types) && outputType && !schema.allowed_output_types.includes(outputType)) {
    result.pass = false;
    result.violations.push(
      createIssue(
        "website_schema_invalid_output_type",
        `Output type must be one of: ${schema.allowed_output_types.join(", ")}.`,
        "output_type"
      )
    );
  }

  const mustHaveHtml = schema.must_have_html;
  if (isPlainObject(mustHaveHtml) && mustHaveHtml.required === true) {
    const whenMet =
      outputType === mustHaveHtml.when ||
      (!outputType && mustHaveHtml.when === "static_html_css_js");
    if (whenMet && !fileFacts.hasHtmlFile) {
      result.pass = false;
      result.violations.push(
        createIssue(
          "website_schema_missing_html_entry",
          "Schema expects an HTML entry file for this output type, but none was delivered.",
          "files"
        )
      );
    }
  }

  if (schema.requires_package_json_if_react === true && fileFacts.hasReactRuntimeEntry && !fileFacts.hasPackageJson) {
    result.pass = false;
    result.violations.push(
      createIssue(
        "website_schema_missing_package_json",
        "Schema requires package.json for React app output, but it was not delivered.",
        "files"
      )
    );
  }

  if (schema.requires_style_evidence === true && !fileFacts.hasStyleMarker) {
    result.warnings.push(
      createIssue(
        "website_schema_styling_not_detected",
        "Schema requires style evidence, but no explicit styling file or inline style block was detected.",
        "files"
      )
    );
  }

  if (schema.requires_src_structure_if_react === true && fileFacts.hasReactRuntimeEntry && !fileFacts.hasSrcDirectoryFile) {
    result.pass = false;
    result.violations.push(
      createIssue(
        "website_schema_missing_src_structure",
        "Schema expects a src-based app structure for React, but no files were delivered under 'src/'.",
        "files"
      )
    );
  }

  if (schema.requires_interaction_evidence === true || (isPlainObject(schema.requires_interaction_evidence) && schema.requires_interaction_evidence.required)) {
    if (!fileFacts.hasInteractionMarker) {
      const severity = isPlainObject(schema.requires_interaction_evidence) && schema.requires_interaction_evidence.required
        ? "violation"
        : "warning";
      if (severity === "violation") {
        result.pass = false;
        result.violations.push(
          createIssue(
            "website_schema_interaction_not_detected",
            "Schema requires interaction evidence, but no explicit script or event handler was detected.",
            "files"
          )
        );
      } else {
        result.warnings.push(
          createIssue(
            "website_schema_interaction_not_detected",
            "Schema references interaction logic; verify that script markers or event handlers are present.",
            "files"
          )
        );
      }
    }
  }

  if (schema.requires_dedicated_assets_for_non_trivial === true) {
    if (fileFacts.count > 1 && !(fileFacts.hasCssFile || fileFacts.hasRuntimeScriptFile)) {
      result.warnings.push(
        createIssue(
          "website_schema_missing_dedicated_assets",
          "Schema recommends dedicated CSS or JS files for non-trivial output, but none were detected.",
          "files"
        )
      );
    }
  }
}

function normalizeWebsiteFilePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\/+/, "").toLowerCase();
}

function isWebsiteEntryCandidate(filePath) {
  if (WEBSITE_ENTRY_CANDIDATES.has(filePath)) {
    return true;
  }

  return (
    filePath.endsWith("/index.html") ||
    filePath.endsWith("/main.html") ||
    filePath.endsWith("/app.html") ||
    filePath.endsWith("/src/main.jsx") ||
    filePath.endsWith("/src/main.js") ||
    filePath.endsWith("/src/main.tsx") ||
    filePath.endsWith("/src/main.ts") ||
    filePath.endsWith("/src/app.jsx") ||
    filePath.endsWith("/src/app.js") ||
    filePath.endsWith("/src/app.tsx") ||
    filePath.endsWith("/src/app.ts") ||
    filePath.endsWith("/app.jsx") ||
    filePath.endsWith("/app.js") ||
    filePath.endsWith("/app.tsx") ||
    filePath.endsWith("/app.ts")
  );
}

function normalizeAllowedExamples(allowedExamples) {
  if (!Array.isArray(allowedExamples)) {
    return [];
  }

  return allowedExamples
    .filter((value) => typeof value === "string")
    .map((value) => normalizeWebsiteFilePath(value))
    .filter(Boolean);
}

function hasFrontendImplementation(fileFacts) {
  return (
    fileFacts.hasHtmlFile ||
    fileFacts.hasRuntimeScriptFile ||
    fileFacts.hasStyleMarker ||
    fileFacts.hasPackageJson
  );
}
