# Website Mode Completion Definition

This document defines the exact bar for saying `website` mode is complete enough to stop iterating on it and move work to the next mode. The bar is intentionally strict. "Mostly works" does not count.

Website mode is only complete when all sections below are in `PASS` state.

## Prompting Engineering Completion

### Currently unfinished

- The mode has prompt files for `architect`, `coder`, and `ui_critic`, but there is no website-specific `finalizer` prompt.
- Retry and repair prompting exists, but invalid JSON repair and contract-repair behavior are not yet proven by acceptance coverage.
- Prompt quality is only indirectly checked by unit tests that validate stage execution, not by request-level output quality gates.

### PASS criteria

- `src/prompts/modes/website/architect.txt`, `src/prompts/modes/website/coder.txt`, and `src/prompts/modes/website/ui_critic.txt` each produce schema-valid output across the acceptance suite without manual prompt tweaks between cases.
- If website mode keeps using a packaging/finalization stage, there is a website-specific prompt or an explicitly justified shared finalizer contract with website-targeted packaging rules. The current placeholder finalizer expectation in [src/core/orchestrator.js](/home/sang/dev_ws/Multi-Agent/src/core/orchestrator.js#L308) must be removed.
- Prompt instructions are specific enough that the coder reliably emits one of the supported website artifact shapes:
  - `static_html_css_js`
  - `react_vite_app`
- Critic prompts produce actionable issues with enough structure to drive targeted revision:
  - each issue names the problem
  - each issue identifies the affected area
  - each issue includes a concrete recommended fix or an equivalent implementation direction
- Repair prompts for invalid JSON and contract failures are exercised by automated tests and shown to recover at least one intentionally broken case.

### FAIL criteria

- A stage frequently emits malformed JSON, empty JSON, placeholder content, or schema-shaped but non-actionable output.
- The coder prompt requires hand-editing per request type to stay on-contract.
- The final packaging step still depends on a generic placeholder contract or TODO behavior.
- The critic regularly emits generic design commentary that cannot be turned into a small implementation delta.

## Context Engineering Completion

### Currently unfinished

- Website-specific context builders exist in [src/core/contextBuilder.js](/home/sang/dev_ws/Multi-Agent/src/core/contextBuilder.js), but website mode currently passes raw runtime objects directly inside [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js) instead of consistently using those summarized context builders.
- There is no explicit proof that every website stage gets the minimum necessary context and nothing larger.
- Approved-decision preservation is implemented in the generic revision builder, but not established as the canonical path for website mode stage inputs.

### PASS criteria

- Every website stage uses a deliberate, stage-specific context object rather than ad hoc raw objects.
- The architect stage receives only:
  - user request
  - planner summary
  - relevant contract summary
  - research summary when present
- The coder stage receives only:
  - approved architecture
  - contract summary
  - compact revision instruction when revising
  - approved decisions needed to prevent drift
- The critic stage receives only:
  - approved architecture
  - generated files
  - contract slices relevant to frontend quality and scope
- The validator stage receives only:
  - generated files
  - explicit contract validation rules
- For at least one revision test, the second coder pass preserves previously approved structure and files unless the revision explicitly requires a change.

### FAIL criteria

- Stage inputs still include broad raw state objects when a smaller summarized context is available.
- Revision passes drift on layout, file structure, or design direction because approved decisions are not preserved in context.
- Stages require unrelated upstream transcripts to perform reliably.
- Adding a new field to planner or routing output unexpectedly changes website stage behavior because the context contract is not bounded.

## Harness Engineering Completion

### Currently unfinished

- The website pipeline is implemented and unit tested, but the retry policy is only partially wired. [src/modes/shared/pipeline.js](/home/sang/dev_ws/Multi-Agent/src/modes/shared/pipeline.js#L64) still contains a TODO for targeted retry behavior.
- Website mode stops at validator and returns the artifact candidate directly. It does not have a mode-local finalizer stage comparable to `docx`, `slide`, `sheet`, or `deep_research`.
- The smoke harness exists in [tests/runWebsiteSmoke.js](/home/sang/dev_ws/Multi-Agent/tests/runWebsiteSmoke.js), but it is not yet a hard completion gate tied to explicit thresholds.

### PASS criteria

- The website pipeline has a stable, documented stage order and bounded retry behavior for:
  - invalid JSON output
  - contract validation failure
  - critic-requested revision
- Retry limits are enforced by code and verified by tests. No retry path can loop indefinitely.
- The run state persists all material website execution artifacts:
  - architect output
  - first coder pass
  - critic result
  - revision summary
  - revised coder pass when present
  - validator-repair coder pass when present
  - final selected coder output
  - validator result
  - retry failure records
- Website mode either:
  - owns its own finalizer stage with website-specific packaging behavior, or
  - explicitly documents that no finalizer is required and the orchestrator finalizer is removed from the website acceptance path
- The smoke harness can be run non-interactively and produces a machine-readable summary with pass/fail counts and error reasons.

### FAIL criteria

- Any retry path is unbounded or cannot be reproduced from persisted run state.
- The website path depends on orchestrator behavior that is still marked placeholder or TODO.
- Important stage outputs are missing from persisted state, making failures hard to replay.
- The smoke runner exists only as an exploratory tool and is not part of the completion decision.

## Revision Observability Completion

### Currently unfinished

- Website mode persists revision artifacts and retry failures, but there is no explicit pass/fail definition for observability quality.
- There is no acceptance-level assertion that revision actually improved the artifact or at least resolved the cited validator/critic issue.
- Event emission exists, but there is no completeness gate ensuring that all revision branches are externally visible and diagnosable.

### PASS criteria

- For every website run, persisted state is sufficient to answer:
  - why a revision happened
  - which stage triggered it
  - which issues were targeted
  - which coder output was finally selected
  - whether a validator-triggered repair occurred
- Revision summary data records:
  - `triggered`
  - `attempts`
  - `maxAttempts`
  - `issues`
  - `instructions`
  - `selectedCoderStage`
- Retry failure records include the failed raw output and validation detail needed to debug the failure without rerunning the original model call.
- Event logs expose start and completion events for:
  - architect
  - coder first pass
  - UI critic
  - revision when triggered
  - validator
- At least one automated test verifies that a critic-triggered revision and a validator-triggered repair are both persisted under distinct step keys.

### FAIL criteria

- A reviewer cannot tell from run artifacts whether the final output came from first pass, revision, or validator repair.
- Retry failures are recorded without enough detail to reconstruct the problem.
- Revision event traces are incomplete or ambiguous.
- Observability exists only for happy-path approval runs.

## Finalizer Optimization Completion

### Currently unfinished

- Website mode does not have a dedicated finalizer stage.
- The orchestrator-level finalizer still uses a placeholder expected output with a TODO note in [src/core/orchestrator.js](/home/sang/dev_ws/Multi-Agent/src/core/orchestrator.js#L320).
- There is no website-specific definition of what packaging optimization means beyond returning the artifact candidate.

### PASS criteria

- There is a deliberate finalization strategy for website mode, and it is implemented rather than implied.
- If a website finalizer exists, it must do useful work that the coder and validator do not already do, such as:
  - normalize artifact metadata
  - enforce final deliverable shape
  - strip generation scaffolding
  - preserve only the approved artifact files and notes
- If no website finalizer exists, the pipeline and orchestrator are simplified so website completion does not depend on a generic finalizer call.
- Finalization never changes the approved website output in a way that introduces new contract violations.
- Automated tests verify that the final artifact returned to the user is exactly the artifact shape the website contract expects.

### FAIL criteria

- Finalization is still a placeholder packaging step.
- Finalization duplicates coder behavior without improving correctness, packaging, or contract compliance.
- Finalization can mutate files or metadata after validation without a second contract check.
- The completion claim still depends on "we will optimize final packaging later."

## Acceptance Test Completion

### Currently unfinished

- Unit coverage exists for the website pipeline in [tests/websiteMode.test.js](/home/sang/dev_ws/Multi-Agent/tests/websiteMode.test.js) and for orchestrator smoke behavior in [tests/smoke.test.js](/home/sang/dev_ws/Multi-Agent/tests/smoke.test.js), but these primarily verify control flow.
- The smoke request corpus exists in [tests/website.smoke.requests.json](/home/sang/dev_ws/Multi-Agent/tests/website.smoke.requests.json), but the completion bar does not yet define required request coverage or pass thresholds.
- There is no explicit regression suite for revision-triggering cases, contract-repair cases, or finalizer behavior.

### PASS criteria

- The acceptance suite includes representative website requests for at least:
  - simple landing page
  - multi-section marketing page
  - product or SaaS page with strong CTA requirements
  - content-heavy page with multiple sections
  - React/Vite request
  - static HTML/CSS/JS request
  - revision-triggering case
  - contract-repair-triggering case
- Acceptance tests verify both control flow and artifact quality gates:
  - contract validation passes
  - expected entrypoints are present
  - file set is internally consistent
  - no prompt scaffolding or placeholder TODO output leaks into deliverables
  - revision and retry bounds are respected
- Completion threshold for website mode:
  - `0` known architectural blockers
  - `100%` pass rate on deterministic unit/integration tests
  - `100%` pass rate on the committed website acceptance corpus in CI
  - `0` cases requiring manual artifact cleanup after generation
- At least one failure fixture exists for each guarded error class so the suite proves the harness catches real regressions.

### FAIL criteria

- The suite mostly checks that stages were called, but not that the resulting website artifact is actually acceptable.
- Important request classes are missing from the acceptance corpus.
- Passing the suite still allows placeholder files, missing entrypoints, or generic unfinished output.
- Acceptance results are not stable enough to serve as the release gate for moving to the next mode.

## Exit Rule

Website mode is `100% complete enough to move on` only when all of the following are true:

- All six completion sections above are in `PASS`.
- No open TODO or placeholder behavior remains on the website critical path.
- The team can point to a single automated acceptance command and say: if it passes, website mode is done for now.
- Remaining work is clearly optional optimization, not correctness, observability, packaging, or acceptance-gap work.

If any one of those statements is false, website mode is not complete and work should not move on yet.
