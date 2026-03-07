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
  gap: "10px"
};

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "12px 72px 1fr",
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

export default function AgentTimeline({ events = [] }) {
  const orderedEvents = [...events].sort((left, right) => {
    const leftTime = new Date(left?.timestamp ?? 0).getTime();
    const rightTime = new Date(right?.timestamp ?? 0).getTime();
    return leftTime - rightTime;
  });

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Agent Timeline</h2>

      {orderedEvents.length === 0 ? (
        <p style={{ marginBottom: 0, color: "#52606d" }}>
          No events yet. Start a run to observe agent progress.
        </p>
      ) : (
        <ol style={listStyle}>
          {orderedEvents.map((event, index) => {
            const state = getEventState(event);
            const label = event?.agent || event?.step || "run";

            return (
              <li
                key={`${event?.timestamp ?? "event"}-${event?.eventType ?? event?.type ?? index}`}
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

                <span style={timeStyle}>{formatTimestamp(event?.timestamp)}</span>

                <div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <strong>{label}</strong>
                    <span style={{ ...metaStyle, color: state.text }}>
                      {event?.eventType || event?.type || "event"}
                    </span>
                  </div>
                  <p style={summaryStyle}>{event?.summary || "No summary provided."}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function getEventState(event) {
  const type = String(event?.eventType || event?.type || "").toLowerCase();

  if (type.includes("failed")) {
    return {
      dot: "#c81e1e",
      border: "rgba(200, 30, 30, 0.28)",
      text: "#9b1c1c"
    };
  }

  if (type.includes("completed")) {
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
