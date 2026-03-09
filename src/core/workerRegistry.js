import { getAgent } from "../agents/registry.js";

export function createWorker(config = {}) {
  const {
    id,
    mode,
    label = "",
    agentId = null,
    capabilities = [],
    roleIds = []
  } = config;

  if (!isNonEmptyString(id)) {
    throw new TypeError("Worker id must be a non-empty string.");
  }

  if (!isNonEmptyString(mode)) {
    throw new TypeError(`Worker "${id}" must declare a mode.`);
  }

  return Object.freeze({
    id: id.trim(),
    mode: mode.trim(),
    label: normalizeString(label),
    agentId: normalizeOptionalString(agentId),
    capabilities: normalizeStringArray(capabilities),
    roleIds: normalizeStringArray(roleIds)
  });
}

const WORKERS = Object.freeze([
  createWorker({
    id: "website_planning_worker",
    mode: "website",
    label: "Website planning worker",
    agentId: "website_architect",
    capabilities: [
      "planning",
      "requirements_analysis",
      "architecture",
      "change_analysis"
    ],
    roleIds: [
      "request_interpreter",
      "requirements_analyst",
      "change_impact_analyzer",
      "information_architect"
    ]
  }),
  createWorker({
    id: "website_builder_worker",
    mode: "website",
    label: "Website builder worker",
    agentId: "website_coder",
    capabilities: [
      "frontend_coding",
      "bug_fix",
      "refactor",
      "responsive_specialization"
    ],
    roleIds: ["frontend_coder"]
  }),
  createWorker({
    id: "website_review_worker",
    mode: "website",
    label: "Website review worker",
    agentId: "website_ui_critic",
    capabilities: [
      "visual_review",
      "responsive_review",
      "accessibility_review",
      "failure_analysis"
    ],
    roleIds: ["ui_critic", "failure_analyst"]
  }),
  createWorker({
    id: "website_validation_worker",
    mode: "website",
    label: "Website validation worker",
    agentId: "website_validator",
    capabilities: ["validation", "compliance", "retry_planning"],
    roleIds: ["retry_planner", "validator_gate"]
  })
]);

const WORKER_MAP = new Map(WORKERS.map((worker) => [worker.id, worker]));

export function getWorker(workerId) {
  return WORKER_MAP.get(normalizeOptionalString(workerId)) ?? null;
}

export function listWorkersByMode(mode) {
  const normalizedMode = normalizeOptionalString(mode);
  return WORKERS.filter((worker) => worker.mode === normalizedMode);
}

export function assignWorkerForRole(roleDefinition, { workers = null } = {}) {
  if (!roleDefinition || typeof roleDefinition !== "object") {
    return null;
  }

  const workerPool = Array.isArray(workers)
    ? workers
    : listWorkersByMode(roleDefinition.mode);

  const preferred = workerPool.find(
    (worker) => worker.id === normalizeOptionalString(roleDefinition.preferredWorkerId)
  );

  if (preferred) {
    return preferred;
  }

  const exactRoleMatch = workerPool.find((worker) => worker.roleIds.includes(roleDefinition.id));
  if (exactRoleMatch) {
    return exactRoleMatch;
  }

  const capabilityMatch = workerPool.find((worker) =>
    roleDefinition.requiredCapabilities.every((capability) =>
      worker.capabilities.includes(capability)
    )
  );

  if (capabilityMatch) {
    return capabilityMatch;
  }

  return workerPool[0] ?? null;
}

export function resolveAgentForWorker(worker) {
  if (!worker?.agentId) {
    return null;
  }

  return getAgent(worker.agentId);
}

export function summarizeWorker(worker) {
  if (!worker || typeof worker !== "object") {
    return null;
  }

  return {
    id: worker.id ?? null,
    mode: worker.mode ?? null,
    label: worker.label ?? "",
    agentId: worker.agentId ?? null,
    capabilities: normalizeStringArray(worker.capabilities),
    roleIds: normalizeStringArray(worker.roleIds)
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
