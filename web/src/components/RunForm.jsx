import { useState } from "react";

const cardStyle = {
  padding: "20px",
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.72)",
  border: "1px solid rgba(31, 41, 51, 0.12)"
};

const fieldStyle = {
  display: "grid",
  gap: "8px",
  marginBottom: "14px"
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(31, 41, 51, 0.2)",
  font: "inherit",
  boxSizing: "border-box"
};

const buttonStyle = {
  padding: "10px 14px",
  borderRadius: "10px",
  border: "none",
  background: "#1f2933",
  color: "#ffffff",
  font: "inherit",
  cursor: "pointer"
};

const MODE_OPTIONS = [
  "auto",
  "website",
  "docx",
  "slide",
  "sheet",
  "deep_research"
];

export default function RunForm({ onSubmit, isRunning = false }) {
  const [userRequest, setUserRequest] = useState("");
  const [modeHint, setModeHint] = useState("auto");

  function handleSubmit(event) {
    event.preventDefault();

    const trimmedRequest = userRequest.trim();

    if (!trimmedRequest || isRunning) {
      return;
    }

    onSubmit?.({
      userRequest: trimmedRequest,
      modeHint: modeHint === "auto" ? null : modeHint
    });
  }

  return (
    <form style={cardStyle} onSubmit={handleSubmit}>
      <h2 style={{ marginTop: 0 }}>Run Request</h2>

      <div style={fieldStyle}>
        <label htmlFor="request">Request</label>
        <textarea
          id="request"
          rows="8"
          value={userRequest}
          onChange={(event) => setUserRequest(event.target.value)}
          placeholder="Describe what the pipeline should produce."
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="mode">Mode</label>
        <select
          id="mode"
          value={modeHint}
          onChange={(event) => setModeHint(event.target.value)}
          style={inputStyle}
        >
          {MODE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={isRunning || userRequest.trim() === ""}
        style={{
          ...buttonStyle,
          opacity: isRunning || userRequest.trim() === "" ? 0.6 : 1,
          cursor: isRunning || userRequest.trim() === "" ? "not-allowed" : "pointer"
        }}
      >
        {isRunning ? "Running..." : "Run"}
      </button>
    </form>
  );
}
