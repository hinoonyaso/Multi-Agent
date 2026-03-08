# Website Remaining Work

Concise engineering worklist for the remaining tasks required to finish `website` mode.

## 1. Observability

### Lock revision and retry artifacts into a stable run-state contract

- Why it matters: Website mode is not complete if failures cannot be diagnosed from persisted state. Revision and repair branches must be reconstructable without rerunning the model.
- Files likely involved: [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js), [src/core/stateStore.js](/home/sang/dev_ws/Multi-Agent/src/core/stateStore.js), [src/core/revisionTraceBuilder.js](/home/sang/dev_ws/Multi-Agent/src/core/revisionTraceBuilder.js)
- Completion signal: Every run persists first pass, revision summary, retry failures, validator repair attempts, and the final selected coder stage under stable keys.

### Expose the selected execution path in API and UI surfaces

- Why it matters: Operators need to see whether the final artifact came from first pass, critique revision, or validator repair without opening raw run files.
- Files likely involved: [src/server/routes.js](/home/sang/dev_ws/Multi-Agent/src/server/routes.js), [web/src/components/LogPanel.jsx](/home/sang/dev_ws/Multi-Agent/web/src/components/LogPanel.jsx), [web/src/components/AgentTimeline.jsx](/home/sang/dev_ws/Multi-Agent/web/src/components/AgentTimeline.jsx)
- Completion signal: Run history and live logs clearly show the selected coder stage, revision trigger, and validator-repair status.

## 2. Finalizer Optimization

### Remove placeholder finalization from the website critical path

- Why it matters: Website mode is still unfinished while the orchestrator depends on placeholder packaging behavior.
- Files likely involved: [src/core/orchestrator.js](/home/sang/dev_ws/Multi-Agent/src/core/orchestrator.js), [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js)
- Completion signal: Website mode either bypasses finalization entirely or uses a real website-specific finalization step with no TODO behavior left in the path.

### Define narrow website-specific finalization behavior if a finalizer remains

- Why it matters: A finalizer should only do useful post-validation packaging work, not re-generate or mutate the artifact arbitrarily.
- Files likely involved: [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js), [src/prompts/roles/finalizer.txt](/home/sang/dev_ws/Multi-Agent/src/prompts/roles/finalizer.txt), [src/prompts/modes/website](/home/sang/dev_ws/Multi-Agent/src/prompts/modes/website)
- Completion signal: Finalization is limited to deliverable-shape cleanup or metadata normalization, is test-covered, and cannot introduce new contract violations.

## 3. UX/Log Labeling Clarity

### Normalize website stage labels and event summaries

- Why it matters: Current internals distinguish first pass, revision, and repair, but the UI/log surface should make those branches obvious.
- Files likely involved: [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js), [web/src/components/LogPanel.jsx](/home/sang/dev_ws/Multi-Agent/web/src/components/LogPanel.jsx), [web/src/components/AgentTimeline.jsx](/home/sang/dev_ws/Multi-Agent/web/src/components/AgentTimeline.jsx)
- Completion signal: Logs and timeline consistently show labels such as `Coder First Pass`, `UI Critic`, `Coder Revision`, `Validator Repair`, and `Validator`.

### Surface validator outcomes and failure reasons in a compact form

- Why it matters: Users and operators need immediate visibility into why a run failed or revised, especially for contract and entrypoint failures.
- Files likely involved: [src/core/validator.js](/home/sang/dev_ws/Multi-Agent/src/core/validator.js), [src/server/routes.js](/home/sang/dev_ws/Multi-Agent/src/server/routes.js), [web/src/components/ResultPanel.jsx](/home/sang/dev_ws/Multi-Agent/web/src/components/ResultPanel.jsx)
- Completion signal: The UI and run summaries expose validator decision, top failure reasons, and revision trigger in a readable summary instead of raw internal blobs.

## 4. Validation Coverage

### Tighten deterministic checks for unfinished or structurally invalid website artifacts

- Why it matters: Completion requires rejecting artifacts with missing entrypoints, empty files, placeholder content, or leaked prompt scaffolding.
- Files likely involved: [src/core/validator.js](/home/sang/dev_ws/Multi-Agent/src/core/validator.js), [src/contracts/website.contract.json](/home/sang/dev_ws/Multi-Agent/src/contracts/website.contract.json)
- Completion signal: Validator deterministically fails artifacts with missing primary entrypoints, empty file sets, obvious placeholder text, or mismatched output types.

### Split validation expectations by output type

- Why it matters: `static_html_css_js` and `react_vite_app` have different structural requirements and need distinct validation rules.
- Files likely involved: [src/core/validator.js](/home/sang/dev_ws/Multi-Agent/src/core/validator.js), [src/contracts/website.contract.json](/home/sang/dev_ws/Multi-Agent/src/contracts/website.contract.json), [tests/validator.test.js](/home/sang/dev_ws/Multi-Agent/tests/validator.test.js)
- Completion signal: Static artifacts and React/Vite artifacts are validated against different entrypoint and file-shape rules, with tests proving both paths.

## 5. Test Coverage

### Add direct coverage for revision and validator-repair branches

- Why it matters: The remaining risk is concentrated in non-happy paths, not in the straight-through success case.
- Files likely involved: [tests/websiteMode.test.js](/home/sang/dev_ws/Multi-Agent/tests/websiteMode.test.js), [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js)
- Completion signal: Tests prove critic-triggered revision, validator-triggered repair, persisted retry failures, and correct final artifact selection.

### Promote website smoke tests into the acceptance gate

- Why it matters: Website mode is not finished until the committed request corpus becomes the actual move-on gate.
- Files likely involved: [tests/runWebsiteSmoke.js](/home/sang/dev_ws/Multi-Agent/tests/runWebsiteSmoke.js), [tests/website.smoke.requests.json](/home/sang/dev_ws/Multi-Agent/tests/website.smoke.requests.json), [package.json](/home/sang/dev_ws/Multi-Agent/package.json)
- Completion signal: One non-interactive command runs the website corpus, produces machine-readable results, and must pass at 100% in CI.

### Add deterministic validator regression fixtures

- Why it matters: Validation logic is incomplete until failure fixtures prove it catches the main structural regressions reliably.
- Files likely involved: [tests/validator.test.js](/home/sang/dev_ws/Multi-Agent/tests/validator.test.js), [src/core/validator.js](/home/sang/dev_ws/Multi-Agent/src/core/validator.js), [src/contracts/website.contract.json](/home/sang/dev_ws/Multi-Agent/src/contracts/website.contract.json)
- Completion signal: The validator suite includes fixtures for malformed JSON, missing entrypoints, placeholder leakage, and contract-breaking website artifacts, and all of them fail for the correct reason.
