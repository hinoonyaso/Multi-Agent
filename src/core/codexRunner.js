export function createCodexRunner() {
  return {
    cli: "codex",
    model: "gpt-5.4",
    runtime: "local_subprocess",
    async run(request) {
      return {
        status: "not_implemented",
        request,
        note: "Codex CLI execution wiring will be added later."
      };
    }
  };
}
