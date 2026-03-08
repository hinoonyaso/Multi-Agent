import { randomUUID } from "node:crypto";
import { Router } from "express";
import { runPipeline } from "../core/orchestrator.js";
import { loadRunState } from "../core/stateStore.js";
import { broadcastRunEvent } from "./websocket.js";

export function createRoutes(options = {}) {
  const router = Router();
  const runs = options.runs ?? new Map();
  const executeRun = options.runPipeline ?? runPipeline;
  const broadcast = options.broadcastRunEvent ?? broadcastRunEvent;

  router.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  router.post("/run", (request, response) => {
    const { userRequest, modeHint = null } = request.body ?? {};

    if (typeof userRequest !== "string" || userRequest.trim() === "") {
      response.status(400).json({
        error: "`userRequest` must be a non-empty string."
      });
      return;
    }

    if (modeHint !== null && typeof modeHint !== "string") {
      response.status(400).json({
        error: "`modeHint` must be a string when provided."
      });
      return;
    }

    const runId = randomUUID();
    const runRecord = {
      runId,
      accepted: true,
      status: "running",
      message: "Run started",
      acceptedAt: new Date().toISOString(),
      input: {
        userRequest: userRequest.trim(),
        modeHint: modeHint?.trim() || null
      },
      pipelineRunId: null,
      lastEvent: null,
      result: null,
      error: null
    };

    runs.set(runId, runRecord);

    response.status(202).json({
      accepted: true,
      runId,
      message: "Run started"
    });

    const onEvent = (event) => {
      const websocketEvent = normalizeWebsocketEvent(event, runRecord);

      runRecord.pipelineRunId = event?.runId ?? runRecord.pipelineRunId;
      runRecord.lastEvent = websocketEvent;
      runRecord.updatedAt = websocketEvent.timestamp;
      runRecord.status = deriveRunStatus(websocketEvent, runRecord.status);

      broadcast(runId, websocketEvent);
    };

    void executeRun({
      userRequest: runRecord.input.userRequest,
      modeHint: runRecord.input.modeHint,
      onEvent
    })
      .then((result) => {
        runRecord.result = result;
        runRecord.pipelineRunId = result?.state?.runId ?? runRecord.pipelineRunId;
        runRecord.completedAt = new Date().toISOString();

        if (runRecord.status !== "failed") {
          runRecord.status = "completed";
        }
      })
      .catch((error) => {
        runRecord.status = "failed";
        runRecord.completedAt = new Date().toISOString();
        runRecord.error = {
          message: error instanceof Error ? error.message : String(error)
        };

        if (runRecord.lastEvent?.eventType !== "run_failed") {
          const failedEvent = normalizeWebsocketEvent(
            {
              type: "run_failed",
              step: "run",
              summary: runRecord.error.message
            },
            runRecord
          );

          runRecord.lastEvent = failedEvent;
          runRecord.updatedAt = failedEvent.timestamp;
          broadcast(runId, failedEvent);
        }
      });
  });

  router.get("/run/:runId", async (request, response) => {
    try {
      const requestedRunId = request.params.runId;
      const runRecord = runs.get(requestedRunId) ?? null;
      const persistedRunId = resolvePersistedRunId(runRecord, requestedRunId);
      const persistedState = await loadPersistedState(persistedRunId);

      if (!runRecord && !persistedState) {
        response.status(404).json({ error: "Run not found." });
        return;
      }

      response.json(
        buildRunSummary({
          requestedRunId,
          runRecord,
          persistedState
        })
      );
    } catch (error) {
      response.status(500).json({
        error: error instanceof Error ? error.message : "Failed to load run."
      });
    }
  });

  return router;
}

function normalizeWebsocketEvent(event, runRecord) {
  const eventType = typeof event?.type === "string" ? event.type : "run_started";

  return {
    ...event,
    type: mapEventTypeForWebsocket(eventType),
    eventType,
    pipelineRunId: event?.runId ?? runRecord.pipelineRunId ?? null,
    timestamp: event?.timestamp ?? new Date().toISOString()
  };
}

function mapEventTypeForWebsocket(eventType) {
  if (eventType === "run_started") {
    return "run_started";
  }

  if (eventType === "run_completed") {
    return "run_completed";
  }

  if (eventType === "run_failed") {
    return "step_failed";
  }

  if (eventType.endsWith("_completed")) {
    return "step_completed";
  }

  if (eventType.endsWith("_failed")) {
    return "step_failed";
  }

  return "step_started";
}

function deriveRunStatus(event, currentStatus) {
  if (event?.eventType === "run_completed") {
    return "completed";
  }

  if (event?.eventType === "run_failed") {
    return "failed";
  }

  return currentStatus;
}

function resolvePersistedRunId(runRecord, requestedRunId) {
  if (typeof runRecord?.pipelineRunId === "string" && runRecord.pipelineRunId.trim() !== "") {
    return runRecord.pipelineRunId;
  }

  if (typeof runRecord?.result?.state?.runId === "string" && runRecord.result.state.runId.trim() !== "") {
    return runRecord.result.state.runId;
  }

  return requestedRunId;
}

async function loadPersistedState(runId) {
  if (typeof runId !== "string" || runId.trim() === "") {
    return null;
  }

  try {
    return await loadRunState(runId);
  } catch (error) {
    if (
      error?.code === "ENOENT" ||
      error instanceof TypeError ||
      error instanceof SyntaxError ||
      error?.message?.includes("run id must contain only")
    ) {
      return null;
    }

    throw error;
  }
}

function buildRunSummary({ requestedRunId, runRecord, persistedState }) {
  const savedSteps = getSavedStepOutputs(persistedState);
  const finalResult = runRecord?.result ?? persistedState?.final ?? null;
  const pipelineRunId =
    runRecord?.pipelineRunId ??
    runRecord?.result?.state?.runId ??
    persistedState?.runId ??
    null;

  return compactObject({
    runId: requestedRunId,
    status: deriveSummaryStatus({ runRecord, persistedState, finalResult }),
    pipelineRunId,
    input: runRecord?.input ?? persistedState?.input ?? null,
    timestamps: compactObject({
      acceptedAt: runRecord?.acceptedAt ?? null,
      createdAt: persistedState?.createdAt ?? null,
      updatedAt: runRecord?.updatedAt ?? persistedState?.updatedAt ?? null,
      completedAt: runRecord?.completedAt ?? null,
      finalizedAt: persistedState?.finalizedAt ?? null
    }),
    lastEvent: runRecord?.lastEvent ?? null,
    revision: summarizeRevisionTrace(
      persistedState?.steps?.revision_trace,
      persistedState?.summaries?.revision_trace
    ),
    savedSteps,
    result: finalResult,
    error: runRecord?.error ?? null
  });
}

function deriveSummaryStatus({ runRecord, persistedState, finalResult }) {
  if (typeof runRecord?.status === "string" && runRecord.status.trim() !== "") {
    return runRecord.status;
  }

  if (runRecord?.error) {
    return "failed";
  }

  if (finalResult || persistedState?.finalizedAt) {
    return "completed";
  }

  if (persistedState) {
    return "running";
  }

  return "unknown";
}

function getSavedStepOutputs(persistedState) {
  if (!persistedState) {
    return undefined;
  }

  return compactObject({
    router: persistedState.router ?? null,
    planner: persistedState.planner ?? null,
    ...persistedState.steps,
    validation: persistedState.validation ?? null
  });
}

function summarizeRevisionTrace(revisionTrace, persistedSummary) {
  if (!revisionTrace && !persistedSummary) {
    return {
      occurred: false
    };
  }

  const changedArtifacts = Array.isArray(revisionTrace?.changed_artifacts)
    ? revisionTrace.changed_artifacts
    : [];
  const criticIssues = Array.isArray(revisionTrace?.critic_issues)
    ? revisionTrace.critic_issues
    : [];
  const changedFiles = changedArtifacts.filter(
    (entry) =>
      entry &&
      entry.artifact_type === "file" &&
      entry.change_type !== "unchanged_checked"
  );

  return compactObject({
    occurred: true,
    traceId:
      readNestedString(revisionTrace, ["metadata", "trace_id"]) ??
      persistedSummary?.trace_id ??
      null,
    subjectMode:
      readNestedString(revisionTrace, ["metadata", "subject_mode"]) ??
      persistedSummary?.subject_mode ??
      null,
    sourceStep:
      readNestedString(revisionTrace, ["source_step", "step_name"]) ??
      persistedSummary?.source_step ??
      null,
    criticIssueCount:
      criticIssues.length > 0
        ? criticIssues.length
        : toSafeInteger(persistedSummary?.issue_count),
    changedFileCount:
      changedFiles.length > 0
        ? changedFiles.length
        : toSafeInteger(persistedSummary?.changed_artifact_count),
    improvementSummary:
      readNestedString(revisionTrace, ["improvement_summary", "net_effect"]) ??
      persistedSummary?.net_effect ??
      null,
    validatorOutcome: compactObject({
      status:
        readNestedString(revisionTrace, ["validation_outcome", "status"]) ??
        persistedSummary?.validation_status ??
        null,
      summary: readNestedString(revisionTrace, ["validation_outcome", "summary"])
    })
  });
}

function readNestedString(value, pathParts) {
  let current = value;

  for (const part of pathParts) {
    if (!current || typeof current !== "object") {
      return null;
    }

    current = current[part];
  }

  return typeof current === "string" && current.trim() ? current.trim() : null;
}

function toSafeInteger(value) {
  return Number.isInteger(value) ? value : undefined;
}

function compactObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const entries = Object.entries(value).filter(([, entryValue]) => {
    if (entryValue === null || entryValue === undefined) {
      return false;
    }

    if (!Array.isArray(entryValue) && typeof entryValue === "object") {
      return Object.keys(entryValue).length > 0;
    }

    return true;
  });

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}
