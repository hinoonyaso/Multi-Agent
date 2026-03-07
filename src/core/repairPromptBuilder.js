export function buildInvalidJsonRepairPrompt({
  roleName,
  rawOutput,
  expectedSchemaSummary
} = {}) {
  return [
    "REPAIR_MODE: INVALID_JSON",
    `ROLE: ${normalizeRoleName(roleName)}`,
    "INSTRUCTION: Rewrite the previous response into exact corrected JSON only.",
    "CONSTRAINTS:",
    "- Preserve valid content where possible.",
    "- Do not add commentary, explanation, markdown, or code fences.",
    "- Return one JSON object or array only, matching the expected schema exactly.",
    expectedSchemaSummary
      ? `- Expected schema summary: ${normalizeInline(expectedSchemaSummary)}`
      : "- Expected schema summary: Not provided.",
    rawOutput
      ? `PREVIOUS_OUTPUT: ${normalizeMultiline(rawOutput)}`
      : "PREVIOUS_OUTPUT: [empty]"
  ].join("\n");
}

export function buildContractRepairPrompt({
  roleName,
  violations,
  previousOutput
} = {}) {
  return [
    "REPAIR_MODE: CONTRACT_VIOLATION",
    `ROLE: ${normalizeRoleName(roleName)}`,
    "INSTRUCTION: Correct the previous JSON so it satisfies the contract exactly.",
    "CONSTRAINTS:",
    "- Preserve valid content where possible.",
    "- Fix only the contract-breaking parts unless another small edit is required for consistency.",
    "- Do not add commentary, explanation, markdown, or code fences.",
    "- Return exact corrected JSON only.",
    "VIOLATIONS:",
    ...formatViolations(violations),
    previousOutput
      ? `PREVIOUS_OUTPUT: ${normalizePreviousOutput(previousOutput)}`
      : "PREVIOUS_OUTPUT: [empty]"
  ].join("\n");
}

function formatViolations(violations) {
  if (!Array.isArray(violations) || violations.length === 0) {
    return ["- No violation details provided. Re-check the full output contract."];
  }

  return violations
    .map((violation) => normalizeViolation(violation))
    .filter(Boolean)
    .map((violation) => `- ${violation}`);
}

function normalizeViolation(violation) {
  if (typeof violation === "string") {
    return normalizeInline(violation);
  }

  if (!violation || typeof violation !== "object") {
    return "";
  }

  const parts = [];

  if (typeof violation.path === "string" && violation.path.trim()) {
    parts.push(`path=${normalizeInline(violation.path)}`);
  }

  if (typeof violation.code === "string" && violation.code.trim()) {
    parts.push(`code=${normalizeInline(violation.code)}`);
  }

  if (typeof violation.message === "string" && violation.message.trim()) {
    parts.push(`message=${normalizeInline(violation.message)}`);
  }

  return parts.join("; ");
}

function normalizePreviousOutput(previousOutput) {
  if (typeof previousOutput === "string") {
    return normalizeMultiline(previousOutput);
  }

  try {
    return normalizeMultiline(JSON.stringify(previousOutput));
  } catch (error) {
    return `[unserializable: ${normalizeInline(error?.message ?? String(error))}]`;
  }
}

function normalizeRoleName(roleName) {
  if (typeof roleName !== "string" || !roleName.trim()) {
    return "unknown_role";
  }

  return roleName.trim();
}

function normalizeInline(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function normalizeMultiline(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
}
