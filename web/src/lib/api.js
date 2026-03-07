const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export async function startRun(payload) {
  return requestJson(`${API_BASE_URL}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function getRun(runId) {
  return requestJson(`${API_BASE_URL}/run/${encodeURIComponent(runId)}`);
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || "API request failed.");
  }

  return data;
}
