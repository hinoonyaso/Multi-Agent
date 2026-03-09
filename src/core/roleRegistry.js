export function createRoleDefinition(config = {}) {
  const {
    id,
    mode,
    kind = "internal",
    description = "",
    inputs = [],
    outputs = [],
    activationRules = [],
    preferredWorkerId = null,
    requiredCapabilities = [],
    stageName = null,
    stepKey = null
  } = config;

  if (!isNonEmptyString(id)) {
    throw new TypeError("Role id must be a non-empty string.");
  }

  if (!isNonEmptyString(mode)) {
    throw new TypeError(`Role "${id}" must declare a mode.`);
  }

  if (!["internal", "llm"].includes(kind)) {
    throw new TypeError(`Role "${id}" kind must be "internal" or "llm".`);
  }

  return Object.freeze({
    id: id.trim(),
    mode: mode.trim(),
    kind,
    description: normalizeString(description),
    inputs: normalizeStringArray(inputs),
    outputs: normalizeStringArray(outputs),
    activationRules: normalizeStringArray(activationRules),
    preferredWorkerId: normalizeOptionalString(preferredWorkerId),
    requiredCapabilities: normalizeStringArray(requiredCapabilities),
    stageName: normalizeOptionalString(stageName),
    stepKey: normalizeOptionalString(stepKey)
  });
}

export function createRoleRegistry(roleDefinitions = []) {
  const definitions = roleDefinitions.map((entry) => createRoleDefinition(entry));
  const roleMap = new Map(definitions.map((role) => [role.id, role]));

  return Object.freeze({
    list() {
      return definitions.slice();
    },
    get(roleId) {
      return roleMap.get(normalizeOptionalString(roleId)) ?? null;
    },
    listByMode(mode) {
      const normalizedMode = normalizeOptionalString(mode);
      return definitions.filter((role) => role.mode === normalizedMode);
    }
  });
}

export function summarizeRoleDefinition(roleDefinition) {
  if (!roleDefinition || typeof roleDefinition !== "object") {
    return null;
  }

  return {
    id: roleDefinition.id ?? null,
    mode: roleDefinition.mode ?? null,
    kind: roleDefinition.kind ?? null,
    description: roleDefinition.description ?? "",
    inputs: normalizeStringArray(roleDefinition.inputs),
    outputs: normalizeStringArray(roleDefinition.outputs),
    activationRules: normalizeStringArray(roleDefinition.activationRules),
    preferredWorkerId: normalizeOptionalString(roleDefinition.preferredWorkerId),
    requiredCapabilities: normalizeStringArray(roleDefinition.requiredCapabilities),
    stageName: normalizeOptionalString(roleDefinition.stageName),
    stepKey: normalizeOptionalString(roleDefinition.stepKey)
  };
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

function normalizeOptionalString(value) {
  return isNonEmptyString(value) ? value.trim() : null;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}
