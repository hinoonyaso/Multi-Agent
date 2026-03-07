const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export async function getServerStatus() {
  return {
    status: "placeholder",
    baseUrl: API_BASE_URL,
    note: "Replace with a real GET /api/health request when the server contract is finalized."
  };
}

export async function createRun(payload) {
  return {
    status: "placeholder",
    payload,
    note: "Replace with a real POST /api/runs request."
  };
}

export async function getRun(runId) {
  return {
    status: "placeholder",
    runId,
    note: "Replace with a real GET /api/runs/:runId request."
  };
}
