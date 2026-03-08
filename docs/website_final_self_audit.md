# Website Final Self-Audit

Strict release checklist for `website` mode after observability hardening and finalizer optimization are implemented. Every item should be answered `Yes` before moving on. Any `No` means website mode is still open work.

## Prompting Engineering

- [ ] Yes / [ ] No: Are website role prompts explicit enough that architect, coder, critic, validator, and any remaining finalizer each have a narrow, non-overlapping job?
- [ ] Yes / [ ] No: Do prompts forbid plan-shaped or partial-draft outputs when the contract requires a buildable website artifact?
- [ ] Yes / [ ] No: Does the coder prompt clearly distinguish first pass, critique revision, and validator repair behavior?
- [ ] Yes / [ ] No: Have placeholder instructions, TODO wording, and ambiguous “do your best” language been removed from the website completion path?

## Context Engineering

- [ ] Yes / [ ] No: Does each website stage receive only the context it needs, without excess transcripts or irrelevant intermediate state?
- [ ] Yes / [ ] No: Is revision context structured so the coder can see critic issues and repair instructions without re-deriving them from raw logs?
- [ ] Yes / [ ] No: Does finalization receive only the approved artifact and packaging metadata, rather than enough context to regenerate the website?
- [ ] Yes / [ ] No: Are context payloads stable enough that the same request shape produces comparable behavior across smoke reruns?

## Harness Engineering

- [ ] Yes / [ ] No: Do the website runner and persisted run files expose the selected execution path clearly enough to debug failures without rerunning blindly?
- [ ] Yes / [ ] No: Are retry branches for invalid JSON and contract repair bounded, persisted, and visible in run state?
- [ ] Yes / [ ] No: Does the smoke harness emit machine-readable results that can act as a practical completion gate?
- [ ] Yes / [ ] No: Is there a single non-interactive command path to run the website smoke suite and inspect its report?

## Revision Observability

- [ ] Yes / [ ] No: If a critique-triggered revision occurs, is `revision_summary` always persisted under a stable step key?
- [ ] Yes / [ ] No: If a revision occurs, is a structured `revision_trace` always persisted and recoverable from the run state?
- [ ] Yes / [ ] No: Does the trace capture critic issues, revision instructions, changed artifacts, and post-revision validator outcome?
- [ ] Yes / [ ] No: Will the smoke summary and completion report both flag revised runs that are missing a revision trace?

## Finalizer Efficiency

- [ ] Yes / [ ] No: Has placeholder finalization been removed from the website critical path, or replaced with a website-specific finalizer that only performs narrow packaging work?
- [ ] Yes / [ ] No: Can the finalizer avoid introducing new contract violations or mutating approved content arbitrarily?
- [ ] Yes / [ ] No: Is finalizer timing recorded in the smoke summary so regressions are visible?
- [ ] Yes / [ ] No: Is finalizer cost low enough that it is not the dominant source of end-to-end smoke runtime?

## UI Visibility

- [ ] Yes / [ ] No: Do UI or API surfaces show whether the selected artifact came from first pass, revision, or validator repair?
- [ ] Yes / [ ] No: Can an operator see validator outcome and top failure reasons without opening raw JSON files?
- [ ] Yes / [ ] No: If a revision happened, is the trace status visible enough to distinguish present, missing, and partial trace states?
- [ ] Yes / [ ] No: Are website stage labels consistent across logs, timelines, and run summaries?

## Smoke Stability

- [ ] Yes / [ ] No: Does the committed website smoke corpus pass at 100% on the current branch?
- [ ] Yes / [ ] No: Do repeated smoke reruns produce stable pass/fail outcomes rather than flaking between states?
- [ ] Yes / [ ] No: Does the smoke summary mark website mode as not ready when validation fails, run status is not `ok`, or revision trace coverage is broken?
- [ ] Yes / [ ] No: Does `node tests/reportWebsiteCompletion.js` report `READY` on the latest summary before the team treats website mode as complete?

## Ready to Move to Docx Mode

- [ ] Yes / [ ] No: Every section above is fully `Yes`, with no open blockers, TODO behavior, or unexplained smoke instability remaining in `website` mode.
