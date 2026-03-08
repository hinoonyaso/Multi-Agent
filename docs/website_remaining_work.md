# Website Remaining Work

Concise engineering worklist for the tasks still required to finish `website` mode.

## 1. Observability

### Define revision and retry artifacts as a hard contract

- Why it matters: Revision behavior exists, but it is not yet a clearly enforced observability contract. Failures need to be diagnosable from persisted state without replaying runs.
- Files likely involved: [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js), [src/core/stateStore.js](/home/sang/dev_ws/Multi-Agent/src/core/stateStore.js), [src/server/routes.js](/home/sang/dev_ws/Multi-Agent/src/server/routes.js)
- Completion signal: Every website run persists first pass, revision summary, selected final coder stage, validator-repair attempts, and retry failure payloads under stable step keys.

### Expose revision path clearly in API/UI surfaces

- Why it matters: The data may exist on disk, but operators still need to see whether the final artifact came from first pass, critic revision, or validator repair.
- Files likely involved: [src/server/routes.js](/home/sang/dev_ws/Multi-Agent/src/server/routes.js), [web/src/components/LogPanel.jsx](/home/sang/dev_ws/Multi-Agent/web/src/components/LogPanel.jsx), [web/src/components/AgentTimeline.jsx](/home/sang/dev_ws/Multi-Agent/web/src/components/AgentTimeline.jsx)
- Completion signal: Run history and live logs show the selected coder stage and reason for each revision branch without opening raw JSON files.

## 2. Finalizer Optimization

### Remove placeholder finalization from the website critical path

- Why it matters: Website mode is not complete while final packaging still depends on a generic placeholder finalizer contract.
- Files likely involved: [src/core/orchestrator.js](/home/sang/dev_ws/Multi-Agent/src/core/orchestrator.js), [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js)
- Completion signal: Website runs either use a real website finalizer with explicit behavior or bypass finalizer entirely with no placeholder TODO path left.

### Implement website-specific artifact finalization rules if a finalizer remains

- Why it matters: A finalizer should add value, not duplicate coder output. If kept, it must normalize metadata and preserve only the approved artifact.
- Files likely involved: [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js), [src/prompts/roles/finalizer.txt](/home/sang/dev_ws/Multi-Agent/src/prompts/roles/finalizer.txt), optionally a new website-specific prompt under [src/prompts/modes/website](/home/sang/dev_ws/Multi-Agent/src/prompts/modes/website)
- Completion signal: Finalization is covered by tests and cannot introduce new contract violations after validation.

## 3. UX/Log Labeling Clarity

### Normalize website stage labels and user-facing event messages

- Why it matters: Current internals distinguish first pass, revision, and validator repair, but the UI/operator view should make those distinctions obvious.
- Files likely involved: [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js), [web/src/components/LogPanel.jsx](/home/sang/dev_ws/Multi-Agent/web/src/components/LogPanel.jsx), [web/src/components/AgentTimeline.jsx](/home/sang/dev_ws/Multi-Agent/web/src/components/AgentTimeline.jsx)
- Completion signal: Logs and timeline consistently display labels such as `Coder First Pass`, `UI Critic`, `Coder Revision`, `Validator Repair`, and `Validator` with no ambiguous `revision` or generic `coder` entries.

### Surface validator decisions and contract-failure reasons clearly

- Why it matters: Operators need to know whether a run failed because of invalid JSON, contract validation, or critic-requested revision.
- Files likely involved: [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js), [src/core/validator.js](/home/sang/dev_ws/Multi-Agent/src/core/validator.js), [web/src/components/ResultPanel.jsx](/home/sang/dev_ws/Multi-Agent/web/src/components/ResultPanel.jsx)
- Completion signal: The UI and persisted run summary expose revision reasons and validator errors in compact, readable form.

## 4. Validation Coverage

### Tighten website artifact validation around entrypoints and unfinished output

- Why it matters: Website completion should fail on placeholder files, missing entrypoints, and leaked prompt scaffolding, not just on gross schema issues.
- Files likely involved: [src/core/validator.js](/home/sang/dev_ws/Multi-Agent/src/core/validator.js), [src/contracts/website.contract.json](/home/sang/dev_ws/Multi-Agent/src/contracts/website.contract.json), [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js)
- Completion signal: Validator rejects artifacts with missing primary entrypoints, empty file sets, obvious placeholder text, or mismatched website output types.

### Cover both supported website output types explicitly

- Why it matters: `static_html_css_js` and `react_vite_app` have different structural requirements and should not share a weak generic pass condition.
- Files likely involved: [src/contracts/website.contract.json](/home/sang/dev_ws/Multi-Agent/src/contracts/website.contract.json), [src/core/validator.js](/home/sang/dev_ws/Multi-Agent/src/core/validator.js)
- Completion signal: Validation rules differ appropriately for static and React/Vite artifacts, and tests prove both paths.

## 5. Test Coverage

### Add revision-path and validator-repair-path tests

- Why it matters: The core unfinished website behavior is in non-happy paths. Those paths need direct regression coverage before the mode is called complete.
- Files likely involved: [tests/websiteMode.test.js](/home/sang/dev_ws/Multi-Agent/tests/websiteMode.test.js), [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js)
- Completion signal: Tests verify critic-triggered revision, validator-triggered repair, persisted retry failures, and final selected coder stage.

### Upgrade website smoke tests into a real acceptance gate

- Why it matters: The current smoke harness is useful, but website mode needs a committed request corpus and a strict pass threshold before work moves on.
- Files likely involved: [tests/runWebsiteSmoke.js](/home/sang/dev_ws/Multi-Agent/tests/runWebsiteSmoke.js), [tests/website.smoke.requests.json](/home/sang/dev_ws/Multi-Agent/tests/website.smoke.requests.json), [tests/results](/home/sang/dev_ws/Multi-Agent/tests/results)
- Completion signal: A single acceptance command runs the website corpus non-interactively and must pass at 100% in CI.

### Add tests for validation failures that should be caught deterministically

- Why it matters: Contract checks are only useful if regression fixtures prove they catch missing entrypoints, placeholder content, and malformed website artifacts.
- Files likely involved: [tests/validator.test.js](/home/sang/dev_ws/Multi-Agent/tests/validator.test.js), [src/core/validator.js](/home/sang/dev_ws/Multi-Agent/src/core/validator.js), [src/contracts/website.contract.json](/home/sang/dev_ws/Multi-Agent/src/contracts/website.contract.json)
- Completion signal: The validator test suite includes website-specific failure fixtures for the main guarded error classes and passes consistently.
