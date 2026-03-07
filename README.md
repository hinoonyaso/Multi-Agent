# Single-Model Multi-Agent Skeleton

Initial project skeleton for a Node.js ESM orchestration system that runs
Codex CLI subprocesses against `gpt-5.4`.

## Supported Modes

- `website`
- `docx`
- `slide`
- `sheet`
- `deep_research`

## Layout

- `src/core`: orchestration runtime placeholders
- `src/agents`: future agent definitions
- `src/modes`: mode-specific pipeline entry points
- `src/contracts`: output contract placeholders
- `src/prompts`: core, role, and mode prompt files
- `tests`: test placeholders
- `runs`: local run artifacts
- `logs`: local execution logs
- `docs`: project notes

## Status

Scaffold only. Full orchestration logic is intentionally not implemented yet.

## Website Mode MVP Completion Criteria

Before moving on to `docx` mode, `website` mode should satisfy all of the following:

- The end-to-end pipeline runs from routing through finalization without manual intervention on representative website requests.
- The revision loop executes when the UI critic requests revision and produces a traceable revised coder pass.
- Invalid JSON outputs are recoverable through bounded repair retries rather than terminating the run immediately.
- Validator checks catch structural website issues such as missing files, missing entrypoints, duplicate paths, or contract-breaking output.
- Website smoke test cases run as a small repeatable regression set.
- Major pipeline artifacts are persisted in run state so failed or degraded runs can be debugged without rerunning blindly.
