import { useEffect, useState } from "react";

const fieldStyle = {
  display: "grid",
  gap: "4px"
};

const shellStyle = {
  width: "100%",
  padding: "12px 12px 8px",
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.88)",
  border: "1px solid rgba(20, 24, 28, 0.1)",
  boxShadow: "0 22px 60px rgba(31, 41, 51, 0.08)"
};

const inputStyle = {
  width: "100%",
  border: "none",
  font: "inherit",
  fontSize: "0.96rem",
  lineHeight: 1.35,
  color: "#111827",
  background: "transparent",
  boxSizing: "border-box",
  outline: "none",
  padding: 0
};

const buttonStyle = {
  minWidth: "46px",
  height: "46px",
  borderRadius: "14px",
  border: "none",
  background: "#15191e",
  color: "#ffffff",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 12px 24px rgba(21, 25, 30, 0.18)"
};

const secondaryControlStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  height: "36px",
  padding: "0 12px",
  borderRadius: "999px",
  border: "1px solid rgba(20, 24, 28, 0.1)",
  background: "rgba(246, 247, 248, 0.95)",
  color: "#30363d",
  fontSize: "0.88rem"
};

const footerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "8px",
  marginTop: "8px",
  flexWrap: "wrap"
};

const metaStyle = {
  marginTop: "6px",
  fontSize: "0.82rem",
  color: "#6b7280"
};

export default function RunForm({
  onSubmit,
  isRunning = false,
  runId = "",
  status = "idle",
  error = "",
  selectedMode = "website",
  placeholder = "Throw me a hard one. I'm ready.",
  resetKey = ""
}) {
  const [userRequest, setUserRequest] = useState("");

  useEffect(() => {
    setUserRequest("");
  }, [resetKey]);

  function submitRequest() {
    const trimmedRequest = userRequest.trim();

    if (!trimmedRequest || isRunning) {
      return;
    }

    onSubmit?.({
      userRequest: trimmedRequest,
      modeHint: selectedMode
    });
  }

  function handleSubmit(event) {
    event.preventDefault();
    submitRequest();
  }

  function handleKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    submitRequest();
  }

  return (
    <form style={shellStyle} onSubmit={handleSubmit}>
      <div style={fieldStyle}>
        <textarea
          id="request"
          rows="2"
          value={userRequest}
          onChange={(event) => setUserRequest(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{ ...inputStyle, resize: "none" }}
        />
      </div>

      <div style={footerStyle}>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <div style={secondaryControlStyle}>Mode {selectedMode}</div>
          <div style={secondaryControlStyle}>Agent Ready</div>
        </div>

        <button
          type="submit"
          disabled={isRunning || userRequest.trim() === ""}
          style={{
            ...buttonStyle,
            opacity: isRunning || userRequest.trim() === "" ? 0.45 : 1,
            cursor: isRunning || userRequest.trim() === "" ? "not-allowed" : "pointer"
          }}
          aria-label={isRunning ? "Running" : "Run"}
        >
          {isRunning ? "..." : "->"}
        </button>
      </div>

      <p style={metaStyle}>
        {error
          ? error
          : runId
            ? `Run ${runId} · ${status}`
            : "Website, docx, slide, sheet, and research requests are supported."}
      </p>
    </form>
  );
}
