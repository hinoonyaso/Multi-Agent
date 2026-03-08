const cardStyle = {
  padding: "20px",
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.82)",
  border: "1px solid rgba(31, 41, 51, 0.12)"
};

const headerRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "16px"
};

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: "999px",
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.02em",
  background: "rgba(15, 23, 42, 0.08)",
  color: "#1f2933"
};

const metaGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: "10px",
  marginBottom: "18px"
};

const metaCardStyle = {
  padding: "10px 12px",
  borderRadius: "12px",
  background: "rgba(15, 23, 42, 0.05)",
  border: "1px solid rgba(31, 41, 51, 0.08)"
};

const metaLabelStyle = {
  margin: "0 0 4px",
  fontSize: "0.78rem",
  color: "#52606d",
  textTransform: "uppercase",
  letterSpacing: "0.04em"
};

const metaValueStyle = {
  margin: 0,
  color: "#1f2933",
  fontWeight: 700
};

const sectionStyle = {
  marginTop: "18px"
};

const sectionTitleStyle = {
  margin: "0 0 10px",
  fontSize: "1rem",
  color: "#1f2933"
};

const listStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "10px"
};

const itemStyle = {
  padding: "12px 14px",
  borderRadius: "12px",
  background: "rgba(255, 255, 255, 0.82)",
  border: "1px solid rgba(31, 41, 51, 0.1)"
};

const itemTitleStyle = {
  margin: "0 0 6px",
  color: "#1f2933",
  fontWeight: 700,
  lineHeight: 1.35
};

const itemTextStyle = {
  margin: "4px 0 0",
  color: "#52606d",
  lineHeight: 1.45,
  wordBreak: "break-word"
};

const inlineMetaStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "6px",
  fontSize: "0.82rem",
  color: "#52606d"
};

const codeStyle = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "0.82rem",
  background: "rgba(15, 23, 42, 0.05)",
  borderRadius: "8px",
  padding: "2px 6px",
  color: "#102a43"
};

const emptyStateStyle = {
  margin: 0,
  padding: "16px",
  borderRadius: "14px",
  background: "rgba(15, 23, 42, 0.05)",
  color: "#52606d",
  lineHeight: 1.5
};

const stateNoticeStyle = {
  margin: "0 0 16px",
  padding: "12px 14px",
  borderRadius: "12px",
  background: "rgba(194, 120, 3, 0.08)",
  border: "1px solid rgba(194, 120, 3, 0.16)",
  color: "#8d5a00",
  lineHeight: 1.45
};

export default function RevisionTracePanel({ revisionTrace }) {
  const trace = normalizeRevisionTrace(revisionTrace);
  const badge = getTraceBadge(trace);

  return (
    <section style={cardStyle}>
      <div style={headerRowStyle}>
        <div>
          <h2 style={{ margin: "0 0 6px" }}>Revision Trace</h2>
          <p style={{ margin: 0, color: "#52606d", lineHeight: 1.45 }}>
            Revision reasoning, changed artifacts, and post-revision validation in one place.
          </p>
        </div>
        <span
          style={{
            ...badgeStyle,
            background: badge.background,
            color: badge.color
          }}
        >
          {badge.label}
        </span>
      </div>

      {trace.state === "none" ? (
        <p style={emptyStateStyle}>
          No revision occurred for this run. The first pass was likely accepted without a coder
          revision.
        </p>
      ) : trace.state === "missing" ? (
        <p style={emptyStateStyle}>
          A revision appears to have happened, but the structured revision trace is missing from the
          run payload. Check the persisted run files or backend trace persistence path.
        </p>
      ) : (
        <>
          {trace.state === "loading" ? (
            <p style={emptyStateStyle}>
              Revision trace data is still loading. Run-level revision metadata is present, but the
              structured trace payload has not been attached yet.
            </p>
          ) : null}

          {trace.isPartial ? (
            <p style={stateNoticeStyle}>
              Partial revision trace only. Some sections are unavailable, so this panel is showing
              the best structured data currently returned by the API.
            </p>
          ) : null}

          <div style={metaGridStyle}>
            <MetaStat label="Critic Issues" value={trace.criticIssues.length} />
            <MetaStat label="Changed Files" value={trace.changedFiles.length} />
            <MetaStat label="Validator" value={trace.validatorStatus || "unknown"} />
            <MetaStat label="Trace ID" value={trace.traceId || "n/a"} mono />
          </div>

          <TraceSection title="Critic Issues" emptyLabel="No critic issues recorded.">
            {trace.criticIssues.map((issue) => (
              <li key={issue.issue_id || issue.problem} style={itemStyle}>
                <div style={inlineMetaStyle}>
                  {issue.severity ? <span>{issue.severity}</span> : null}
                  {issue.category ? <span>{issue.category}</span> : null}
                  {issue.locationLabel ? <span style={codeStyle}>{issue.locationLabel}</span> : null}
                </div>
                <p style={itemTitleStyle}>{issue.problem}</p>
                {issue.recommended_fix ? (
                  <p style={itemTextStyle}>Fix: {issue.recommended_fix}</p>
                ) : null}
                {issue.evidence ? <p style={itemTextStyle}>Evidence: {issue.evidence}</p> : null}
              </li>
            ))}
          </TraceSection>

          <TraceSection
            title="Revision Instructions"
            emptyLabel="No structured revision instructions were recorded."
          >
            {trace.revisionInstructions.map((step, index) => (
              <li key={`${step.instruction}-${index}`} style={itemStyle}>
                <p style={itemTitleStyle}>{step.instruction}</p>
                {step.targets.length > 0 ? (
                  <p style={itemTextStyle}>
                    Targets: {step.targets.join(", ")}
                  </p>
                ) : null}
                {step.addresses_issue_ids.length > 0 ? (
                  <p style={itemTextStyle}>
                    Addresses: {step.addresses_issue_ids.join(", ")}
                  </p>
                ) : null}
              </li>
            ))}
          </TraceSection>

          <TraceSection title="Changed Files" emptyLabel="No changed file records were found.">
            {trace.changedFiles.map((file) => (
              <li key={file.identifier} style={itemStyle}>
                <div style={inlineMetaStyle}>
                  <span style={codeStyle}>{file.identifier}</span>
                  <span>{file.change_type}</span>
                </div>
                <p style={itemTitleStyle}>{file.summary}</p>
              </li>
            ))}
          </TraceSection>

          <TraceSection title="Validator Result" emptyLabel="No validator outcome was recorded.">
            {trace.validatorItems.map((item) => (
              <li key={item.label} style={itemStyle}>
                <div style={inlineMetaStyle}>
                  <span>{item.label}</span>
                  {item.status ? <span>{item.status}</span> : null}
                </div>
                <p style={itemTitleStyle}>{item.summary}</p>
              </li>
            ))}
          </TraceSection>

          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Improvement Summary</h3>
            <div style={itemStyle}>
              <p style={itemTitleStyle}>{trace.improvementSummary.netEffect || "No summary available."}</p>
              {trace.improvementSummary.qualityDelta ? (
                <p style={itemTextStyle}>Quality delta: {trace.improvementSummary.qualityDelta}</p>
              ) : null}
              {trace.improvementSummary.notes.length > 0 ? (
                <ul style={{ ...listStyle, marginTop: "10px" }}>
                  {trace.improvementSummary.notes.map((note, index) => (
                    <li key={`${note}-${index}`} style={{ ...itemTextStyle, marginTop: 0 }}>
                      {note}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function MetaStat({ label, value, mono = false }) {
  return (
    <div style={metaCardStyle}>
      <p style={metaLabelStyle}>{label}</p>
      <p
        style={{
          ...metaValueStyle,
          ...(mono ? codeStyle : null)
        }}
      >
        {String(value)}
      </p>
    </div>
  );
}

function TraceSection({ title, emptyLabel, children }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];

  return (
    <section style={sectionStyle}>
      <h3 style={sectionTitleStyle}>{title}</h3>
      {items.length === 0 ? (
        <p style={emptyStateStyle}>{emptyLabel}</p>
      ) : (
        <ul style={listStyle}>{items}</ul>
      )}
    </section>
  );
}

function normalizeRevisionTrace(revisionTrace) {
  if (revisionTrace === undefined) {
    return createLoadingTrace();
  }

  if (!revisionTrace || revisionTrace.occurred === false) {
    return createEmptyTrace();
  }

  const hasStructuredTrace =
    Array.isArray(revisionTrace?.critic_issues) ||
    Array.isArray(revisionTrace?.changed_artifacts) ||
    Array.isArray(revisionTrace?.revision_instructions?.steps) ||
    Boolean(revisionTrace?.validation_outcome) ||
    Boolean(revisionTrace?.improvement_summary);

  if (!hasStructuredTrace) {
    const hasRevisionSummary =
      revisionTrace.occurred === true ||
      Boolean(revisionTrace.traceId) ||
      Boolean(revisionTrace.improvementSummary) ||
      Boolean(revisionTrace.validatorOutcome?.status);

    if (hasRevisionSummary) {
      return createMissingTrace(revisionTrace);
    }
  }

  const criticIssues = Array.isArray(revisionTrace.critic_issues)
    ? revisionTrace.critic_issues.map((issue) => normalizeCriticIssue(issue)).filter(Boolean)
    : [];
  const revisionInstructions = Array.isArray(revisionTrace?.revision_instructions?.steps)
    ? revisionTrace.revision_instructions.steps.map((step) => normalizeInstruction(step)).filter(Boolean)
    : [];
  const changedFiles = Array.isArray(revisionTrace.changed_artifacts)
    ? revisionTrace.changed_artifacts
        .filter((entry) => entry?.artifact_type === "file" && entry?.change_type !== "unchanged_checked")
        .map((entry) => normalizeChangedFile(entry))
        .filter(Boolean)
    : [];

  const validatorStatus =
    readNestedString(revisionTrace, ["validation_outcome", "status"]) ||
    revisionTrace.validatorOutcome?.status ||
    null;
  const validatorSummary =
    readNestedString(revisionTrace, ["validation_outcome", "summary"]) ||
    revisionTrace.validatorOutcome?.summary ||
    null;
  const validatorChecks = Array.isArray(revisionTrace?.validation_outcome?.checks)
    ? revisionTrace.validation_outcome.checks
        .map((check) => normalizeValidatorCheck(check))
        .filter(Boolean)
    : [];
  const improvementNotes = normalizeStringArray(
    revisionTrace?.improvement_summary?.notes || revisionTrace?.improvementNotes
  );
  const improvementNetEffect =
    readNestedString(revisionTrace, ["improvement_summary", "net_effect"]) ||
    readString(revisionTrace.improvementSummary);
  const improvementQualityDelta =
    readNestedString(revisionTrace, ["improvement_summary", "quality_delta"]) || "";
  const isPartial = Boolean(
    criticIssues.length === 0 ||
    revisionInstructions.length === 0 ||
    changedFiles.length === 0 ||
    (!validatorStatus && validatorItemsLength(validatorChecks, validatorSummary) === 0) ||
    !improvementNetEffect
  );

  return {
    state: "available",
    occurred: true,
    isPartial,
    traceId:
      readNestedString(revisionTrace, ["metadata", "trace_id"]) ||
      revisionTrace.traceId ||
      null,
    criticIssues,
    revisionInstructions,
    changedFiles,
    validatorStatus,
    validatorItems:
      validatorChecks.length > 0
        ? validatorChecks
        : validatorSummary
          ? [
              {
                label: "overall",
                status: validatorStatus,
                summary: validatorSummary
            }
          ]
          : [],
    improvementSummary: {
      netEffect: improvementNetEffect,
      qualityDelta: improvementQualityDelta,
      notes: improvementNotes
    }
  };
}

function getTraceBadge(trace) {
  if (trace.state === "none") {
    return {
      label: "No revision",
      background: "rgba(15, 23, 42, 0.08)",
      color: "#52606d"
    };
  }

  if (trace.state === "loading") {
    return {
      label: "Trace loading",
      background: "rgba(40, 99, 163, 0.12)",
      color: "#2863a3"
    };
  }

  if (trace.state === "missing") {
    return {
      label: "Trace missing",
      background: "rgba(155, 28, 28, 0.1)",
      color: "#9b1c1c"
    };
  }

  if (trace.isPartial) {
    return {
      label: "Partial trace",
      background: "rgba(194, 120, 3, 0.14)",
      color: "#8d5a00"
    };
  }

  return {
    label: "Revision occurred",
    background: "rgba(18, 122, 69, 0.14)",
    color: "#0f6b3e"
  };
}

function normalizeCriticIssue(issue) {
  if (!issue || typeof issue !== "object") {
    return null;
  }

  const problem = readString(issue.problem);

  if (!problem) {
    return null;
  }

  const path = readNestedString(issue, ["location", "path"]);
  const locator = readNestedString(issue, ["location", "locator"]);

  return {
    issue_id: readString(issue.issue_id) || problem,
    severity: readString(issue.severity),
    category: readString(issue.category),
    problem,
    evidence: readString(issue.evidence),
    recommended_fix: readString(issue.recommended_fix),
    locationLabel: path || locator || ""
  };
}

function normalizeInstruction(step) {
  if (!step || typeof step !== "object") {
    return null;
  }

  const instruction = readString(step.instruction);

  if (!instruction) {
    return null;
  }

  return {
    instruction,
    targets: normalizeTargets(step.targets),
    addresses_issue_ids: normalizeStringArray(step.addresses_issue_ids)
  };
}

function normalizeChangedFile(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const identifier = readString(entry.identifier);

  if (!identifier) {
    return null;
  }

  return {
    identifier,
    change_type: readString(entry.change_type) || "modified",
    summary: readString(entry.summary) || `Updated ${identifier}.`
  };
}

function normalizeValidatorCheck(check) {
  if (!check || typeof check !== "object") {
    return null;
  }

  const summary = readString(check.summary);

  if (!summary) {
    return null;
  }

  return {
    label: readString(check.name) || "check",
    status: readString(check.status),
    summary
  };
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets)) {
    return [];
  }

  return targets
    .map((target) => {
      if (typeof target === "string") {
        return target.trim();
      }

      if (!target || typeof target !== "object") {
        return "";
      }

      return (
        readString(target.path) ||
        readString(target.locator) ||
        readString(target.identifier) ||
        readString(target.note)
      );
    })
    .filter(Boolean);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function createEmptyTrace() {
  return {
    state: "none",
    occurred: false,
    isPartial: false,
    traceId: null,
    criticIssues: [],
    revisionInstructions: [],
    changedFiles: [],
    validatorStatus: null,
    validatorItems: [],
    improvementSummary: {
      netEffect: "",
      qualityDelta: "",
      notes: []
    }
  };
}

function createLoadingTrace() {
  return {
    state: "loading",
    occurred: false,
    isPartial: false,
    traceId: null,
    criticIssues: [],
    revisionInstructions: [],
    changedFiles: [],
    validatorStatus: null,
    validatorItems: [],
    improvementSummary: {
      netEffect: "",
      qualityDelta: "",
      notes: []
    }
  };
}

function createMissingTrace(revisionTrace) {
  const validatorStatus =
    readNestedString(revisionTrace, ["validatorOutcome", "status"]) ||
    readString(revisionTrace.validatorOutcome?.status);
  const validatorSummary =
    readNestedString(revisionTrace, ["validatorOutcome", "summary"]) ||
    readString(revisionTrace.validatorOutcome?.summary);

  return {
    state: "missing",
    occurred: true,
    isPartial: true,
    traceId: readString(revisionTrace.traceId),
    criticIssues: [],
    revisionInstructions: [],
    changedFiles: [],
    validatorStatus,
    validatorItems: validatorSummary
      ? [
          {
            label: "overall",
            status: validatorStatus,
            summary: validatorSummary
          }
        ]
      : [],
    improvementSummary: {
      netEffect: readString(revisionTrace.improvementSummary),
      qualityDelta: "",
      notes: []
    }
  };
}

function validatorItemsLength(validatorChecks, validatorSummary) {
  if (validatorChecks.length > 0) {
    return validatorChecks.length;
  }

  return validatorSummary ? 1 : 0;
}

function readNestedString(value, pathParts) {
  let current = value;

  for (const part of pathParts) {
    if (!current || typeof current !== "object") {
      return "";
    }

    current = current[part];
  }

  return readString(current);
}

function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}
