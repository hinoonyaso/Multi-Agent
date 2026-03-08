# Multi-Agent Orchestration System

Node.js ESM orchestration system that runs Codex CLI subprocesses against `gpt-5.4`.
Pipeline stages use agent definitions from the registry; graph-based execution supports declarative flows, retries, and conditional edges.

## Supported Modes

- `website` (production-ready)
- `docx`
- `slide`
- `sheet`
- `deep_research`

## Layout

```
src/
  core/           # orchestration runtime, graph executor, state store, validator
  agents/         # flat agent definitions (websiteArchitect, websiteCoder, websiteUiCritic, websiteValidator)
  modes/
    website/
      stages/     # website-specific stage runners (architect, coder, uiCritic, revision, validator)
      renderer.js # Playwright render diagnostics (static HTTP + Vite dev server)
      graph.js    # declarative WEBSITE_MODE_GRAPH
      lightweightCritic.js
  contracts/      # output contract definitions
  prompts/        # core, role, and mode prompt files
tests/            # smoke and unit tests
runs/             # local run artifacts
logs/             # local execution logs
docs/             # project notes
```

## Status

Website mode production-ready; other modes in development.

## Current Implemented Mode: Website

The website mode runs a full graph-based execution flow:

```
architect → coder_first_pass → ui_critic → revision → validator
```

- **First-pass generation** is reviewed by a UI critic before revision
- **Render diagnostics** capture a Playwright screenshot, console errors, and mobile viewport overflow before the critic runs — both static HTML and React/Vite apps are supported
- **Follow-up requests** use a lightweight critic path that skips the full UI critic for faster iteration
- **Revision loop** executes when the critic recommends changes and produces a traceable coder revision pass
- **Contract repair** retries the coder pass when the validator finds contract violations
- **`GET /run/:runId`** returns stage-level status (`stages`, `currentStage`, `renderDiagnostics`, `finalRecommendation`) in addition to the full saved steps

## Implemented Features

- **Graph-based declarative pipeline** (`graphExecutor`): nodes with `contextKey`/`contextMerge`, pluggable `edgeConditionEvaluators`, `skipConditionEvaluators`, and optional `resolveCondition`/`mergeNodeResult`/`resolveSkipHandler` callbacks for mode-agnostic extension
- **Render-based UI critic**: Playwright, screenshot, console capture, mobile viewport; Vite dev server spawned for `react_vite_app` output
- **Schema-based contract validation**: mode contracts, role schemas, structural checks
- **Lightweight critic for follow-up path**: skips full UI critic when `previousArtifact` is provided
- **Unified runId**: API `runId` is passed through to pipeline; persisted state uses the same ID
- **Stage decomposition**: website mode logic split into `stages/` (architectStage, coderStage, uiCriticStage, revisionStage, validatorStage) with a thin `index.js` orchestrator

## Running the Local Web UI

Install backend dependencies from the repo root:

```bash
npm install
```

Install frontend dependencies from the `web/` app:

```bash
cd web
npm install
```

Start the backend API server from the repo root:

```bash
node src/server/app.js
```

Start the frontend dev server in a separate terminal from `web/`:

```bash
npm run dev
```

Expected local URLs:

- Backend API: `http://localhost:3001`
- Backend health check: `http://localhost:3001/health`
- Frontend UI: `http://localhost:5173`
- Frontend API proxy target: `http://localhost:5173/api`

## Website Mode MVP Completion Criteria

Before moving on to `docx` mode, `website` mode should satisfy all of the following:

- The end-to-end pipeline runs from routing through finalization without manual intervention on representative website requests.
- The revision loop executes when the UI critic requests revision and produces a traceable revised coder pass.
- Invalid JSON outputs are recoverable through bounded repair retries rather than terminating the run immediately.
- Validator checks catch structural website issues such as missing files, missing entrypoints, duplicate paths, or contract-breaking output.
- Website smoke test cases run as a small repeatable regression set.
- Major pipeline artifacts are persisted in run state so failed or degraded runs can be debugged without rerunning blindly.

## Website Mode Final Hardening

Before moving on to `docx` mode, finish the last website hardening pass:

- Revision observability setup: confirm revised runs persist `revision_summary` and `revision_trace`, and treat missing traces on revised runs as a release blocker.
- Finalizer minimization: keep website finalization limited to narrow packaging work; if it is still placeholder behavior, do not treat website mode as done.
- Smoke rerun expectations: rerun `node tests/runWebsiteSmoke.js` after website pipeline, validator, or finalizer changes and expect the full smoke corpus to pass with no completion-gate blockers.
- Completion report usage: run `node tests/reportWebsiteCompletion.js` against the latest smoke summary to get the move-on recommendation, then do not proceed to `docx` until it reports `READY`.
