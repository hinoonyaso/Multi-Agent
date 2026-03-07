import RunForm from "./components/RunForm.jsx";
import AgentTimeline from "./components/AgentTimeline.jsx";
import LogPanel from "./components/LogPanel.jsx";
import ResultPanel from "./components/ResultPanel.jsx";
import FilePreview from "./components/FilePreview.jsx";

const placeholderAgents = [
  { id: "router", title: "Router", status: "idle" },
  { id: "planner", title: "Planner", status: "idle" },
  { id: "worker", title: "Mode Worker", status: "idle" },
  { id: "validator", title: "Validator", status: "idle" }
];

const placeholderLogs = [
  "[placeholder] Waiting for backend API wiring.",
  "[placeholder] Websocket event stream not connected."
];

const placeholderResult = {
  mode: "website",
  runId: "pending",
  summary: "Results will render here once the orchestrator is exposed through the API layer."
};

const shellStyle = {
  minHeight: "100vh",
  margin: 0,
  fontFamily: "Georgia, serif",
  background:
    "linear-gradient(135deg, #f3eadb 0%, #d8e5ea 45%, #f9f6ef 100%)",
  color: "#1f2933"
};

const layoutStyle = {
  display: "grid",
  gridTemplateColumns: "320px 1fr 360px",
  gap: "16px",
  padding: "24px"
};

const stackStyle = {
  display: "grid",
  gap: "16px"
};

export default function App() {
  return (
    <main style={shellStyle}>
      <header style={{ padding: "24px 24px 0" }}>
        <p style={{ margin: 0, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          SMMA Browser Shell
        </p>
        <h1 style={{ margin: "8px 0 0", fontSize: "2.5rem" }}>Pipeline Control Room</h1>
        <p style={{ maxWidth: "60ch" }}>
          Placeholder browser UI for running and observing the existing multi-agent
          pipeline. The layout is split so future modes can reuse the same shell.
        </p>
      </header>

      <section style={layoutStyle}>
        <div style={stackStyle}>
          <RunForm />
          <FilePreview />
        </div>

        <div style={stackStyle}>
          <AgentTimeline agents={placeholderAgents} />
          <LogPanel entries={placeholderLogs} />
        </div>

        <div style={stackStyle}>
          <ResultPanel result={placeholderResult} />
        </div>
      </section>
    </main>
  );
}
