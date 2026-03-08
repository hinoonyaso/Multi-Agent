import {
  loadContract,
  loadCoreSystemPrompt,
  loadModePrompt,
  loadRolePrompt
} from "./promptLoader.js";

export async function buildRouterPrompt(input) {
  const [coreSystemPrompt, rolePrompt, contractSummary] = await Promise.all([
    loadCoreSystemPrompt(),
    loadRolePrompt("router"),
    loadContractSummary(resolveModeForRouting(input))
  ]);

  return assemblePrompt({
    coreSystemPrompt,
    rolePrompt,
    modePrompt: null,
    contractSummary,
    inputBlock: input
  });
}

export async function buildPlannerPrompt(input) {
  const [coreSystemPrompt, rolePrompt, contractSummary] = await Promise.all([
    loadCoreSystemPrompt(),
    loadRolePrompt("planner"),
    loadContractSummary(resolveModeFromInput(input))
  ]);

  return assemblePrompt({
    coreSystemPrompt,
    rolePrompt,
    modePrompt: null,
    contractSummary,
    inputBlock: input
  });
}

export async function buildModeAgentPrompt({ mode, agent, input } = {}) {
  const normalizedMode = normalizeRequiredName(mode, "mode");
  const normalizedAgent = normalizeRequiredName(agent, "agent");

  if (normalizedAgent === "finalizer") {
    return buildFinalizerPrompt({
      mode: normalizedMode,
      input
    });
  }

  const [coreSystemPrompt, rolePrompt, modePrompt, contractSummary] =
    await Promise.all([
      loadCoreSystemPrompt(),
      safeLoadRolePrompt(normalizedAgent),
      safeLoadModePrompt(normalizedMode, normalizedAgent),
      loadContractSummary(normalizedMode)
    ]);

  return assemblePrompt({
    coreSystemPrompt,
    rolePrompt,
    modePrompt,
    contractSummary,
    inputBlock: input
  });
}

export async function buildFinalizerPrompt({ mode, input } = {}) {
  const normalizedMode = normalizeRequiredName(mode, "mode");
  const [coreSystemPrompt, rolePrompt, modePrompt] = await Promise.all([
    loadCoreSystemPrompt(),
    safeLoadRolePrompt("finalizer"),
    safeLoadModePrompt(normalizedMode, "finalizer")
  ]);

  return assembleFinalizerPrompt({
    coreSystemPrompt,
    rolePrompt,
    modePrompt,
    inputBlock: input
  });
}

function assemblePrompt({
  coreSystemPrompt,
  rolePrompt,
  modePrompt,
  contractSummary,
  inputBlock
}) {
  const sections = [
    createSection("Core System Prompt", coreSystemPrompt),
    createSection("Role Prompt", rolePrompt ?? "Not provided."),
    createSection("Mode Prompt", modePrompt ?? "Not applicable."),
    createSection("Contract Summary", contractSummary),
    createSection("Task Input", formatInputBlock(inputBlock))
  ];

  return `${sections.join("\n\n")}\n`;
}

function assembleFinalizerPrompt({
  coreSystemPrompt,
  rolePrompt,
  modePrompt,
  inputBlock
}) {
  const sections = [
    createSection("System", coreSystemPrompt),
    createSection("Role", rolePrompt ?? "Not provided.")
  ];

  // Finalization should run on the smallest useful prompt surface. Only include
  // a mode-specific addendum when a real finalizer prompt exists for that mode.
  if (modePrompt) {
    sections.push(createSection("Mode", modePrompt));
  }

  sections.push(createSection("Input", formatInputBlock(inputBlock)));

  return `${sections.join("\n\n")}\n`;
}

function createSection(title, body) {
  return `=== ${title} ===\n${normalizeSectionBody(body)}`;
}

function normalizeSectionBody(value) {
  if (typeof value !== "string") {
    return String(value ?? "");
  }

  return value.trim() || "None.";
}

function formatInputBlock(input) {
  return [
    "```json",
    stableStringify(input ?? {}),
    "```"
  ].join("\n");
}

async function loadContractSummary(mode) {
  if (!mode) {
    return "No active mode contract.";
  }

  const contract = await safeLoadContract(mode);

  if (!contract) {
    return `No contract found for mode '${mode}'.`;
  }

  return summarizeContract(contract);
}

function summarizeContract(contract) {
  const lines = [
    `mode: ${normalizeInline(contract.mode) || "unknown"}`,
    `version: ${normalizeInline(contract.version) || "unknown"}`,
    `artifact_kind: ${normalizeInline(contract.artifact_kind) || "unknown"}`,
    `supported_output_types: ${joinInlineList(contract.supported_output_types)}`,
    `required_metadata_fields: ${joinInlineList(
      contract?.required_deliverables?.artifact_metadata?.fields
    )}`,
    "required_deliverables:",
    ...formatRequiredDeliverables(contract.required_deliverables),
    "minimum_quality_checks:",
    ...formatList(contract.minimum_quality_checks),
    "validation_rules:",
    ...formatList(contract.validation_rules),
    "failure_conditions:",
    ...formatList(contract.failure_conditions)
  ];

  return lines.join("\n");
}

function formatRequiredDeliverables(requiredDeliverables) {
  if (!requiredDeliverables || typeof requiredDeliverables !== "object") {
    return ["- None"];
  }

  const entries = Object.keys(requiredDeliverables)
    .sort()
    .map((key) => formatRequiredDeliverable(key, requiredDeliverables[key]))
    .filter(Boolean);

  return entries.length > 0 ? entries : ["- None"];
}

function formatRequiredDeliverable(name, value) {
  if (!value || typeof value !== "object") {
    return `- ${name}`;
  }

  const parts = [];

  if (typeof value.required === "boolean") {
    parts.push(`required=${value.required}`);
  }

  if (Number.isInteger(value.minimum_count)) {
    parts.push(`minimum_count=${value.minimum_count}`);
  }

  if (Array.isArray(value.fields) && value.fields.length > 0) {
    parts.push(`fields=${value.fields.join(", ")}`);
  }

  if (Array.isArray(value.allowed_examples) && value.allowed_examples.length > 0) {
    parts.push(`allowed_examples=${value.allowed_examples.join(", ")}`);
  }

  if (Array.isArray(value.requirements) && value.requirements.length > 0) {
    parts.push(`requirements=${value.requirements.join(" | ")}`);
  }

  if (Array.isArray(value.rules) && value.rules.length > 0) {
    parts.push(`rules=${value.rules.join(" | ")}`);
  }

  return parts.length > 0 ? `- ${name}: ${parts.join("; ")}` : `- ${name}`;
}

function formatList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return ["- None"];
  }

  return items.map((item) => `- ${normalizeInline(item)}`);
}

function joinInlineList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "none";
  }

  return items.map((item) => normalizeInline(item)).filter(Boolean).join(", ");
}

function normalizeInline(value) {
  if (typeof value !== "string") {
    return value == null ? "" : String(value);
  }

  return value.replace(/\s+/g, " ").trim();
}

async function safeLoadRolePrompt(name) {
  try {
    return await loadRolePrompt(name);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function safeLoadModePrompt(mode, name) {
  try {
    return await loadModePrompt(mode, name);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function safeLoadContract(mode) {
  try {
    return await loadContract(mode);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function resolveModeForRouting(input) {
  return normalizeOptionalName(
    input?.selectedMode ?? input?.modeHint ?? input?.mode ?? null
  );
}

function resolveModeFromInput(input) {
  return normalizeOptionalName(
    input?.selectedMode ??
      input?.mode ??
      input?.modeHint ??
      input?.routing?.primary_mode ??
      input?.routing?.mode ??
      null
  );
}

function normalizeRequiredName(value, label) {
  const normalized = normalizeOptionalName(value);

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function normalizeOptionalName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value), null, 2);
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = sortValue(value[key]);
        return result;
      }, {});
  }

  return value;
}
