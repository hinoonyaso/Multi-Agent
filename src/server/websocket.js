import { WebSocketServer, WebSocket } from "ws";

const RUN_EVENT_TYPES = new Set([
  "run_started",
  "step_started",
  "step_completed",
  "step_failed",
  "run_completed"
]);

let websocketServer = null;
const runSubscriptions = new Map();
const clientSubscriptions = new WeakMap();

export function initWebSocketServer(server) {
  if (websocketServer) {
    return websocketServer;
  }

  websocketServer = new WebSocketServer({
    server,
    path: "/ws"
  });

  websocketServer.on("connection", (socket) => {
    clientSubscriptions.set(socket, new Set());

    socket.on("message", (rawMessage) => {
      handleClientMessage(socket, rawMessage);
    });

    socket.on("close", () => {
      removeClientFromAllSubscriptions(socket);
    });

    socket.on("error", () => {
      removeClientFromAllSubscriptions(socket);
    });

    socket.send(
      JSON.stringify({
        type: "connected",
        message: "Send {\"type\":\"subscribe\",\"runId\":\"...\"} to receive run events."
      })
    );
  });

  return websocketServer;
}

export function broadcastRunEvent(runId, event) {
  return sendRunEventToClients(runId, event);
}

export function sendRunEventToClients(runId, event) {
  if (!runId || typeof runId !== "string") {
    return 0;
  }

  const subscribers = runSubscriptions.get(runId);

  if (!subscribers || subscribers.size === 0) {
    return 0;
  }

  const payload = JSON.stringify({
    runId,
    event: normalizeRunEvent(event)
  });

  let delivered = 0;

  for (const socket of subscribers) {
    if (socket.readyState !== WebSocket.OPEN) {
      continue;
    }

    socket.send(payload);
    delivered += 1;
  }

  return delivered;
}

export const registerWebsocket = initWebSocketServer;

function handleClientMessage(socket, rawMessage) {
  let message;

  try {
    message = JSON.parse(rawMessage.toString());
  } catch {
    socket.send(JSON.stringify({ type: "error", message: "Invalid JSON message." }));
    return;
  }

  if (message?.type === "subscribe" && typeof message.runId === "string") {
    subscribeClient(socket, message.runId);
    socket.send(JSON.stringify({ type: "subscribed", runId: message.runId }));
    return;
  }

  if (message?.type === "unsubscribe" && typeof message.runId === "string") {
    unsubscribeClient(socket, message.runId);
    socket.send(JSON.stringify({ type: "unsubscribed", runId: message.runId }));
    return;
  }

  socket.send(JSON.stringify({ type: "error", message: "Unsupported websocket message." }));
}

function subscribeClient(socket, runId) {
  const normalizedRunId = runId.trim();

  if (!normalizedRunId) {
    return;
  }

  if (!runSubscriptions.has(normalizedRunId)) {
    runSubscriptions.set(normalizedRunId, new Set());
  }

  runSubscriptions.get(normalizedRunId).add(socket);
  clientSubscriptions.get(socket)?.add(normalizedRunId);
}

function unsubscribeClient(socket, runId) {
  const subscribers = runSubscriptions.get(runId);
  subscribers?.delete(socket);

  if (subscribers?.size === 0) {
    runSubscriptions.delete(runId);
  }

  clientSubscriptions.get(socket)?.delete(runId);
}

function removeClientFromAllSubscriptions(socket) {
  const subscriptions = clientSubscriptions.get(socket);

  if (!subscriptions) {
    return;
  }

  for (const runId of subscriptions) {
    unsubscribeClient(socket, runId);
  }

  clientSubscriptions.delete(socket);
}

function normalizeRunEvent(event) {
  const type = typeof event?.type === "string" ? event.type : "run_started";

  return {
    ...event,
    type: RUN_EVENT_TYPES.has(type) ? type : "run_started",
    timestamp: event?.timestamp ?? new Date().toISOString()
  };
}
