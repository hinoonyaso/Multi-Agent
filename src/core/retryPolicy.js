export function createRetryPolicy() {
  return {
    maxAttempts: 3,
    backoffMs: 500,
    note: "Placeholder retry policy for Codex CLI subprocess calls."
  };
}
