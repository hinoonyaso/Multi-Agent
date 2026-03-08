const cardStyle = {
  padding: "20px",
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.78)",
  border: "1px solid rgba(31, 41, 51, 0.12)"
};

const listStyle = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "grid",
  gap: "10px",
  maxHeight: "320px",
  overflowY: "auto",
  paddingRight: "6px"
};

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "12px 88px 1fr auto",
  gap: "12px",
  alignItems: "start",
  padding: "10px 12px",
  borderRadius: "12px",
  background: "rgba(15, 23, 42, 0.04)"
};

const timeStyle = {
  fontSize: "0.8rem",
  color: "#52606d",
  fontVariantNumeric: "tabular-nums"
};

const summaryStyle = {
  margin: "4px 0 0",
  color: "#1f2933",
  lineHeight: 1.4
};

const metaStyle = {
  fontSize: "0.85rem",
  color: "#52606d"
};

const badgeStyle = {
  fontSize: "0.78rem",
  padding: "4px 8px",
  borderRadius: "999px",
  background: "rgba(15, 23, 42, 0.08)",
  color: "#334155",
  whiteSpace: "nowrap"
};

const IMPORTANT_TYPES = new Set([
  "router_completed",
  "planner_started",
  "planner_completed",
  "mode_started",
  "architect_started",
  "architect_completed",
  "coder_started",
  "coder_completed",
  "ui_critic_started",
  "ui_critic_completed",
  "revision_started",
  "revision_completed",
  "validator_started",
  "validator_completed",
  "finalizer_started",
  "finalizer_completed",
  "run_completed",
  "run_failed"
]);

export default function AgentTimeline({ events = [] }) {
  const steps = compressEventsToSteps(events);

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Execution Timeline</h2>

      {steps.length === 0 ? (
        <p style={{ marginBottom: 0, color: "#52606d" }}>
          No execution steps yet. Start a run to observe pipeline progress.
        </p>
      ) : (
        <ol style={listStyle}>
          {steps.map((step, index) => {
            const state = getStepState(step);

            return (
              <li
                key={`${step.key}-${index}`}
                style={{
                  ...rowStyle,
                  border: `1px solid ${state.border}`
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "999px",
                    marginTop: "4px",
                    background: state.dot
                  }}
                />

                <span style={timeStyle}>
                  {formatTimestamp(step.completedAt || step.startedAt)}
                </span>

                <div>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                      alignItems: "center"
                    }}
                  >
                    <strong>{step.label}</strong>
                    <span style={{ ...metaStyle, color: state.text }}>
                      {step.statusLabel}
                    </span>
                  </div>
                  <p style={summaryStyle}>{step.summary}</p>
                </div>

                <span style={badgeStyle}>{formatDuration(step.durationMs) || "-"}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function compressEventsToSteps(events) {
  const orderedEvents = [...events].sort((left, right) => {
    const leftTime = new Date(left?.timestamp ?? 0).getTime();
    const rightTime = new Date(right?.timestamp ?? 0).getTime();
    return leftTime - rightTime;
  });

  const grouped = new Map();

  for (const event of orderedEvents) {
    const type = String(event?.eventType || event?.type || "");

    if (!IMPORTANT_TYPES.has(type)) {
      continue;
    }

    const stepKey = normalizeStepKey(event);
    const stepLabel = normalizeStepLabel(stepKey);

    if (!grouped.has(stepKey)) {
      grouped.set(stepKey, {
        key: stepKey,
        label: stepLabel,
        status: "pending",
        statusLabel: "Pending",
        startedAt: null,
        completedAt: null,
        durationMs: null,
        summary: "No summary provided."
      });
    }

    const item = grouped.get(stepKey);

    if (type.endsWith("_started") || type === "mode_started") {
      item.startedAt = event?.timestamp ?? item.startedAt;
      item.status = "running";
      item.statusLabel = "Running";
      item.summary = event?.summary || item.summary;
    }

    if (
      type.endsWith("_completed") ||
      type === "router_completed" ||
      type === "run_completed"
    ) {
      item.completedAt = event?.timestamp ?? item.completedAt;
      item.status = "completed";
      item.statusLabel = detectCompletedStatusLabel(stepKey, event);
      item.summary = event?.summary || item.summary;
      item.durationMs =
        event?.durationMs ??
        event?.duration_ms ??
        computeDuration(item.startedAt, item.completedAt);
    }

    if (type.endsWith("_failed") || type === "run_failed") {
      item.completedAt = event?.timestamp ?? item.completedAt;
      item.status = "failed";
      item.statusLabel = "Failed";
      item.summary = event?.summary || item.summary;
      item.durationMs =
        event?.durationMs ??
        event?.duration_ms ??
        computeDuration(item.startedAt, item.completedAt);
    }
  }

  return Array.from(grouped.values());
}

function normalizeStepKey(event) {
  const type = String(event?.eventType || event?.type || "");
  const explicitStep = String(event?.step || event?.agent || "").trim();

  if (explicitStep) {
    if (explicitStep === "coder_first_pass" || explicitStep === "coder_revision") {
      return "coder";
    }

    return explicitStep;
  }

  if (type === "router_completed") return "router";
  if (type.startsWith("planner_")) return "planner";
  if (type.startsWith("architect_")) return "architect";
  if (type.startsWith("coder_")) return "coder";
  if (type.startsWith("ui_critic_")) return "ui_critic";
  if (type.startsWith("revision_")) return "revision";
  if (type.startsWith("validator_")) return "validator";
  if (type.startsWith("finalizer_")) return "finalizer";
  if (type.startsWith("run_")) return "run";
  if (type.startsWith("mode_")) return "mode";

  return "run";
}

function normalizeStepLabel(stepKey) {
  switch (stepKey) {
    case "router":
      return "Router";
    case "planner":
      return "Planner";
    case "mode":
      return "Mode Pipeline";
    case "architect":
      return "Architect";
    case "coder":
      return "Coder";
    case "ui_critic":
      return "UI Critic";
    case "revision":
      return "Revision";
    case "validator":
      return "Mode Validator";
    case "finalizer":
      return "Finalizer";
    case "run":
      return "Run";
    default:
      return stepKey;
  }
}

function detectCompletedStatusLabel(stepKey, event) {
  if (stepKey === "ui_critic") {
    const summary = String(event?.summary || "").toLowerCase();

    if (summary.includes("revise")) {
      return "Needs Revision";
    }
  }

  if (stepKey === "revision") {
    return "Revised";
  }

  if (stepKey === "run") {
    return "Completed";
  }

  return "Completed";
}

function getStepState(step) {
  if (step.status === "failed") {
    return {
      dot: "#c81e1e",
      border: "rgba(200, 30, 30, 0.28)",
      text: "#9b1c1c"
    };
  }

  if (step.status === "completed") {
    return {
      dot: "#127a45",
      border: "rgba(18, 122, 69, 0.24)",
      text: "#0f6b3e"
    };
  }

  return {
    dot: "#c27803",
    border: "rgba(194, 120, 3, 0.24)",
    text: "#8d5a00"
  };
}

function formatTimestamp(value) {
  if (!value) {
    return "--:--:--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function computeDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) {
    return null;
  }

  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  return end - start;
}

function formatDuration(value) {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}s`;
}
