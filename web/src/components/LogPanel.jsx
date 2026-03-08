import { useState } from "react";

const cardStyle = {
  padding: "20px",
  borderRadius: "18px",
  background: "#17212b",
  color: "#f8fafc",
  border: "1px solid rgba(255, 255, 255, 0.08)"
};

const toggleButtonStyle = {
  appearance: "none",
  border: "1px solid rgba(255, 255, 255, 0.14)",
  background: "rgba(255, 255, 255, 0.04)",
  color: "#f8fafc",
  borderRadius: "10px",
  padding: "8px 12px",
  cursor: "pointer",
  marginBottom: "14px"
};

const logViewportStyle = {
  maxHeight: "320px",
  overflowY: "auto",
  display: "grid",
  gap: "10px",
  paddingRight: "6px"
};

const rowStyle = {
  paddingBottom: "10px",
  borderBottom: "1px solid rgba(255, 255, 255, 0.08)"
};

const finalizerRowStyle = {
  ...rowStyle,
  borderLeft: "3px solid #f59e0b",
  paddingLeft: "10px"
};

const metaStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "4px",
  fontSize: "0.8rem",
  color: "#94a3b8",
  fontFamily: "monospace"
};

const timingStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  marginBottom: "6px",
  fontSize: "0.78rem",
  color: "#cbd5e1",
  fontFamily: "monospace"
};

const timingBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: "999px",
  background: "rgba(148, 163, 184, 0.14)",
  border: "1px solid rgba(148, 163, 184, 0.22)"
};

const finalizerTimingBadgeStyle = {
  ...timingBadgeStyle,
  color: "#fbbf24",
  background: "rgba(245, 158, 11, 0.14)",
  border: "1px solid rgba(245, 158, 11, 0.35)"
};

const summaryStyle = {
  margin: 0,
  color: "#e2e8f0",
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word"
};

export default function LogPanel({ events = [] }) {
  const [isOpen, setIsOpen] = useState(false);

  const orderedEvents = [...events].sort((left, right) => {
    const leftTime = new Date(left?.timestamp ?? 0).getTime();
    const rightTime = new Date(right?.timestamp ?? 0).getTime();
    return leftTime - rightTime;
  });

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Developer Logs</h2>

      <button
        type="button"
        style={toggleButtonStyle}
        onClick={() => setIsOpen((previous) => !previous)}
      >
        {isOpen ? "Hide raw events" : `Show raw events (${orderedEvents.length})`}
      </button>

      {!isOpen ? (
        <p style={{ margin: 0, color: "#94a3b8" }}>
          Raw websocket events are hidden by default. Expand this panel for debugging
          details.
        </p>
      ) : orderedEvents.length === 0 ? (
        <p style={{ margin: 0, color: "#94a3b8" }}>No log events yet.</p>
      ) : (
        <div style={logViewportStyle}>
          {orderedEvents.map((event, index) => {
            const eventType = event?.eventType || event?.type || "event";
            const isFinalizerEvent = isFinalizerEventType(event);
            const timingEntries = getTimingEntries(event);

            return (
              <div
                key={`${event?.timestamp ?? "event"}-${eventType}-${index}`}
                style={isFinalizerEvent ? finalizerRowStyle : rowStyle}
              >
                <div style={metaStyle}>
                  <span>{formatTimestamp(event?.timestamp)}</span>
                  <span>{eventType}</span>
                  {event?.agent ? <span>agent={event.agent}</span> : null}
                  {event?.step ? <span>step={event.step}</span> : null}
                </div>

                {timingEntries.length > 0 ? (
                  <div style={timingStyle}>
                    {timingEntries.map((entry) => (
                      <span
                        key={entry.label}
                        style={
                          isFinalizerEvent && entry.emphasize
                            ? finalizerTimingBadgeStyle
                            : timingBadgeStyle
                        }
                      >
                        {entry.label}: {entry.value}
                      </span>
                    ))}
                  </div>
                ) : null}

                <p style={summaryStyle}>{event?.summary || "No summary provided."}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
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

function isFinalizerEventType(event) {
  const type = String(event?.eventType || event?.type || "").toLowerCase();
  const step = String(event?.step || "").toLowerCase();
  return type.includes("finalizer") || step === "finalizer";
}

function getTimingEntries(event) {
  const entries = [];
  const duration = formatDuration(event?.durationMs ?? event?.duration_ms);
  const startedAt = formatTimestamp(event?.startedAt ?? event?.started_at);
  const completedAt = formatTimestamp(event?.completedAt ?? event?.completed_at);

  if (duration) {
    entries.push({
      label: "duration",
      value: duration,
      emphasize: true
    });
  }

  if (startedAt !== "--:--:--") {
    entries.push({
      label: "start",
      value: startedAt,
      emphasize: false
    });
  }

  if (completedAt !== "--:--:--") {
    entries.push({
      label: "end",
      value: completedAt,
      emphasize: false
    });
  }

  return entries;
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
