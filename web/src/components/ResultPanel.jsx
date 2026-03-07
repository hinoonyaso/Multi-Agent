const cardStyle = {
  padding: "20px",
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.78)",
  border: "1px solid rgba(31, 41, 51, 0.12)"
};

const labelStyle = {
  margin: "0 0 8px",
  color: "#52606d"
};

const valueStyle = {
  margin: "0 0 14px",
  color: "#1f2933"
};

const listStyle = {
  margin: 0,
  paddingLeft: "18px",
  color: "#1f2933"
};

export default function ResultPanel({ result }) {
  const status = result?.status ?? "idle";
  const mode = result?.mode ?? result?.final_mode ?? "unknown";
  const deliverables = getDeliverables(result);

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Result</h2>

      {!result ? (
        <p style={{ marginBottom: 0, color: "#52606d" }}>
          No completed result yet. Start a run to see final output details.
        </p>
      ) : (
        <>
          <p style={labelStyle}>Run Status</p>
          <p style={valueStyle}>
            <strong>{status}</strong>
          </p>

          <p style={labelStyle}>Final Mode</p>
          <p style={valueStyle}>{mode}</p>

          <p style={labelStyle}>Deliverables</p>
          {deliverables.length === 0 ? (
            <p style={{ ...valueStyle, marginBottom: 0 }}>
              No deliverables available yet.
            </p>
          ) : (
            <ul style={listStyle}>
              {deliverables.map((item, index) => (
                <li key={`${item.name}-${index}`} style={{ marginBottom: "8px" }}>
                  <strong>{item.name}</strong>
                  {item.type ? ` (${item.type})` : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function getDeliverables(result) {
  if (Array.isArray(result?.packaging?.parsed?.deliverables)) {
    return result.packaging.parsed.deliverables;
  }

  if (Array.isArray(result?.packaging?.deliverables)) {
    return result.packaging.deliverables;
  }

  if (Array.isArray(result?.deliverables)) {
    return result.deliverables;
  }

  return [];
}
