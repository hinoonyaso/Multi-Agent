const REVISION_BLOCK_START = "[REVISION_INSTRUCTION]";
const REVISION_BLOCK_END = "[/REVISION_INSTRUCTION]";
const MAX_PRESERVE_ITEMS = 3;

export function buildRevisionInstruction({
  mode,
  criticResult,
  previousOutput
} = {}) {
  const normalizedMode = normalizeMode(mode);

  if (normalizedMode === "website") {
    return buildWebsiteRevisionInstruction({
      criticResult,
      previousOutput
    });
  }

  return buildGenericRevisionInstruction({
    mode: normalizedMode,
    criticResult
  });
}

function buildWebsiteRevisionInstruction({ criticResult, previousOutput }) {
  const issues = normalizeWebsiteIssues(criticResult?.issues);
  const criticalIssues = selectCriticalWebsiteIssues(issues);
  const preserveItems = buildWebsitePreserveItems(criticResult, previousOutput);
  const lines = [
    REVISION_BLOCK_START,
    "mode: website",
    "action: revise",
    "preserve:",
    ...preserveItems.map((item) => `- ${item}`),
    "critical_issues:",
    ...formatWebsiteIssueLines(criticalIssues),
    "recommended_fixes:",
    ...formatWebsiteFixLines(criticalIssues),
    REVISION_BLOCK_END
  ];

  return lines.join("\n");
}

function buildGenericRevisionInstruction({ mode, criticResult }) {
  const issues = normalizeGenericIssues(
    criticResult?.critical_issues ?? criticResult?.issues
  );
  const lines = [
    REVISION_BLOCK_START,
    `mode: ${mode || "unknown"}`,
    "action: revise",
    "preserve:",
    "- Keep already-correct parts unchanged unless a listed fix requires a small edit.",
    "critical_issues:",
    ...formatGenericIssueLines(issues),
    "recommended_fixes:",
    ...formatGenericFixLines(issues),
    REVISION_BLOCK_END
  ];

  return lines.join("\n");
}

function normalizeWebsiteIssues(issues) {
  if (!Array.isArray(issues)) {
    return [];
  }

  return issues
    .map((issue) => {
      if (!issue || typeof issue !== "object") {
        return null;
      }

      return {
        severity: normalizeText(issue.severity),
        area: normalizeText(issue.area) || "ui",
        problem: normalizeText(issue.problem),
        recommendedFix: normalizeText(issue.recommended_fix)
      };
    })
    .filter((issue) => issue && issue.problem);
}

function selectCriticalWebsiteIssues(issues) {
  const highSeverity = issues.filter((issue) => issue.severity === "high");

  if (highSeverity.length > 0) {
    return highSeverity;
  }

  const mediumSeverity = issues.filter((issue) => issue.severity === "medium");

  if (mediumSeverity.length > 0) {
    return mediumSeverity;
  }

  return issues;
}

function buildWebsitePreserveItems(criticResult, previousOutput) {
  const preserveItems = [
    "Keep files, structure, and styles that already work unless a listed fix requires a targeted change."
  ];
  const passes = normalizeStringArray(criticResult?.passes).slice(0, MAX_PRESERVE_ITEMS);

  for (const pass of passes) {
    preserveItems.push(`Preserve: ${pass}`);
  }

  const filePaths = extractPreviousOutputFilePaths(previousOutput).slice(0, MAX_PRESERVE_ITEMS);

  if (filePaths.length > 0) {
    preserveItems.push(`Do not add or remove files unless needed. Current files: ${filePaths.join(", ")}`);
  }

  return preserveItems;
}

function formatWebsiteIssueLines(issues) {
  if (issues.length === 0) {
    return ["- None"];
  }

  return issues.map(
    (issue, index) =>
      `- ${index + 1}. [${issue.severity || "unspecified"}] ${issue.area}: ${issue.problem}`
  );
}

function formatWebsiteFixLines(issues) {
  if (issues.length === 0) {
    return ["- None"];
  }

  return issues.map((issue, index) => {
    const fix =
      issue.recommendedFix ||
      `Apply the smallest practical change that resolves the ${issue.area} issue.`;

    return `- ${index + 1}. ${fix}`;
  });
}

function normalizeGenericIssues(issues) {
  if (!Array.isArray(issues)) {
    return [];
  }

  return issues
    .map((issue) => normalizeGenericIssue(issue))
    .filter(Boolean);
}

function normalizeGenericIssue(issue) {
  if (typeof issue === "string") {
    const value = normalizeText(issue);

    return value
      ? {
          problem: value,
          recommendedFix: ""
        }
      : null;
  }

  if (!issue || typeof issue !== "object") {
    return null;
  }

  const problem =
    normalizeText(issue.problem) ||
    normalizeText(issue.issue) ||
    normalizeText(issue.summary) ||
    normalizeText(issue.title) ||
    normalizeText(issue.message);

  if (!problem) {
    return null;
  }

  return {
    problem,
    recommendedFix:
      normalizeText(issue.recommended_fix) ||
      normalizeText(issue.fix) ||
      normalizeText(issue.recommendation) ||
      ""
  };
}

function formatGenericIssueLines(issues) {
  if (issues.length === 0) {
    return ["- None"];
  }

  return issues.map((issue, index) => `- ${index + 1}. ${issue.problem}`);
}

function formatGenericFixLines(issues) {
  if (issues.length === 0) {
    return ["- None"];
  }

  return issues.map((issue, index) => {
    const fix =
      issue.recommendedFix ||
      "Make the smallest change that resolves the issue without changing correct parts.";

    return `- ${index + 1}. ${fix}`;
  });
}

function extractPreviousOutputFilePaths(previousOutput) {
  if (!Array.isArray(previousOutput?.files)) {
    return [];
  }

  return previousOutput.files
    .map((file) => normalizeText(file?.path))
    .filter(Boolean);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function normalizeMode(mode) {
  return normalizeText(mode)?.toLowerCase() || "";
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
}
