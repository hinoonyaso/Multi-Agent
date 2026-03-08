# Website Mode Completion Definition

This document defines the exact bar for saying `website` mode is complete enough to stop iterating on it and move to the next mode.

`Website mode is 100% complete enough to move on` only if every section below is in `PASS` state. If any section is `FAIL`, work is not complete.

## Prompting Engineering Completion

### Still unfinished

- `website` has mode prompts for `architect`, `coder`, and `ui_critic`, but no website-specific finalization strategy is defined in prompts.
- Prompt quality is only partially covered by tests. Current tests prove stage execution more than request-level output quality.
- Repair prompting exists, but completion is not reached until invalid JSON repair and contract repair are both acceptance-tested.

### PASS

- `architect`, `coder`, and `ui_critic` prompts produce schema-valid output across the full website acceptance corpus without per-case prompt edits.
- The coder prompt reliably emits only supported website artifact shapes:
  - `static_html_css_js`
  - `react_vite_app`
- The critic prompt emits revision-ready feedback:
  - every issue identifies a concrete defect
  - every issue points to an affected area or file
  - every issue includes an implementation-oriented fix direction
- Repair prompts recover at least one intentionally broken invalid-JSON case and at least one intentionally broken contract-failure case in automated tests.
- If a finalizer remains in the website path, prompt behavior for that finalizer is explicit, website-specific, and covered by tests.

### FAIL

- Any website stage frequently emits malformed JSON, empty JSON, placeholder text, or structurally valid but operationally useless output.
- The coder prompt has to be manually tuned for different website request types to stay on contract.
- Critic output is generic commentary that cannot be turned into a narrow code delta.
- Prompting still depends on an implied or placeholder finalization contract.

## Context Engineering Completion

### Still unfinished

- Website mode still passes broad runtime objects into stage inputs in [src/modes/website/index.js](/home/sang/dev_ws/Multi-Agent/src/modes/website/index.js) instead of consistently using bounded stage-specific context.
- Website-specific context builders exist in [src/core/contextBuilder.js](/home/sang/dev_ws/Multi-Agent/src/core/contextBuilder.js), but they are not yet the enforced path for all website stage inputs.
- Revision preservation exists in shared helpers, but website completion requires proving that approved decisions survive revision and repair passes.

### PASS

- Every website stage receives a deliberate, bounded input object rather than raw orchestration state.
- The architect stage receives only request, routing/planning summary, and contract summary relevant to site architecture.
- The coder stage receives only approved architecture, contract constraints, and compact revision instructions when revising.
- The critic stage receives only the approved architecture, generated artifact, and the contract slices needed for critique.
- The validator stage receives only the final artifact candidate plus deterministic website validation rules.
- At least one automated revision test proves that a second coder pass preserves already approved structure, files, and design direction unless a revision instruction explicitly changes them.
- Adding unrelated fields to router or planner output does not change website behavior because website stage inputs are schema-bounded.

### FAIL

- Stage inputs contain large raw objects that include unrelated orchestration state.
- Revision passes drift on layout, file structure, or design decisions because approved context is not preserved.
- A website stage requires upstream transcript sprawl to behave correctly.
- Small upstream schema changes change website behavior because the context contract is loose.

## Harness Engineering Completion

### Still unfinished

- Shared mode runtime retry metadata still contains a TODO in [src/modes/shared/pipeline.js](/home/sang/dev_ws/Multi-Agent/src/modes/shared/pipeline.js), so retry behavior is not yet fully implemented as a deterministic harness contract.
- The top-level orchestrator still performs placeholder finalization in [src/core/orchestrator.js](/home/sang/dev_ws/Multi-Agent/src/core/orchestrator.js), which means website completion currently depends on unfinished packaging behavior.
- The smoke runner exists, but completion requires it to be promoted from exploratory tooling into a hard gate.

### PASS

- The website stage order is fixed, documented, and test-covered:
  - architect
  - coder first pass
  - UI critic
  - optional coder revision
  - optional validator repair
  - validator
  - finalization only if it performs real website-specific work
- Retry behavior is bounded and test-covered for:
  - invalid JSON
  - contract validation failure
  - critic-requested revision
- No retry path can loop indefinitely. Max attempts are enforced in code and asserted in tests.
- Persisted run state is sufficient to replay the execution path without guessing:
  - architect output
  - coder first pass
  - UI critic result
  - revision summary
  - revised coder pass when present
  - validator repair pass when present
  - final selected coder output
  - validator result
  - retry failure artifacts
- Website mode either has a real website-specific finalizer or completely removes placeholder finalization from its acceptance path.
- The smoke/acceptance harness runs non-interactively and produces machine-readable pass/fail output.

### FAIL

- Any retry branch is unbounded, ad hoc, or only understandable from source inspection.
- Placeholder orchestrator finalization is still on the website critical path.
- Important execution artifacts are missing from persisted state.
- The smoke harness is informative but not release-gating.

## Revision Observability Completion

### Still unfinished

- Revision artifacts are persisted, but completion requires a hard observability contract, not just “some data was saved”.
- Current coverage does not yet prove that revision branches and repair branches are always externally visible and diagnosable.
- Completion also requires proving that operators can identify which coder output became the final artifact.

### PASS

- For every website run, stored artifacts answer all of these questions without rerunning the model:
  - why revision happened
  - which stage triggered it
  - what issues were targeted
  - whether validator repair happened
  - which coder pass became the final artifact
- Revision summary data includes, at minimum:
  - `triggered`
  - `attempts`
  - `maxAttempts`
  - `issues`
  - `instructions`
  - `selectedCoderStage`
- Retry failure artifacts preserve the failed raw output and the validation or parsing reason.
- Event streams expose start and completion events for architect, coder first pass, UI critic, revision branch, validator repair branch, and validator.
- At least one automated test proves critic-triggered revision persistence and one proves validator-triggered repair persistence under distinct step keys.

### FAIL

- A reviewer cannot tell whether the final artifact came from first pass, critique revision, or validator repair.
- Retry failures omit the raw output or the exact failure reason.
- Event traces collapse multiple revision paths into ambiguous generic entries.
- Observability works only for happy-path runs.

## Finalizer Optimization Completion

### Still unfinished

- The orchestrator still uses placeholder packaging output with TODO markers in [src/core/orchestrator.js](/home/sang/dev_ws/Multi-Agent/src/core/orchestrator.js).
- Website mode does not yet have a completed, explicit finalization strategy.
- Completion requires deciding whether website needs a finalizer at all. “Maybe later” is not an acceptable state.

### PASS

- There is a single explicit finalization policy for website mode:
  - either no finalizer exists and the pipeline returns the validated artifact directly
  - or a website-specific finalizer exists and has a narrow, useful job
- If a finalizer exists, it is limited to post-validation packaging work such as:
  - normalizing final artifact metadata
  - removing scaffolding not intended for the deliverable
  - ensuring the returned shape matches the website contract exactly
- Finalization never introduces new contract violations or mutates approved files without a second validation step.
- Tests verify that the user-visible final artifact matches the website contract exactly after finalization.
- No placeholder finalizer contract or TODO language remains on the website completion path.

### FAIL

- Finalization is still placeholder packaging.
- Finalization duplicates coder behavior without improving correctness or deliverable shape.
- Finalization can mutate files after validation without revalidation.
- Completion still depends on future cleanup of packaging behavior.

## Acceptance Test Completion

### Still unfinished

- Current tests prove pipeline flow, but not yet the full completion bar for artifact quality, retry bounds, revision coverage, and finalizer behavior.
- The website request corpus exists, but completion requires explicit request coverage and a hard pass threshold.
- Completion also requires failure fixtures that prove the harness catches real regressions instead of only approving happy-path outputs.

### PASS

- The committed website acceptance corpus includes at least:
  - simple landing page
  - multi-section marketing page
  - product or SaaS page with strong CTA requirements
  - content-heavy page
  - `react_vite_app` request
  - `static_html_css_js` request
  - critic-triggered revision case
  - validator-repair case
- Acceptance tests verify both orchestration and artifact quality:
  - contract validation passes
  - required entrypoints are present
  - file set is internally consistent
  - no placeholder scaffolding or TODO text leaks into deliverables
  - retry and revision bounds are respected
  - final returned artifact shape is correct
- Completion threshold is strict:
  - `0` known architectural blockers on the website critical path
  - `100%` pass rate on deterministic unit and integration tests
  - `100%` pass rate on the committed website acceptance corpus in CI
  - `0` cases requiring manual cleanup of generated website artifacts
- At least one failure fixture exists for each guarded class of regression:
  - malformed JSON
  - contract-breaking artifact
  - missing entrypoint
  - placeholder or TODO leakage
  - retry bound violation

### FAIL

- Tests mainly prove that stages were called, not that the resulting website artifact is acceptable.
- Important request classes are missing from the acceptance corpus.
- A green suite still allows placeholder files, missing entrypoints, or invalid final deliverables.
- Acceptance results are too weak or unstable to act as the move-on gate.

## Exit Rule

Website mode is `100% complete enough to move on to the next mode` only when all of the following are true:

- All six sections above are in `PASS`.
- No placeholder, TODO, or implicit behavior remains on the website critical path.
- One automated command can be named as the release gate, and a passing result on that command means website mode is done for now.
- Any remaining work is optional optimization, not prompting, context, harness, observability, finalization, or acceptance-gap work.

If any statement above is false, website mode is not complete.
