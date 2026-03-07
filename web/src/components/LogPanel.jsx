const cardStyle = {
  padding: "20px",
  borderRadius: "18px",
  background: "#17212b",
  color: "#f8fafc",
  border: "1px solid rgba(255, 255, 255, 0.08)"
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

const metaStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "4px",
  fontSize: "0.8rem",
  color: "#94a3b8",
  fontFamily: "monospace"
};

const summaryStyle = {
  margin: 0,
  color: "#e2e8f0",
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word"
};

export default function LogPanel({ events = [] }) {
  const orderedEvents = [...events].sort((left, right) => {
    const leftTime = new Date(left?.timestamp ?? 0).getTime();
    const rightTime = new Date(right?.timestamp ?? 0).getTime();
    return leftTime - rightTime;
  });

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Live Logs</h2>

      {orderedEvents.length === 0 ? (
        <p style={{ margin: 0, color: "#94a3b8" }}>No log events yet.</p>
      ) : (
        <div style={logViewportStyle}>
          {orderedEvents.map((event, index) => (
            <div
              key={`${event?.timestamp ?? "event"}-${event?.eventType ?? event?.type ?? index}`}
              style={rowStyle}
            >
              <div style={metaStyle}>
                <span>{formatTimestamp(event?.timestamp)}</span>
                <span>{event?.eventType || event?.type || "event"}</span>
              </div>
              <p style={summaryStyle}>{event?.summary || "No summary provided."}</p>
            </div>
          ))}
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
