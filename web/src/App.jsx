import { useEffect, useRef, useState } from "react";
import RunForm from "./components/RunForm.jsx";
import AgentTimeline from "./components/AgentTimeline.jsx";
import LogPanel from "./components/LogPanel.jsx";
import ResultPanel from "./components/ResultPanel.jsx";
import FilePreview from "./components/FilePreview.jsx";
import { getRun, startRun } from "./lib/api.js";
import { connectRunSocket } from "./lib/socket.js";

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
  gridTemplateColumns: "320px minmax(0, 1fr) 360px",
  gridTemplateAreas: `
    "form timeline result"
    "preview preview preview"
  `,
  alignItems: "start",
  gap: "16px",
  padding: "24px"
};

const stackStyle = {
  display: "grid",
  gap: "16px"
};

const panelStyle = {
  minWidth: 0
};

const statusCardStyle = {
  margin: "16px 24px 0",
  padding: "16px 18px",
  borderRadius: "14px",
  background: "rgba(255, 255, 255, 0.76)",
  border: "1px solid rgba(31, 41, 51, 0.12)"
};

const statusMetaStyle = {
  margin: "8px 0 0",
  fontFamily: "monospace",
  fontSize: "0.9rem",
  color: "#52606d",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word"
};

export default function App() {
  const socketRef = useRef(null);
  const activeRunIdRef = useRef("");
  const [runId, setRunId] = useState("");
  const [runStatus, setRunStatus] = useState("idle");
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const [events, setEvents] = useState([]);
  const [runRecord, setRunRecord] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    return () => {
      closeActiveSocket(socketRef);
    };
  }, []);

  useEffect(() => {
    if (!(runStatus === "starting" || runStatus === "running")) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setClock(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [runStatus]);

  async function handleRunSubmit(payload) {
    closeActiveSocket(socketRef);

    activeRunIdRef.current = "";
    setRunId("");
    setRunRecord(null);
    setEvents([]);
    setErrorMessage("");
    setSocketStatus("connecting");
    setRunStatus("starting");

    try {
      const response = await startRun(payload);
      const nextRunId = response?.runId;

      if (typeof nextRunId !== "string" || nextRunId.trim() === "") {
        throw new Error("Run started without a run id.");
      }

      activeRunIdRef.current = nextRunId;
      setRunId(nextRunId);
      setRunStatus("running");
      setRunRecord({
        runId: nextRunId,
        status: "running",
        message: response?.message ?? "Run started",
        input: payload,
        result: null,
        error: null
      });

      connectSocketForRun(nextRunId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start run.";

      setRunStatus("failed");
      setSocketStatus("disconnected");
      setErrorMessage(message);
      setEvents([
        createClientEvent({
          eventType: "start_failed",
          summary: message
        })
      ]);
    }
  }

  function connectSocketForRun(nextRunId) {
    const socket = connectRunSocket(nextRunId, {
      onOpen: () => {
        if (activeRunIdRef.current !== nextRunId) {
          return;
        }

        setSocketStatus("connected");
      },
      onEvent: (payload) => {
        if (activeRunIdRef.current !== nextRunId) {
          return;
        }

        handleSocketPayload(nextRunId, payload);
      },
      onError: () => {
        if (activeRunIdRef.current !== nextRunId) {
          return;
        }

        setSocketStatus("error");
        setErrorMessage((currentMessage) => currentMessage || "Websocket connection error.");
      },
      onClose: () => {
        if (activeRunIdRef.current !== nextRunId) {
          return;
        }

        setSocketStatus("disconnected");
      }
    });

    socketRef.current = socket;
  }

  function handleSocketPayload(currentRunId, payload) {
    if (payload?.type === "connected") {
      return;
    }

    if (payload?.type === "subscribed") {
      setSocketStatus("subscribed");
      return;
    }

    if (payload?.type === "error") {
      const message = payload?.message || "Websocket error.";
      setErrorMessage(message);
      setEvents((currentEvents) =>
        currentEvents.concat(
          createClientEvent({
            eventType: "socket_error",
            summary: message
          })
        )
      );
      return;
    }

    if (payload?.runId !== currentRunId || !payload?.event) {
      return;
    }

    const nextEvent = normalizeEvent(payload.event);

    setEvents((currentEvents) => currentEvents.concat(nextEvent));

    setRunRecord((currentRecord) => ({
      ...(currentRecord ?? {}),
      runId: currentRunId,
      status: getRunStatusFromEvent(nextEvent, currentRecord?.status ?? "running"),
      lastEvent: nextEvent
    }));

    if (nextEvent.eventType === "run_failed") {
      setRunStatus("failed");
      setErrorMessage(nextEvent.summary || "Run failed.");
      void hydrateRun(currentRunId);
      return;
    }

    if (nextEvent.eventType === "run_completed") {
      setRunStatus("completed");
      void hydrateRun(currentRunId);
      return;
    }

    setRunStatus("running");
  }

  async function hydrateRun(currentRunId) {
    try {
      const nextRunRecord = await getRun(currentRunId);

      if (activeRunIdRef.current !== currentRunId) {
        return;
      }

      setRunRecord(nextRunRecord);
      setRunStatus(nextRunRecord?.status ?? "completed");

      if (nextRunRecord?.error?.message) {
        setErrorMessage(nextRunRecord.error.message);
      }

      if (nextRunRecord?.lastEvent) {
        setEvents((currentEvents) => appendEventIfMissing(currentEvents, nextRunRecord.lastEvent));
      }
    } catch (error) {
      if (activeRunIdRef.current !== currentRunId) {
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Failed to fetch final run details."
      );
    }
  }

  const normalizedResult = buildResult({
    runId,
    runStatus,
    runRecord,
    errorMessage
  });
  const deliverables = getDeliverables(normalizedResult);
  const previewFiles = getPreviewFiles(normalizedResult, deliverables);
  const isRunning = runStatus === "starting" || runStatus === "running";
  const hasStartedRun = runId !== "" || runRecord !== null || events.length > 0;
  const lastEvent = events[events.length - 1] ?? runRecord?.lastEvent ?? null;
  const runDuration = getRunDuration({
    runRecord,
    events,
    runStatus,
    clock
  });
  const statusBanner = getStatusBanner({
    hasStartedRun,
    isRunning,
    runId,
    runStatus,
    socketStatus,
    lastEvent,
    errorMessage,
    runDuration,
    deliverableCount: deliverables.length,
    fileCount: previewFiles.length,
    eventCount: events.length
  });

  return (
    <main style={shellStyle}>
      <header style={{ padding: "24px 24px 0" }}>
        <p style={{ margin: 0, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          SMMA Browser Shell
        </p>
        <h1 style={{ margin: "8px 0 0", fontSize: "2.5rem" }}>Pipeline Control Room</h1>
        <p style={{ maxWidth: "60ch" }}>
          Run the pipeline, follow websocket updates in real time, and inspect the
          final packaged output from the backend.
        </p>
        <p style={{ marginBottom: 0, color: "#52606d" }}>
          Status: <strong>{runStatus}</strong>
          {runId ? ` · Run ${runId}` : ""}
          {socketStatus !== "disconnected" ? ` · Socket ${socketStatus}` : ""}
        </p>
        {errorMessage ? (
          <p style={{ marginBottom: 0, color: "#9b1c1c" }}>{errorMessage}</p>
        ) : null}
      </header>

      <section
        style={{
          ...statusCardStyle,
          borderColor: statusBanner.borderColor,
          background: statusBanner.background
        }}
      >
        <h2 style={{ margin: 0 }}>{statusBanner.title}</h2>
        <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>{statusBanner.message}</p>
        <p style={statusMetaStyle}>{statusBanner.meta}</p>
      </section>

      <section style={layoutStyle}>
        <div style={{ ...stackStyle, ...panelStyle, gridArea: "form" }}>
          <RunForm
            onSubmit={handleRunSubmit}
            isRunning={isRunning}
            runId={runId}
            status={runStatus}
            error={errorMessage}
          />
        </div>

        <div style={{ ...stackStyle, ...panelStyle, gridArea: "timeline" }}>
          <AgentTimeline runId={runId} status={runStatus} events={events} />
          <LogPanel runId={runId} status={runStatus} events={events} />
        </div>

        <div style={{ ...stackStyle, ...panelStyle, gridArea: "result" }}>
          <ResultPanel runId={runId} status={runStatus} result={normalizedResult} />
        </div>

        <div style={{ ...panelStyle, gridArea: "preview" }}>
          <FilePreview
            runId={runId}
            status={runStatus}
            deliverables={deliverables}
            files={previewFiles}
          />
        </div>
      </section>
    </main>
  );
}

function closeActiveSocket(socketRef) {
  if (socketRef.current) {
    socketRef.current.close();
    socketRef.current = null;
  }
}

function normalizeEvent(event) {
  const eventType =
    typeof event?.eventType === "string"
      ? event.eventType
      : typeof event?.type === "string"
        ? event.type
        : "event";

  return {
    ...event,
    type: typeof event?.type === "string" ? event.type : eventType,
    eventType,
    summary: event?.summary || event?.message || "No summary provided.",
    timestamp:
      typeof event?.timestamp === "string" ? event.timestamp : new Date().toISOString()
  };
}

function createClientEvent({ eventType, summary }) {
  return normalizeEvent({
    type: "step_failed",
    eventType,
    step: "client",
    agent: "client",
    summary
  });
}

function getRunStatusFromEvent(event, currentStatus) {
  if (event?.eventType === "run_completed") {
    return "completed";
  }

  if (event?.eventType === "run_failed") {
    return "failed";
  }

  return currentStatus;
}

function appendEventIfMissing(events, event) {
  const normalizedEvent = normalizeEvent(event);
  const eventKey = getEventKey(normalizedEvent);

  if (events.some((currentEvent) => getEventKey(currentEvent) === eventKey)) {
    return events;
  }

  return events.concat(normalizedEvent);
}

function getEventKey(event) {
  return [
    event?.timestamp ?? "",
    event?.eventType ?? "",
    event?.type ?? "",
    event?.step ?? "",
    event?.summary ?? ""
  ].join(":");
}

function buildResult({ runId, runStatus, runRecord, errorMessage }) {
  if (!runId && !runRecord) {
    return null;
  }

  const result = runRecord?.result ?? null;
  const packaging = normalizePackaging(result?.packaging);

  return {
    ...(result ?? {}),
    runId: runRecord?.runId ?? runId,
    status: runRecord?.status ?? runStatus,
    mode:
      result?.mode ??
      result?.pipelineResult?.mode ??
      runRecord?.input?.modeHint ??
      null,
    error: runRecord?.error ?? (errorMessage ? { message: errorMessage } : null),
    packaging
  };
}

function normalizePackaging(packaging) {
  if (!packaging) {
    return null;
  }

  return {
    ...packaging,
    parsed: packaging.parsed ?? parseJson(packaging.stdout)
  };
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

function getPreviewFiles(result, deliverables) {
  if (Array.isArray(result?.pipelineResult?.files)) {
    return result.pipelineResult.files;
  }

  if (Array.isArray(result?.artifact?.files)) {
    return result.artifact.files;
  }

  return deliverables.flatMap((deliverable) => {
    if (Array.isArray(deliverable?.files)) {
      return deliverable.files;
    }

    const parsedContent = parseJson(deliverable?.content);

    if (Array.isArray(parsedContent?.files)) {
      return parsedContent.files;
    }

    return [];
  });
}

function parseJson(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getStatusBanner({
  hasStartedRun,
  isRunning,
  runId,
  runStatus,
  socketStatus,
  lastEvent,
  errorMessage,
  runDuration,
  deliverableCount,
  fileCount,
  eventCount
}) {
  if (!hasStartedRun) {
    return {
      title: "No run yet",
      message:
        "Submit a request to start the pipeline. Timeline, logs, final packaging, and file previews will populate from API and websocket data.",
      meta: "state=idle\nexpected_flow=startRun -> websocket subscribe -> live events -> final GET /api/run/:runId",
      borderColor: "rgba(31, 41, 51, 0.12)",
      background: "rgba(255, 255, 255, 0.76)"
    };
  }

  if (runStatus === "failed") {
    return {
      title: "Run failed",
      message:
        errorMessage ||
        lastEvent?.summary ||
        "The pipeline reported a failure. Check the latest event and the log panel first.",
      meta: [
        `runId=${runId || "unknown"}`,
        `socket=${socketStatus}`,
        `duration=${runDuration || "unknown"}`,
        `lastEvent=${lastEvent?.eventType || "none"}`,
        `events=${eventCount}`
      ].join("\n"),
      borderColor: "rgba(155, 28, 28, 0.24)",
      background: "rgba(254, 226, 226, 0.72)"
    };
  }

  if (isRunning) {
    return {
      title: "Pipeline running",
      message:
        lastEvent?.summary ||
        "The run is active. New websocket events should appear in the timeline and log panel as stages progress.",
      meta: [
        `runId=${runId || "pending"}`,
        `status=${runStatus}`,
        `socket=${socketStatus}`,
        `elapsed=${runDuration || "unknown"}`,
        `events=${eventCount}`
      ].join("\n"),
      borderColor: "rgba(194, 120, 3, 0.24)",
      background: "rgba(255, 247, 237, 0.8)"
    };
  }

  if (runStatus === "completed") {
    return {
      title: "Run completed",
      message:
        lastEvent?.summary ||
        "Final run details are available. Inspect the result panel and any generated files.",
      meta: [
        `runId=${runId || "unknown"}`,
        `duration=${runDuration || "unknown"}`,
        `deliverables=${deliverableCount}`,
        `previewFiles=${fileCount}`,
        `events=${eventCount}`
      ].join("\n"),
      borderColor: "rgba(18, 122, 69, 0.24)",
      background: "rgba(236, 253, 245, 0.78)"
    };
  }

  return {
    title: "Run state available",
    message: "The app has run data, but the pipeline is not currently active.",
    meta: [
      `runId=${runId || "unknown"}`,
      `status=${runStatus}`,
      `socket=${socketStatus}`,
      `duration=${runDuration || "unknown"}`
    ].join("\n"),
    borderColor: "rgba(31, 41, 51, 0.12)",
    background: "rgba(255, 255, 255, 0.76)"
  };
}

function getRunDuration({ runRecord, events, runStatus, clock }) {
  const startedAt =
    runRecord?.timestamps?.acceptedAt ??
    runRecord?.acceptedAt ??
    runRecord?.timestamps?.createdAt ??
    runRecord?.createdAt ??
    events[0]?.timestamp ??
    null;

  if (!startedAt) {
    return null;
  }

  const startedAtMs = new Date(startedAt).getTime();

  if (Number.isNaN(startedAtMs)) {
    return null;
  }

  const completedAt =
    runRecord?.timestamps?.completedAt ??
    runRecord?.completedAt ??
    runRecord?.timestamps?.finalizedAt ??
    runRecord?.finalizedAt ??
    (runStatus === "completed" || runStatus === "failed"
      ? runRecord?.updatedAt ?? events[events.length - 1]?.timestamp ?? null
      : null);
  const endedAtMs =
    completedAt && (runStatus === "completed" || runStatus === "failed")
      ? new Date(completedAt).getTime()
      : clock;
  const durationMs = Math.max(0, endedAtMs - startedAtMs);

  return formatDuration(durationMs);
}

function formatDuration(durationMs) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
