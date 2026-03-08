import { createHash } from "node:crypto";

const REVISION_TRACE_MODE = "revision_trace";
const FALLBACK_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const REVISION_BLOCK_START = "[REVISION_INSTRUCTION]";
const REVISION_BLOCK_END = "[/REVISION_INSTRUCTION]";
const ISSUE_SEVERITY_VALUES = new Set([
  "critical",
  "high",
  "medium",
  "low",
  "info"
]);
const CHANGED_ARTIFACT_TYPES = new Set([
  "file",
  "document_section",
  "slide",
  "sheet_tab",
  "research_section",
  "generic_unit"
]);

export function buildRevisionTrace(input = {}) {
  const subjectMode = normalizeSubjectMode(input.mode);
  const normalizedMetadata = normalizeMetadata(input.metadata, subjectMode);
  const normalizedCriticIssues = normalizeCriticIssues(input.criticResult);
  const normalizedRevisionInstructions = normalizeRevisionInstructions(
    input.revisionInstruction,
    normalizedCriticIssues
  );
  const normalizedChangedArtifacts = diffArtifacts(
    input.previousArtifact,
    input.revisedArtifact
  );
  const normalizedValidationOutcome = normalizeValidationOutcome(
    input.validatorResult
  );
  const improvementSummary = buildImprovementSummary({
    criticIssues: normalizedCriticIssues,
    revisionInstructions: normalizedRevisionInstructions,
    changedArtifacts: normalizedChangedArtifacts,
    validationOutcome: normalizedValidationOutcome
  });

  return {
    metadata: normalizedMetadata,
    mode: REVISION_TRACE_MODE,
    source_step: buildSourceStep({
      metadata: input.metadata,
      previousArtifact: input.previousArtifact,
      revisedArtifact: input.revisedArtifact
    }),
    critic_issues: normalizedCriticIssues,
    revision_instructions: normalizedRevisionInstructions,
    changed_artifacts: normalizedChangedArtifacts,
    validation_outcome: normalizedValidationOutcome,
    improvement_summary: improvementSummary,
    timestamps: buildTimestamps({
      metadata: input.metadata,
      previousArtifact: input.previousArtifact,
      revisedArtifact: input.revisedArtifact,
      validatorResult: input.validatorResult
    })
  };
}

function normalizeMetadata(metadata, subjectMode) {
  const normalized = isPlainObject(metadata) ? metadata : {};
  const seed = {
    subjectMode,
    runId: firstNonEmptyString(normalized.run_id, normalized.runId),
    requestId: firstNonEmptyString(normalized.request_id, normalized.requestId),
    sourceStep: firstNonEmptyString(
      normalized.source_step_name,
      normalized.sourceStepName,
      normalized.step_name,
      normalized.stepName
    )
  };

  return compactObject({
    trace_id:
      firstNonEmptyString(normalized.trace_id, normalized.traceId) ||
      `revtrace_${stableHash(seed).slice(0, 12)}`,
    subject_mode: subjectMode,
    trace_scope:
      firstNonEmptyString(normalized.trace_scope, normalized.traceScope) ||
      "single_revision",
    run_id: firstNonEmptyString(normalized.run_id, normalized.runId),
    request_id: firstNonEmptyString(normalized.request_id, normalized.requestId)
  });
}

function buildSourceStep({ metadata, previousArtifact, revisedArtifact }) {
  const normalizedMetadata = isPlainObject(metadata) ? metadata : {};
  const sourceStepMetadata = isPlainObject(normalizedMetadata.source_step)
    ? normalizedMetadata.source_step
    : {};
  const artifact = isPlainObject(previousArtifact)
    ? previousArtifact
    : isPlainObject(revisedArtifact)
      ? revisedArtifact
      : null;

  return compactObject({
    step_name:
      firstNonEmptyString(
        sourceStepMetadata.step_name,
        sourceStepMetadata.stepName,
        normalizedMetadata.source_step_name,
        normalizedMetadata.sourceStepName,
        normalizedMetadata.step_name,
        normalizedMetadata.stepName,
        normalizedMetadata.agent_name,
        normalizedMetadata.agentName
      ) || "unknown_step",
    step_type: firstNonEmptyString(
      sourceStepMetadata.step_type,
      sourceStepMetadata.stepType,
      normalizedMetadata.source_step_type,
      normalizedMetadata.sourceStepType
    ),
    artifact_ref: artifact
      ? compactObject({
          artifact_id: firstNonEmptyString(
            sourceStepMetadata.artifact_id,
            sourceStepMetadata.artifactId,
            artifact.artifact_id,
            artifact.artifactId,
            artifact.id
          ),
          version: firstNonEmptyString(
            sourceStepMetadata.version,
            artifact.version
          ),
          kind:
            firstNonEmptyString(sourceStepMetadata.kind) ||
            detectArtifactKind(artifact)
        })
      : null,
    selection: normalizeSelection(
      sourceStepMetadata.selection ??
        normalizedMetadata.selection ??
        normalizedMetadata.target_selection ??
        normalizedMetadata.targetSelection
    )
  });
}

function normalizeCriticIssues(criticResult) {
  const result = [];
  const issueBuckets = collectIssueBuckets(criticResult);

  for (const bucket of issueBuckets) {
    for (const rawIssue of bucket.issues) {
      const normalizedIssue = normalizeCriticIssue(rawIssue, bucket);

      if (normalizedIssue) {
        result.push(normalizedIssue);
      }
    }
  }

  return result.map((issue, index) => ({
    ...issue,
    issue_id: issue.issue_id || `issue_${String(index + 1).padStart(2, "0")}`
  }));
}

function collectIssueBuckets(criticResult) {
  if (!criticResult) {
    return [];
  }

  const parsed = isPlainObject(criticResult.parsed) ? criticResult.parsed : null;
  const root = isPlainObject(criticResult) ? criticResult : null;
  const candidates = [parsed, root].filter(Boolean);
  const buckets = [];

  for (const candidate of candidates) {
    pushIssueBucket(buckets, candidate.critical_issues, {
      defaultSeverity: "high",
      defaultCategory: "critic_issue"
    });
    pushIssueBucket(buckets, candidate.issues, {
      defaultSeverity: undefined,
      defaultCategory: "critic_issue"
    });
    pushIssueBucket(buckets, candidate.minor_issues, {
      defaultSeverity: "low",
      defaultCategory: "minor_issue"
    });
    pushIssueBucket(buckets, candidate.unsupported_or_weak_claims, {
      defaultSeverity: "medium",
      defaultCategory: "citation"
    });
  }

  return buckets;
}

function pushIssueBucket(target, issues, defaults) {
  if (!Array.isArray(issues) || issues.length === 0) {
    return;
  }

  target.push({
    issues,
    ...defaults
  });
}

function normalizeCriticIssue(issue, defaults) {
  if (typeof issue === "string") {
    const problem = normalizeOptionalString(issue);

    if (!problem) {
      return null;
    }

    return compactObject({
      severity: defaults.defaultSeverity,
      category: defaults.defaultCategory,
      problem
    });
  }

  if (!isPlainObject(issue)) {
    return null;
  }

  const problem = firstNonEmptyString(
    issue.problem,
    issue.issue,
    issue.summary,
    issue.title,
    issue.message,
    issue.claim
  );

  if (!problem) {
    return null;
  }

  const severity = normalizeSeverity(
    firstNonEmptyString(issue.severity, defaults.defaultSeverity)
  );
  const location = normalizeIssueLocation(issue);

  return compactObject({
    issue_id: firstNonEmptyString(issue.issue_id, issue.issueId, issue.id),
    severity,
    category:
      firstNonEmptyString(issue.category, issue.area, issue.code) ||
      defaults.defaultCategory,
    location,
    problem,
    evidence: firstNonEmptyString(
      issue.evidence,
      issue.rationale,
      issue.observation,
      issue.details?.message
    ),
    recommended_fix: firstNonEmptyString(
      issue.recommended_fix,
      issue.recommendedFix,
      issue.fix,
      issue.recommendation
    ),
    blocking: firstBoolean(
      issue.blocking,
      issue.is_blocking,
      issue.isBlocking,
      severity === "critical" || severity === "high" ? true : undefined
    )
  });
}

function normalizeIssueLocation(issue) {
  const location = isPlainObject(issue.location) ? issue.location : null;
  const artifactType = normalizeArtifactType(
    firstNonEmptyString(
      location?.artifact_type,
      location?.artifactType,
      issue.artifact_type,
      issue.artifactType
    )
  );
  const path = firstNonEmptyString(location?.path, issue.path, issue.file);
  const locator = firstNonEmptyString(
    location?.locator,
    issue.locator,
    issue.section,
    issue.tab,
    issue.slide,
    issue.heading
  );

  const normalized = compactObject({
    artifact_type: artifactType || (path ? "file" : locator ? "generic_unit" : null),
    path,
    locator
  });

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeRevisionInstructions(revisionInstruction, criticIssues) {
  if (typeof revisionInstruction === "string") {
    return normalizeStringRevisionInstruction(revisionInstruction, criticIssues);
  }

  if (Array.isArray(revisionInstruction)) {
    return normalizeInstructionList(revisionInstruction, criticIssues);
  }

  if (isPlainObject(revisionInstruction)) {
    return normalizeObjectRevisionInstruction(revisionInstruction, criticIssues);
  }

  return {
    summary: buildInstructionSummary(criticIssues, 0),
    steps: [
      {
        instruction:
          "Apply the smallest practical changes needed to address the identified issues while preserving correct parts."
      }
    ]
  };
}

function normalizeStringRevisionInstruction(text, criticIssues) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== REVISION_BLOCK_START && line !== REVISION_BLOCK_END);

  const preserve = [];
  const fixes = [];
  let activeSection = "";

  for (const line of lines) {
    const sectionName = normalizeSectionHeader(line);

    if (sectionName) {
      activeSection = sectionName;
      continue;
    }

    const bullet = stripListPrefix(line);

    if (!bullet) {
      continue;
    }

    if (activeSection === "preserve") {
      preserve.push(bullet);
      continue;
    }

    if (activeSection === "recommended_fixes") {
      fixes.push(bullet);
    }
  }

  const steps = fixes.length > 0
    ? fixes.map((instruction) => ({ instruction }))
    : [
        {
          instruction:
            "Apply the smallest practical changes needed to address the identified issues while preserving correct parts."
        }
      ];

  return compactObject({
    summary: buildInstructionSummary(criticIssues, steps.length),
    preserve: preserve.length > 0 ? preserve : null,
    steps
  });
}

function normalizeInstructionList(instructions, criticIssues) {
  const steps = instructions
    .map((instruction) => normalizeInstructionStep(instruction))
    .filter(Boolean);

  return {
    summary: buildInstructionSummary(criticIssues, steps.length),
    steps:
      steps.length > 0
        ? steps
        : [
            {
              instruction:
                "Apply the smallest practical changes needed to address the identified issues while preserving correct parts."
            }
          ]
  };
}

function normalizeObjectRevisionInstruction(revisionInstruction, criticIssues) {
  const stepsSource =
    revisionInstruction.steps ??
    revisionInstruction.recommended_fixes ??
    revisionInstruction.recommendedFixes ??
    revisionInstruction.instructions;
  const steps = Array.isArray(stepsSource)
    ? stepsSource.map((step) => normalizeInstructionStep(step)).filter(Boolean)
    : [];

  return compactObject({
    summary:
      firstNonEmptyString(
        revisionInstruction.summary,
        revisionInstruction.goal,
        revisionInstruction.action
      ) || buildInstructionSummary(criticIssues, steps.length),
    preserve: normalizeStringArray(
      revisionInstruction.preserve ?? revisionInstruction.constraints
    ),
    steps:
      steps.length > 0
        ? steps
        : [
            {
              instruction:
                "Apply the smallest practical changes needed to address the identified issues while preserving correct parts."
            }
          ]
  });
}

function normalizeInstructionStep(step) {
  if (typeof step === "string") {
    const instruction = normalizeOptionalString(step);

    return instruction ? { instruction } : null;
  }

  if (!isPlainObject(step)) {
    return null;
  }

  const instruction = firstNonEmptyString(
    step.instruction,
    step.fix,
    step.recommended_fix,
    step.summary,
    step.action
  );

  if (!instruction) {
    return null;
  }

  return compactObject({
    instruction,
    targets: normalizeSelection(step.targets ?? step.target ?? step.selection),
    addresses_issue_ids: normalizeIssueIdList(
      step.addresses_issue_ids ?? step.addressesIssueIds ?? step.issue_ids ?? step.issueIds
    )
  });
}

function buildInstructionSummary(criticIssues, stepCount) {
  const issueCount = criticIssues.length;

  if (issueCount > 0) {
    return `Revise the artifact to address ${issueCount} identified issue${issueCount === 1 ? "" : "s"}${stepCount > 0 ? ` across ${stepCount} action step${stepCount === 1 ? "" : "s"}` : ""} while preserving already-correct work.`;
  }

  return "Review and refine the artifact with minimal targeted changes while preserving already-correct work.";
}

function diffArtifacts(previousArtifact, revisedArtifact) {
  const previousUnits = extractArtifactUnits(previousArtifact);
  const revisedUnits = extractArtifactUnits(revisedArtifact);
  const previousMap = toUnitMap(previousUnits);
  const revisedMap = toUnitMap(revisedUnits);
  const keys = [...new Set([...previousMap.keys(), ...revisedMap.keys()])].sort();
  const changes = [];

  for (const key of keys) {
    const beforeUnit = previousMap.get(key) ?? null;
    const afterUnit = revisedMap.get(key) ?? null;
    const change = diffArtifactUnit(beforeUnit, afterUnit);

    if (change) {
      changes.push(change);
    }
  }

  return changes;
}

function extractArtifactUnits(artifact) {
  if (!isPlainObject(artifact)) {
    return [];
  }

  const files = extractFileUnits(artifact.files);

  if (files.length > 0) {
    return files;
  }

  const sections = extractCollectionUnits(
    artifact.sections,
    "document_section",
    (entry, index) =>
      firstNonEmptyString(entry.section_id, entry.id, entry.title, entry.heading) ||
      `section_${index + 1}`,
    (entry, index) =>
      firstNonEmptyString(entry.title, entry.heading) || `Section ${index + 1}`
  );

  if (sections.length > 0) {
    return sections;
  }

  const slides = extractCollectionUnits(
    artifact.slides,
    "slide",
    (entry, index) =>
      firstNonEmptyString(entry.slide_id, entry.id) ||
      (Number.isInteger(entry.slide_number) ? `slide_${entry.slide_number}` : "") ||
      `slide_${index + 1}`,
    (entry, index) =>
      firstNonEmptyString(entry.title) || `Slide ${index + 1}`
  );

  if (slides.length > 0) {
    return slides;
  }

  const tabs = extractCollectionUnits(
    artifact.tabs,
    "sheet_tab",
    (entry, index) =>
      firstNonEmptyString(entry.name, entry.tab_name, entry.id) || `tab_${index + 1}`,
    (entry, index) =>
      firstNonEmptyString(entry.name, entry.role) || `Tab ${index + 1}`
  );

  if (tabs.length > 0) {
    return tabs;
  }

  const findings = extractCollectionUnits(
    artifact.findings,
    "research_section",
    (entry, index) =>
      firstNonEmptyString(entry.finding_id, entry.id, entry.title) || `finding_${index + 1}`,
    (entry, index) =>
      firstNonEmptyString(entry.title, entry.claim) || `Finding ${index + 1}`
  );

  if (findings.length > 0) {
    return findings;
  }

  return extractGenericObjectUnits(artifact);
}

function extractFileUnits(files) {
  if (!Array.isArray(files)) {
    return [];
  }

  return files
    .map((file) => normalizeFileUnit(file))
    .filter(Boolean);
}

function normalizeFileUnit(file) {
  if (!isPlainObject(file)) {
    return null;
  }

  const path = normalizeFilePath(file.path);
  const content = typeof file.content === "string" ? file.content : null;

  if (!path || content === null) {
    return null;
  }

  return {
    artifact_type: "file",
    identifier: path,
    label: path,
    signature: stableHash({
      path,
      content
    }),
    summary_bits: {
      lines: countLines(content),
      bytes: Buffer.byteLength(content, "utf8"),
      extension: getFileExtension(path)
    }
  };
}

function extractCollectionUnits(collection, artifactType, getIdentifier, getLabel) {
  if (!Array.isArray(collection)) {
    return [];
  }

  return collection
    .map((entry, index) => {
      if (!isPlainObject(entry)) {
        return null;
      }

      const identifier = normalizeOptionalString(getIdentifier(entry, index));

      if (!identifier) {
        return null;
      }

      return {
        artifact_type: artifactType,
        identifier,
        label: normalizeOptionalString(getLabel(entry, index)) || identifier,
        signature: stableHash(entry)
      };
    })
    .filter(Boolean);
}

function extractGenericObjectUnits(artifact) {
  const units = [];

  for (const key of Object.keys(artifact).sort()) {
    if (key === "mode" || key === "output_type" || key === "artifact_metadata") {
      continue;
    }

    const value = artifact[key];

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      units.push({
        artifact_type: "generic_unit",
        identifier: key,
        label: key,
        signature: stableHash({ key, value })
      });
    }
  }

  return units;
}

function toUnitMap(units) {
  return new Map(
    units.map((unit) => [`${unit.artifact_type}:${unit.identifier}`, unit])
  );
}

function diffArtifactUnit(beforeUnit, afterUnit) {
  if (!beforeUnit && !afterUnit) {
    return null;
  }

  if (!beforeUnit && afterUnit) {
    return {
      artifact_type: afterUnit.artifact_type,
      identifier: afterUnit.identifier,
      change_type: "added",
      summary: buildChangeSummary("added", null, afterUnit),
      after_ref: afterUnit.signature
    };
  }

  if (beforeUnit && !afterUnit) {
    return {
      artifact_type: beforeUnit.artifact_type,
      identifier: beforeUnit.identifier,
      change_type: "removed",
      summary: buildChangeSummary("removed", beforeUnit, null),
      before_ref: beforeUnit.signature
    };
  }

  if (beforeUnit.signature === afterUnit.signature) {
    return {
      artifact_type: afterUnit.artifact_type,
      identifier: afterUnit.identifier,
      change_type: "unchanged_checked",
      summary: buildChangeSummary("unchanged_checked", beforeUnit, afterUnit),
      before_ref: beforeUnit.signature,
      after_ref: afterUnit.signature
    };
  }

  return {
    artifact_type: afterUnit.artifact_type,
    identifier: afterUnit.identifier,
    change_type: "modified",
    summary: buildChangeSummary("modified", beforeUnit, afterUnit),
    before_ref: beforeUnit.signature,
    after_ref: afterUnit.signature
  };
}

function buildChangeSummary(changeType, beforeUnit, afterUnit) {
  const unit = afterUnit ?? beforeUnit;

  if (!unit) {
    return "Change detected.";
  }

  if (unit.artifact_type === "file") {
    return buildFileChangeSummary(changeType, beforeUnit, afterUnit);
  }

  const label = unit.label || unit.identifier;

  if (changeType === "added") {
    return `Added ${unit.artifact_type.replace(/_/g, " ")} '${label}'.`;
  }

  if (changeType === "removed") {
    return `Removed ${unit.artifact_type.replace(/_/g, " ")} '${label}'.`;
  }

  if (changeType === "unchanged_checked") {
    return `Reviewed ${unit.artifact_type.replace(/_/g, " ")} '${label}' with no material change.`;
  }

  return `Updated ${unit.artifact_type.replace(/_/g, " ")} '${label}'.`;
}

function buildFileChangeSummary(changeType, beforeUnit, afterUnit) {
  const filePath = afterUnit?.identifier ?? beforeUnit?.identifier ?? "unknown_file";

  if (changeType === "added") {
    return `Added file '${filePath}'.`;
  }

  if (changeType === "removed") {
    return `Removed file '${filePath}'.`;
  }

  if (changeType === "unchanged_checked") {
    return `Reviewed file '${filePath}' with no material content change.`;
  }

  const beforeLines = beforeUnit?.summary_bits?.lines ?? 0;
  const afterLines = afterUnit?.summary_bits?.lines ?? 0;
  const delta = afterLines - beforeLines;
  const deltaText =
    delta === 0 ? "line count unchanged" : `${Math.abs(delta)} line${Math.abs(delta) === 1 ? "" : "s"} ${delta > 0 ? "added" : "removed"}`;

  return `Modified file '${filePath}' (${deltaText}).`;
}

function normalizeValidationOutcome(validatorResult) {
  if (!validatorResult) {
    return {
      status: "not_run",
      summary: "Validation was not run for this revision."
    };
  }

  const ok = firstBoolean(validatorResult.ok, validatorResult.pass);
  const errors = normalizeIssueLikeList(validatorResult.errors);
  const warnings = normalizeIssueLikeList(validatorResult.warnings);
  const checks = collectValidationChecks(validatorResult);
  const validatorName = firstNonEmptyString(
    validatorResult.validator,
    validatorResult.validator_name,
    validatorResult.validatorName
  );

  let status = "not_run";

  if (ok === true) {
    status = warnings.length > 0 ? "passed_with_warnings" : "passed";
  } else if (ok === false) {
    status = "failed";
  }

  return compactObject({
    status,
    validator: validatorName,
    summary: buildValidationSummary(status, errors, warnings),
    checks: checks.length > 0 ? checks : null
  });
}

function collectValidationChecks(validatorResult) {
  const checks = [];

  for (const key of ["role", "mode", "website", "websiteFiles", "websiteContract"]) {
    const value = validatorResult[key];

    if (!isPlainObject(value)) {
      continue;
    }

    const ok = firstBoolean(value.ok, value.pass);
    const errors = normalizeIssueLikeList(value.errors ?? value.violations);
    const warnings = normalizeIssueLikeList(value.warnings);

    checks.push(
      compactObject({
        name: key,
        status: ok === true ? (warnings.length > 0 ? "passed_with_warnings" : "passed") : ok === false ? "failed" : "not_run",
        summary: buildValidationSummary(
          ok === true
            ? warnings.length > 0
              ? "passed_with_warnings"
              : "passed"
            : ok === false
              ? "failed"
              : "not_run",
          errors,
          warnings
        )
      })
    );
  }

  return checks;
}

function buildValidationSummary(status, errors, warnings) {
  if (status === "passed") {
    return "Validation passed with no reported issues.";
  }

  if (status === "passed_with_warnings") {
    return `Validation passed with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`;
  }

  if (status === "failed") {
    const firstError = errors[0];
    return `Validation failed with ${errors.length} error${errors.length === 1 ? "" : "s"}${firstError ? `; first error: ${firstError}` : ""}.`;
  }

  return "Validation was not run for this revision.";
}

function buildImprovementSummary({
  criticIssues,
  revisionInstructions,
  changedArtifacts,
  validationOutcome
}) {
  const allIssueIds = criticIssues
    .map((issue) => issue.issue_id)
    .filter(Boolean);
  const addressedIssueIds = new Set(
    revisionInstructions.steps
      .flatMap((step) => normalizeIssueIdList(step.addresses_issue_ids))
  );

  let resolvedIssueIds = [];

  if (validationOutcome.status === "passed" || validationOutcome.status === "passed_with_warnings") {
    resolvedIssueIds =
      addressedIssueIds.size > 0 ? [...addressedIssueIds].sort() : allIssueIds;
  } else if (addressedIssueIds.size > 0) {
    resolvedIssueIds = [...addressedIssueIds].sort();
  }

  const changedCount = changedArtifacts.filter(
    (entry) => entry.change_type !== "unchanged_checked"
  ).length;
  const reviewedCount = changedArtifacts.length - changedCount;

  return compactObject({
    resolved_issue_ids: resolvedIssueIds.length > 0 ? resolvedIssueIds : null,
    net_effect: buildNetEffectSummary({
      issueCount: criticIssues.length,
      changedCount,
      reviewedCount,
      validationStatus: validationOutcome.status
    }),
    quality_delta: mapValidationStatusToQualityDelta(validationOutcome.status),
    notes: buildImprovementNotes(criticIssues, changedArtifacts, validationOutcome)
  });
}

function buildNetEffectSummary({
  issueCount,
  changedCount,
  reviewedCount,
  validationStatus
}) {
  const base = `Processed ${issueCount} critic issue${issueCount === 1 ? "" : "s"} and recorded ${changedCount} changed artifact${changedCount === 1 ? "" : "s"}`;
  const reviewed = reviewedCount > 0
    ? ` with ${reviewedCount} additional reviewed artifact${reviewedCount === 1 ? "" : "s"} left unchanged`
    : "";

  if (validationStatus === "passed") {
    return `${base}${reviewed}; the revised output passed validation.`;
  }

  if (validationStatus === "passed_with_warnings") {
    return `${base}${reviewed}; the revised output passed validation with warnings.`;
  }

  if (validationStatus === "failed") {
    return `${base}${reviewed}; the revised output still failed validation.`;
  }

  return `${base}${reviewed}; validation was not run.`;
}

function buildImprovementNotes(criticIssues, changedArtifacts, validationOutcome) {
  const notes = [];

  if (criticIssues.length > 0) {
    notes.push(
      `${criticIssues.length} issue${criticIssues.length === 1 ? " was" : "s were"} tracked from critique into the revision trace.`
    );
  }

  const modifiedFiles = changedArtifacts.filter(
    (entry) => entry.artifact_type === "file" && entry.change_type === "modified"
  );

  if (modifiedFiles.length > 0) {
    notes.push(
      `${modifiedFiles.length} file${modifiedFiles.length === 1 ? " was" : "s were"} modified during revision.`
    );
  }

  if (validationOutcome.status === "passed_with_warnings") {
    notes.push("Warnings remain and should be reviewed before final approval.");
  } else if (validationOutcome.status === "failed") {
    notes.push("Additional revision is required before the artifact can be considered validated.");
  }

  return notes.length > 0 ? notes : null;
}

function buildTimestamps({
  metadata,
  previousArtifact,
  revisedArtifact,
  validatorResult
}) {
  const normalizedMetadata = isPlainObject(metadata) ? metadata : {};

  return compactObject({
    created_at: normalizeTimestamp(
      firstNonEmptyString(
        normalizedMetadata.created_at,
        normalizedMetadata.createdAt,
        normalizedMetadata.timestamp
      )
    ) || FALLBACK_TIMESTAMP,
    updated_at: normalizeTimestamp(
      firstNonEmptyString(
        normalizedMetadata.updated_at,
        normalizedMetadata.updatedAt,
        revisedArtifact?.updated_at,
        revisedArtifact?.updatedAt
      )
    ),
    source_step_completed_at: normalizeTimestamp(
      firstNonEmptyString(
        normalizedMetadata.source_step_completed_at,
        normalizedMetadata.sourceStepCompletedAt,
        previousArtifact?.updated_at,
        previousArtifact?.updatedAt,
        previousArtifact?.created_at,
        previousArtifact?.createdAt
      )
    ),
    validated_at: normalizeTimestamp(
      firstNonEmptyString(
        normalizedMetadata.validated_at,
        normalizedMetadata.validatedAt,
        validatorResult?.validated_at,
        validatorResult?.validatedAt,
        validatorResult?.updated_at,
        validatorResult?.updatedAt,
        validatorResult?.timestamp
      )
    )
  });
}

function detectArtifactKind(artifact) {
  if (!isPlainObject(artifact)) {
    return null;
  }

  if (Array.isArray(artifact.files)) {
    return "file_bundle";
  }

  if (Array.isArray(artifact.sections)) {
    return "document_section_set";
  }

  if (Array.isArray(artifact.slides)) {
    return "slide_deck_structure";
  }

  if (Array.isArray(artifact.tabs)) {
    return "workbook_design";
  }

  if (Array.isArray(artifact.findings) || Array.isArray(artifact.sources)) {
    return "research_report";
  }

  return "generic_artifact";
}

function normalizeSelection(selection) {
  if (!Array.isArray(selection)) {
    return null;
  }

  const normalized = selection
    .map((entry) => {
      if (typeof entry === "string") {
        const value = normalizeOptionalString(entry);
        return value ? { identifier: value } : null;
      }

      if (!isPlainObject(entry)) {
        return null;
      }

      return compactObject({
        artifact_type: normalizeArtifactType(
          firstNonEmptyString(entry.artifact_type, entry.artifactType)
        ),
        path: normalizeFilePath(entry.path),
        locator: firstNonEmptyString(entry.locator, entry.identifier, entry.id),
        note: firstNonEmptyString(entry.note, entry.summary)
      });
    })
    .filter(Boolean);

  return normalized.length > 0 ? normalized : null;
}

function normalizeSubjectMode(mode) {
  return firstNonEmptyString(mode) || "unknown";
}

function normalizeArtifactType(value) {
  const normalized = normalizeOptionalString(value);
  return CHANGED_ARTIFACT_TYPES.has(normalized) ? normalized : null;
}

function normalizeSeverity(value) {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  return ISSUE_SEVERITY_VALUES.has(normalized) ? normalized : null;
}

function normalizeTimestamp(value) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeIssueLikeList(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((entry) => {
      if (typeof entry === "string") {
        return normalizeOptionalString(entry);
      }

      if (!isPlainObject(entry)) {
        return null;
      }

      return firstNonEmptyString(entry.message, entry.problem, entry.code, entry.path);
    })
    .filter(Boolean);
}

function normalizeIssueIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((entry) => normalizeOptionalString(entry)).filter(Boolean))];
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => normalizeOptionalString(entry))
    .filter(Boolean);

  return normalized.length > 0 ? normalized : null;
}

function normalizeSectionHeader(line) {
  const normalized = normalizeOptionalString(line)?.toLowerCase();

  if (!normalized) {
    return "";
  }

  if (normalized === "preserve:") {
    return "preserve";
  }

  if (normalized === "recommended_fixes:") {
    return "recommended_fixes";
  }

  return "";
}

function stripListPrefix(line) {
  return normalizeOptionalString(line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""));
}

function normalizeFilePath(value) {
  const normalized = normalizeOptionalString(value);

  return normalized ? normalized.replace(/\\/g, "/") : null;
}

function getFileExtension(filePath) {
  const match = /\.([A-Za-z0-9]+)$/.exec(filePath);
  return match ? match[1].toLowerCase() : "";
}

function countLines(text) {
  if (!text) {
    return 0;
  }

  return text.split("\n").length;
}

function mapValidationStatusToQualityDelta(status) {
  if (status === "passed") {
    return "improved";
  }

  if (status === "passed_with_warnings") {
    return "improved_with_warnings";
  }

  if (status === "failed") {
    return "mixed";
  }

  return "unknown";
}

function stableHash(value) {
  return createHash("sha1").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(String(value));
}

function compactObject(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === null || entry === undefined) {
        return false;
      }

      if (typeof entry === "string") {
        return entry.length > 0;
      }

      if (Array.isArray(entry)) {
        return entry.length > 0;
      }

      if (isPlainObject(entry)) {
        return Object.keys(entry).length > 0;
      }

      return true;
    })
  );
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim();
  return normalized || "";
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function firstBoolean(...values) {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}
