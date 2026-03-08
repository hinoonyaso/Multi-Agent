import { useEffect, useRef, useState } from "react";
import RunForm from "./components/RunForm.jsx";
import AgentTimeline from "./components/AgentTimeline.jsx";
import LogPanel from "./components/LogPanel.jsx";
import ResultPanel from "./components/ResultPanel.jsx";
import RevisionTracePanel from "./components/RevisionTracePanel.jsx";
import FilePreview from "./components/FilePreview.jsx";
import { getRun, startRun } from "./lib/api.js";
import { connectRunSocket } from "./lib/socket.js";

const shellStyle = {
  minHeight: "100vh",
  margin: 0,
  fontFamily: "\"IBM Plex Sans\", \"Segoe UI\", sans-serif",
  background:
    "radial-gradient(circle at top, rgba(244, 245, 247, 0.95) 0%, rgba(238, 239, 241, 0.98) 34%, #ececeb 100%)",
  color: "#111827"
};

const frameStyle = {
  display: "grid",
  gridTemplateColumns: "240px minmax(0, 1fr) 360px",
  minHeight: "100vh"
};

const sidebarStyle = {
  borderRight: "1px solid rgba(17, 24, 39, 0.08)",
  padding: "18px 12px",
  background: "rgba(245, 246, 247, 0.88)",
  backdropFilter: "blur(18px)",
  display: "flex",
  flexDirection: "column",
  gap: "18px"
};

const brandMarkStyle = {
  width: "32px",
  height: "32px",
  borderRadius: "11px",
  display: "grid",
  placeItems: "center",
  background: "#0f172a",
  color: "#ffffff",
  fontWeight: 800,
  fontSize: "1.1rem"
};

const newChatButtonStyle = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 14px",
  borderRadius: "14px",
  border: "1px solid rgba(39, 30, 17, 0.08)",
  background: "#ffffff",
  color: "#111827",
  font: "inherit"
};

const navGroupStyle = {
  display: "grid",
  gap: "6px"
};

const navItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px 12px",
  borderRadius: "12px",
  color: "#111827"
};

const navBulletStyle = {
  width: "8px",
  height: "8px",
  borderRadius: "999px",
  background: "#111827",
  opacity: 0.6
};

const historyCardStyle = {
  padding: "14px",
  borderRadius: "16px",
  background: "rgba(255, 255, 255, 0.72)",
  border: "1px solid rgba(17, 24, 39, 0.08)"
};

const historyItemStyle = {
  padding: "8px 0",
  color: "#4b5563",
  borderBottom: "1px solid rgba(17, 24, 39, 0.06)"
};

const centerStageStyle = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  position: "relative"
};

const topBarStyle = {
  display: "flex",
  justifyContent: "center",
  padding: "24px 32px 0"
};

const topPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 16px",
  borderRadius: "999px",
  background: "rgba(255, 255, 255, 0.78)",
  border: "1px solid rgba(17, 24, 39, 0.08)",
  color: "#2563eb",
  fontSize: "0.95rem",
  boxShadow: "0 10px 30px rgba(17, 24, 39, 0.06)"
};

const heroStageStyle = (hasStartedRun) => ({
  flex: 1,
  display: "flex",
  alignItems: hasStartedRun ? "flex-start" : "center",
  justifyContent: "center",
  padding: hasStartedRun ? "18px 32px 28px" : "26px 32px 32px"
});

const heroColumnStyle = (hasStartedRun) => ({
  width: hasStartedRun ? "min(1040px, 100%)" : "min(780px, 100%)",
  display: "grid",
  gap: hasStartedRun ? "16px" : "20px",
  justifyItems: hasStartedRun ? "stretch" : "center"
});

const heroIntroStyle = (hasStartedRun) => ({
  textAlign: hasStartedRun ? "left" : "center"
});

const heroTitleStyle = (hasStartedRun) => ({
  margin: 0,
  fontSize: hasStartedRun ? "2.2rem" : "clamp(3.6rem, 10vw, 5.2rem)",
  lineHeight: hasStartedRun ? 1 : 0.95,
  letterSpacing: hasStartedRun ? "-0.05em" : "-0.08em",
  fontWeight: 800
});

const heroCopyStyle = (hasStartedRun) => ({
  margin: hasStartedRun ? "6px 0 0" : "0",
  color: "#6b7280",
  maxWidth: hasStartedRun ? "72ch" : "44ch",
  textAlign: hasStartedRun ? "left" : "center",
  lineHeight: hasStartedRun ? 1.45 : 1.6
});

const bottomPanelGridStyle = (hasStartedRun) => ({
  width: "min(1040px, 100%)",
  display: "grid",
  gridTemplateColumns: hasStartedRun
    ? "minmax(0, 1.35fr) minmax(0, 0.65fr)"
    : "minmax(0, 1.1fr) minmax(0, 0.9fr)",
  gap: "16px",
  alignItems: "start"
});

const railStyle = {
  borderLeft: "1px solid rgba(17, 24, 39, 0.08)",
  padding: "20px 18px",
  background: "rgba(248, 248, 247, 0.76)",
  backdropFilter: "blur(16px)",
  display: "grid",
  gap: "14px",
  alignContent: "start",
  overflow: "auto"
};

const railCardStyle = {
  padding: "18px",
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.84)",
  border: "1px solid rgba(17, 24, 39, 0.08)"
};

const statusCardStyle = {
  padding: "18px",
  borderRadius: "20px",
  background: "rgba(255, 255, 255, 0.8)",
  border: "1px solid rgba(17, 24, 39, 0.08)",
  boxShadow: "0 16px 40px rgba(17, 24, 39, 0.06)"
};

const compactMetricCardStyle = {
  padding: "12px",
  borderRadius: "14px",
  background: "rgba(243, 244, 246, 0.9)"
};

const conversationCardStyle = {
  width: "100%",
  padding: "16px",
  borderRadius: "20px",
  background: "rgba(255, 255, 255, 0.82)",
  border: "1px solid rgba(17, 24, 39, 0.08)",
  boxShadow: "0 16px 40px rgba(17, 24, 39, 0.05)"
};

const conversationHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "12px"
};

const conversationListStyle = {
  display: "grid",
  gap: "10px",
  maxHeight: "340px",
  overflowY: "auto"
};

const messageRowStyle = (role) => ({
  display: "flex",
  justifyContent: role === "user" ? "flex-end" : "flex-start"
});

const messageBubbleStyle = (role) => ({
  width: "min(100%, 760px)",
  padding: "12px 14px",
  borderRadius: role === "user" ? "16px 16px 6px 16px" : "16px 16px 16px 6px",
  background: role === "user" ? "#111827" : "rgba(243, 244, 246, 0.92)",
  color: role === "user" ? "#f9fafb" : "#111827",
  border: role === "user" ? "none" : "1px solid rgba(17, 24, 39, 0.08)"
});

const messageMetaStyle = (role) => ({
  margin: 0,
  fontSize: "0.74rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: role === "user" ? "rgba(249, 250, 251, 0.72)" : "#6b7280"
});

const messageTextStyle = {
  margin: "6px 0 0",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word"
};

const statusMetaStyle = (hasStartedRun) => ({
  margin: "10px 0 0",
  fontFamily: "\"IBM Plex Mono\", \"SFMono-Regular\", monospace",
  fontSize: hasStartedRun ? "0.78rem" : "0.82rem",
  color: "#6b7280",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  lineHeight: hasStartedRun ? 1.45 : 1.6
});

const MODE_NAV_ITEMS = [
  { label: "Websites", mode: "website" },
  { label: "Docs", mode: "docx" },
  { label: "Slides", mode: "slide" },
  { label: "Sheets", mode: "sheet" },
  { label: "Deep Research", mode: "deep_research" }
];

export default function App() {
  const socketRef = useRef(null);
  const activeRunIdRef = useRef("");
  const announcedRunKeysRef = useRef(new Set());
  const [runId, setRunId] = useState("");
  const [selectedMode, setSelectedMode] = useState("website");
  const [runStatus, setRunStatus] = useState("idle");
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const [events, setEvents] = useState([]);
  const [runRecord, setRunRecord] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const [conversation, setConversation] = useState([]);
  const [composerResetKey, setComposerResetKey] = useState("idle");

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

  function handleResetChat() {
    closeActiveSocket(socketRef);
    activeRunIdRef.current = "";
    announcedRunKeysRef.current = new Set();
    setRunId("");
    setRunRecord(null);
    setRunStatus("idle");
    setSocketStatus("disconnected");
    setEvents([]);
    setErrorMessage("");
    setConversation([]);
    setComposerResetKey(`reset-${Date.now()}`);
  }

  async function handleRunSubmit(payload) {
    const nextConversationMessage = createConversationEntry({
      role: "user",
      text: payload.userRequest,
      mode: selectedMode
    });
    const requestPayload = buildSubmissionPayload({
      payload,
      previousRunId: runId || runRecord?.runId || "",
      previousResult: buildResult({
        runId,
        runStatus,
        runRecord,
        errorMessage
      })
    });

    setConversation((current) => current.concat(nextConversationMessage));
    setComposerResetKey(`submit-${Date.now()}`);
    closeActiveSocket(socketRef);

    activeRunIdRef.current = "";
    setRunId("");
    setRunRecord(null);
    setEvents([]);
    setErrorMessage("");
    setSocketStatus("connecting");
    setRunStatus("starting");

    try {
      const response = await startRun(requestPayload);
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
        input: requestPayload,
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
      setConversation((current) =>
        current.concat(
          createConversationEntry({
            role: "assistant",
            text: `The run could not start.\n\n${message}`,
            mode: selectedMode,
            tone: "error"
          })
        )
      );
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

      appendRunSummaryToConversation(nextRunRecord);
    } catch (error) {
      if (activeRunIdRef.current !== currentRunId) {
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Failed to fetch final run details."
      );
    }
  }

  function appendRunSummaryToConversation(nextRunRecord) {
    const summaryKey = `${nextRunRecord?.runId || "unknown"}:${nextRunRecord?.status || "unknown"}`;

    if (announcedRunKeysRef.current.has(summaryKey)) {
      return;
    }

    announcedRunKeysRef.current.add(summaryKey);

    const nextResult = buildResult({
      runId: nextRunRecord?.runId ?? "",
      runStatus: nextRunRecord?.status ?? "completed",
      runRecord: nextRunRecord,
      errorMessage: nextRunRecord?.error?.message ?? ""
    });
    const nextDeliverables = getDeliverables(nextResult);
    const nextPreviewFiles = getPreviewFiles(nextResult, nextDeliverables);

    setConversation((current) =>
      current.concat(
        createConversationEntry({
          role: "assistant",
          text: buildAssistantRunSummary({
            runRecord: nextRunRecord,
            result: nextResult,
            deliverables: nextDeliverables,
            previewFiles: nextPreviewFiles
          }),
          mode: nextResult?.mode ?? selectedMode,
          tone: nextRunRecord?.status === "failed" ? "error" : "default"
        })
      )
    );
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
  const hasStartedRun =
    runId !== "" || runRecord !== null || events.length > 0 || conversation.length > 0;
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
      <style>{`
        .app-frame {
          display: grid;
          grid-template-columns: 240px minmax(0, 1fr) 360px;
          min-height: 100vh;
        }
        @media (max-width: 1180px) {
          .app-frame {
            grid-template-columns: 220px minmax(0, 1fr);
          }
          .app-rail {
            grid-column: 1 / -1;
            border-left: none;
            border-top: 1px solid rgba(17, 24, 39, 0.08);
          }
        }
        @media (max-width: 820px) {
          .app-frame {
            grid-template-columns: 1fr;
          }
          .app-sidebar {
            border-right: none;
            border-bottom: 1px solid rgba(17, 24, 39, 0.08);
          }
          .hero-panels {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <section className="app-frame" style={frameStyle}>
        <aside className="app-sidebar" style={sidebarStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={brandMarkStyle}>S</div>
            <div>
              <strong style={{ display: "block" }}>SMMA</strong>
              <span style={{ color: "#6b7280", fontSize: "0.88rem" }}>Browser workspace</span>
            </div>
          </div>

          <button type="button" style={newChatButtonStyle} onClick={handleResetChat}>
            <span>New Chat</span>
            <span style={{ color: "#9ca3af", fontSize: "0.86rem" }}>Ctrl K</span>
          </button>

          <div style={navGroupStyle}>
            {MODE_NAV_ITEMS.map((item) => (
              <button
                type="button"
                key={item.mode}
                onClick={() => setSelectedMode(item.mode)}
                style={{
                  ...navItemStyle,
                  width: "100%",
                  border:
                    item.mode === selectedMode
                      ? "1px solid rgba(17, 24, 39, 0.08)"
                      : "1px solid transparent",
                  background: item.mode === selectedMode ? "#ffffff" : "transparent",
                  fontWeight: item.mode === selectedMode ? 600 : 500,
                  cursor: "pointer",
                  font: "inherit"
                }}
              >
                <span style={navBulletStyle} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <div style={historyCardStyle}>
            <p style={{ margin: "0 0 10px", fontWeight: 700 }}>Recent Runs</p>
            {runId ? (
              <div style={{ ...historyItemStyle, borderBottom: "none" }}>
                <div style={{ fontWeight: 600, color: "#111827" }}>{runId}</div>
                <div style={{ fontSize: "0.88rem" }}>{runStatus}</div>
              </div>
            ) : (
              ["Codex panel", "Robot SW portfolio", "README architecture"].map((item, index, list) => (
                <div
                  key={item}
                  style={{
                    ...historyItemStyle,
                    borderBottom:
                      index === list.length - 1 ? "none" : "1px solid rgba(17, 24, 39, 0.06)"
                  }}
                >
                  {item}
                </div>
              ))
            )}
          </div>
        </aside>

        <section style={centerStageStyle}>
          <div style={topBarStyle}>
            <div style={topPillStyle}>
              {formatModeLabel(selectedMode)} Mode
            </div>
          </div>

          <div style={heroStageStyle(hasStartedRun)}>
            <div style={heroColumnStyle(hasStartedRun)}>
              <div style={heroIntroStyle(hasStartedRun)}>
                <h1 style={heroTitleStyle(hasStartedRun)}>SMMA</h1>
                <p style={heroCopyStyle(hasStartedRun)}>
                  {hasStartedRun
                    ? "Track progress, revise requests, inspect revisions, and verify generated files from one workspace."
                    : "Run website tasks from a chat-first shell, then inspect revision traces, validator outcomes, and generated files without leaving the page."}
                </p>
              </div>

              {conversation.length > 0 ? (
                <section style={conversationCardStyle}>
                  <div style={conversationHeaderStyle}>
                    <div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.8rem",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "#6b7280"
                        }}
                      >
                        Conversation
                      </p>
                      <p style={{ margin: "6px 0 0", color: "#6b7280", lineHeight: 1.45 }}>
                        Review the latest result, then send a follow-up instruction to revise details.
                      </p>
                    </div>
                    <div style={{ ...compactMetricCardStyle, padding: "10px 12px" }}>
                      <strong>{conversation.length}</strong> messages
                    </div>
                  </div>
                  <div style={conversationListStyle}>
                    {conversation.map((entry) => (
                      <div key={entry.id} style={messageRowStyle(entry.role)}>
                        <div style={messageBubbleStyle(entry.role)}>
                          <p style={messageMetaStyle(entry.role)}>
                            {entry.role === "user" ? "You" : "SMMA"} · {entry.modeLabel}
                          </p>
                          <p style={messageTextStyle}>{entry.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <div style={{ width: hasStartedRun ? "100%" : "min(770px, 100%)" }}>
                <RunForm
                  onSubmit={handleRunSubmit}
                  isRunning={isRunning}
                  runId={runId}
                  status={runStatus}
                  error={errorMessage}
                  selectedMode={selectedMode}
                  placeholder={
                    conversation.length > 0
                      ? "Describe what to revise next. Enter to send, Shift+Enter for a new line."
                      : "Describe what you want to build. Enter to send, Shift+Enter for a new line."
                  }
                  resetKey={composerResetKey}
                />
              </div>

              <div className="hero-panels" style={bottomPanelGridStyle(hasStartedRun)}>
                <section
                  style={{
                    ...statusCardStyle,
                    padding: hasStartedRun ? "16px" : statusCardStyle.padding,
                    borderColor: statusBanner.borderColor,
                    background: statusBanner.background
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.8rem",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#6b7280"
                    }}
                  >
                    Live Status
                  </p>
                  <h2 style={{ margin: "8px 0 0", fontSize: hasStartedRun ? "1.15rem" : "1.35rem" }}>
                    {statusBanner.title}
                  </h2>
                  <p style={{ margin: "8px 0 0", lineHeight: hasStartedRun ? 1.45 : 1.6 }}>
                    {statusBanner.message}
                  </p>
                  <p style={statusMetaStyle(hasStartedRun)}>{statusBanner.meta}</p>
                </section>

                <section style={{ ...railCardStyle, padding: hasStartedRun ? "16px" : railCardStyle.padding }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.8rem",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#6b7280"
                    }}
                  >
                    Session Snapshot
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "10px",
                      marginTop: hasStartedRun ? "12px" : "14px"
                    }}
                  >
                    {[
                      ["Run", runId || "none"],
                      ["Mode", normalizedResult?.mode || selectedMode],
                      ["Socket", socketStatus],
                      ["Events", String(events.length)]
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        style={compactMetricCardStyle}
                      >
                        <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>{label}</div>
                        <div
                          style={{
                            marginTop: "6px",
                            fontWeight: 700,
                            wordBreak: "break-word"
                          }}
                        >
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {hasStartedRun ? (
                <div className="hero-panels" style={bottomPanelGridStyle(true)}>
                  <AgentTimeline runId={runId} status={runStatus} events={events} />
                  <LogPanel runId={runId} status={runStatus} events={events} />
                </div>
              ) : null}

              {previewFiles.length > 0 ? (
                <div style={{ width: "min(1040px, 100%)" }}>
                  <FilePreview
                    runId={runId}
                    status={runStatus}
                    deliverables={deliverables}
                    files={previewFiles}
                    entrypoints={
                      normalizedResult?.artifact?.entrypoints ??
                      normalizedResult?.pipelineResult?.entrypoints ??
                      []
                    }
                    revisionTrace={
                      runRecord?.savedSteps?.revision_trace ??
                      normalizedResult?.revision ??
                      null
                    }
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <aside className="app-rail" style={railStyle}>
          <section style={railCardStyle}>
            <p
              style={{
                margin: 0,
                fontSize: "0.8rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#6b7280"
              }}
            >
              Final Output
            </p>
            <div style={{ marginTop: "12px" }}>
              <ResultPanel runId={runId} status={runStatus} result={normalizedResult} />
            </div>
          </section>

          <section style={railCardStyle}>
            <p
              style={{
                margin: 0,
                fontSize: "0.8rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#6b7280"
              }}
            >
              Revision Trace
            </p>
            <div style={{ marginTop: "12px" }}>
              <RevisionTracePanel revisionTrace={normalizedResult?.revision ?? null} />
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function formatModeLabel(mode) {
  if (mode === "docx") {
    return "Docs";
  }

  if (mode === "deep_research") {
    return "Deep Research";
  }

  if (!mode) {
    return "Website";
  }

  return mode.charAt(0).toUpperCase() + mode.slice(1);
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
    revision: runRecord?.revision ?? null,
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

function createConversationEntry({ role, text, mode, tone = "default" }) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    tone,
    modeLabel: formatModeLabel(mode),
    createdAt: new Date().toISOString()
  };
}

function buildSubmissionPayload({ payload, previousRunId, previousResult }) {
  if (!previousResult) {
    return payload;
  }

  const changedFiles = getChangedFileSummaries(previousResult?.revision);
  const previousArtifact = buildPreviousArtifact(previousResult);

  return {
    ...payload,
    previousRunId: previousRunId || previousResult?.runId || "",
    previousRequest: previousResult?.input?.userRequest || "",
    previousArtifact,
    userRequest: [
      payload.userRequest,
      changedFiles.length > 0
        ? `Preserve everything else. Previously changed files include: ${changedFiles.join("; ")}`
        : "Preserve the existing implementation and only modify the requested parts."
    ].join("\n\n")
  };
}

function buildPreviousArtifact(previousResult) {
  if (previousResult?.artifact && Array.isArray(previousResult.artifact.files)) {
    return previousResult.artifact;
  }

  if (previousResult?.pipelineResult && Array.isArray(previousResult.pipelineResult.files)) {
    return previousResult.pipelineResult;
  }

  const deliverables = getDeliverables(previousResult);
  const previewFiles = getPreviewFiles(previousResult, deliverables);

  if (previewFiles.length === 0) {
    return null;
  }

  return {
    mode: previousResult?.mode ?? "website",
    output_type: previousResult?.artifact?.output_type ?? previousResult?.pipelineResult?.output_type ?? null,
    entrypoints:
      previousResult?.artifact?.entrypoints ??
      previousResult?.pipelineResult?.entrypoints ??
      null,
    files: previewFiles,
    build_notes:
      previousResult?.artifact?.build_notes ??
      previousResult?.pipelineResult?.build_notes ??
      [],
    known_limitations:
      previousResult?.artifact?.known_limitations ??
      previousResult?.pipelineResult?.known_limitations ??
      []
  };
}

function getChangedFileSummaries(revisionTrace) {
  if (Array.isArray(revisionTrace?.changed_artifacts)) {
    return revisionTrace.changed_artifacts
      .filter((entry) => entry?.artifact_type === "file" && entry?.identifier)
      .map((entry) =>
        entry?.summary
          ? `${entry.identifier} (${entry.change_type || "modified"}: ${entry.summary})`
          : `${entry.identifier} (${entry.change_type || "modified"})`
      );
  }

  if (Array.isArray(revisionTrace?.changedFiles)) {
    return revisionTrace
      .changedFiles.filter((entry) => entry?.identifier)
      .map((entry) =>
        entry?.summary
          ? `${entry.identifier} (${entry.change_type || "modified"}: ${entry.summary})`
          : `${entry.identifier} (${entry.change_type || "modified"})`
      );
  }

  return [];
}

function buildAssistantRunSummary({ runRecord, result, deliverables, previewFiles }) {
  if (runRecord?.status === "failed") {
    return [
      "The run failed.",
      runRecord?.error?.message || result?.error?.message || "Check the timeline and logs for the failing step.",
      "You can send a follow-up instruction after adjusting the request."
    ].join("\n\n");
  }

  const revisionState = summarizeRevisionState(result?.revision);
  const deliverableLabel =
    deliverables.length > 0
      ? `Deliverables: ${deliverables.map((item) => item?.name).filter(Boolean).join(", ")}.`
      : "No deliverables were packaged.";
  const fileLabel =
    previewFiles.length > 0
      ? `Preview files: ${previewFiles.map((file) => file.path).slice(0, 6).join(", ")}.`
      : "No previewable files were attached.";

  return [
    "The result is ready.",
    deliverableLabel,
    fileLabel,
    revisionState,
    "Send another instruction to refine copy, spacing, layout, colors, or file details."
  ].join("\n\n");
}

function summarizeRevisionState(revision) {
  if (!revision || revision.occurred === false) {
    return "No revision pass was recorded.";
  }

  const changedFiles = getChangedFileSummaries(revision);

  if (changedFiles.length === 0) {
    return "A revision signal exists, but changed files were not included in the summary.";
  }

  return `Revision changes: ${changedFiles.slice(0, 4).join("; ")}${changedFiles.length > 4 ? "..." : ""}`;
}
