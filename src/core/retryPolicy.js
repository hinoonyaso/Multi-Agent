export const RETRY_ERROR_TYPES = Object.freeze({
  PROCESS_FAILURE: "process_failure",
  INVALID_JSON_OUTPUT: "invalid_json_output",
  CONTRACT_VALIDATION_FAILURE: "contract_validation_failure",
  CRITIC_REQUESTED_REVISION: "critic_requested_revision"
});

const DEFAULT_BACKOFF_MS = 500;

const DEFAULT_RULES = Object.freeze({
  [RETRY_ERROR_TYPES.PROCESS_FAILURE]: {
    maxAttempts: 2,
    instruction:
      "The previous attempt failed before producing a usable result. Retry the same task and avoid repeating the failure."
  },
  [RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT]: {
    maxAttempts: 2,
    instruction:
      "The previous output was not valid JSON. Return valid JSON only, with no markdown fences or extra commentary."
  },
  [RETRY_ERROR_TYPES.CONTRACT_VALIDATION_FAILURE]: {
    maxAttempts: 2,
    instruction:
      "The previous output failed contract validation. Preserve valid content, fix the contract violations, and return only the corrected result."
  },
  [RETRY_ERROR_TYPES.CRITIC_REQUESTED_REVISION]: {
    maxAttempts: 2,
    instruction:
      "The critic requested a revision. Address the cited issues directly while preserving material that already works."
  }
});

export function createRetryPolicy(overrides = {}) {
  const rules = createRules(overrides.rules);

  return {
    maxAttempts: overrides.maxAttempts ?? getHighestMaxAttempts(rules),
    backoffMs: overrides.backoffMs ?? DEFAULT_BACKOFF_MS,
    errorTypes: RETRY_ERROR_TYPES,
    shouldRetry(errorType, attempt) {
      return shouldRetryWithRules(errorType, attempt, rules);
    },
    buildRetryInstruction(errorType, details) {
      return buildRetryInstructionWithRules(errorType, details, rules);
    },
    maxAttemptsFor(errorType) {
      return maxAttemptsForWithRules(errorType, rules);
    }
  };
}

export function shouldRetry(errorType, attempt) {
  return shouldRetryInternal(errorType, attempt, DEFAULT_RULES);
}

export function buildRetryInstruction(errorType, details) {
  return buildRetryInstructionInternal(errorType, details, DEFAULT_RULES);
}

export function maxAttemptsFor(errorType) {
  return maxAttemptsForInternal(errorType, DEFAULT_RULES);
}

function createRules(overrideRules = {}) {
  const rules = {};

  for (const errorType of Object.values(RETRY_ERROR_TYPES)) {
    const override = overrideRules[errorType] ?? {};
    rules[errorType] = {
      ...DEFAULT_RULES[errorType],
      ...override
    };
  }

  return rules;
}

function getHighestMaxAttempts(rules) {
  return Math.max(
    ...Object.values(rules).map((rule) => rule.maxAttempts ?? 1),
    1
  );
}

function shouldRetryWithRules(errorType, attempt, rules) {
  return shouldRetryInternal(errorType, attempt, rules);
}

function buildRetryInstructionWithRules(errorType, details, rules) {
  return buildRetryInstructionInternal(errorType, details, rules);
}

function maxAttemptsForWithRules(errorType, rules) {
  return maxAttemptsForInternal(errorType, rules);
}

function shouldRetryInternal(errorType, attempt, rules) {
  const normalizedAttempt =
    Number.isInteger(attempt) && attempt > 0 ? attempt : 1;

  return normalizedAttempt < maxAttemptsForInternal(errorType, rules);
}

function buildRetryInstructionInternal(errorType, details, rules) {
  const rule = getRule(errorType, rules);
  const detailsText = formatDetails(details);

  return detailsText
    ? `${rule.instruction}\n\nDetails:\n${detailsText}`
    : rule.instruction;
}

function maxAttemptsForInternal(errorType, rules) {
  return getRule(errorType, rules).maxAttempts;
}

function getRule(errorType, rules) {
  return rules[errorType] ?? rules[RETRY_ERROR_TYPES.PROCESS_FAILURE];
}

function formatDetails(details) {
  if (details == null) {
    return "";
  }

  if (typeof details === "string") {
    return details.trim();
  }

  if (Array.isArray(details)) {
    return details
      .map((entry) => stringifyDetail(entry))
      .filter(Boolean)
      .map((entry) => `- ${entry}`)
      .join("\n");
  }

  if (typeof details === "object") {
    return Object.entries(details)
      .map(([key, value]) => {
        const formattedValue = stringifyDetail(value);

        if (!formattedValue) {
          return "";
        }

        return `- ${key}: ${formattedValue}`;
      })
      .filter(Boolean)
      .join("\n");
  }

  return String(details);
}

function stringifyDetail(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => stringifyDetail(entry)).filter(Boolean).join("; ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}
