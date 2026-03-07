import { randomUUID } from "node:crypto";
import { Router } from "express";
import { runPipeline } from "../core/orchestrator.js";
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

  router.get("/run/:runId", (request, response) => {
    const runRecord = runs.get(request.params.runId);

    if (!runRecord) {
      response.status(404).json({ error: "Run not found." });
      return;
    }

    response.json(runRecord);
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
