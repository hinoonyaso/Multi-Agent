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
