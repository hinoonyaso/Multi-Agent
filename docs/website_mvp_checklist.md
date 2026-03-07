# Website Mode MVP Checklist

Use this checklist to decide whether `website` mode is stable enough to stop iterating on it and start applying the same orchestration pattern to the next mode.

## Routing Quality

- [ ] Router selects `website` for clear website-building requests with high consistency.
- [ ] Router avoids selecting `website` for requests that are obviously better served by `docx`, `slide`, `sheet`, or `deep_research`.
- [ ] Ambiguous requests still produce a defensible mode choice rather than random drift.
- [ ] Router output is valid JSON and follows the expected schema without manual cleanup.
- [ ] Router reasoning and risks are concrete enough to support downstream planning.

## Planning Quality

- [ ] Planner produces execution steps that match the chosen mode instead of generic workflow filler.
- [ ] Planner artifact contract summary is specific enough to guide implementation and validation.
- [ ] Planner risks and open questions reflect the actual request complexity.
- [ ] Planner output remains compact and structurally valid across simple and complex requests.
- [ ] Planner does not introduce requirements that were not implied by the user request or contract.

## Architecture Quality

- [ ] Architect output defines a coherent site type, page structure, and design guidance.
- [ ] Architecture reflects the user request rather than emitting the same default layout every time.
- [ ] Implementation notes are useful to the coder and not just restated requirements.
- [ ] The architecture is specific enough that the coder can implement without guessing core structure.
- [ ] Architecture does not overdesign beyond the requested scope.

## Code Generation Quality

- [ ] Coder outputs valid JSON consistently.
- [ ] Generated files are complete enough to open or run without obvious missing implementation pieces.
- [ ] File structure matches the declared output type.
- [ ] HTML/CSS/JS or React output is syntactically coherent.
- [ ] Output quality scales reasonably from simple landing pages to more structured product pages.
- [ ] Constraint-heavy prompts are respected without major contract breaks.
- [ ] Generated code avoids placeholder-heavy or pseudo-implementation output.

## Critique Usefulness

- [ ] UI critic identifies real, concrete issues instead of generic design commentary.
- [ ] Critic recommendations are small enough to drive targeted revision work.
- [ ] Critic passes correctly call out strengths worth preserving.
- [ ] Critic severity levels roughly match actual user impact.
- [ ] Critic does not request revisions for already-acceptable outputs too often.

## Validation Reliability

- [ ] Deterministic website file checks catch obvious structural failures.
- [ ] Contract-aware validation catches missing entrypoints, missing files, and broken structure expectations.
- [ ] Validation does not block clearly acceptable outputs because of brittle heuristics.
- [ ] Validation errors are specific enough to support repair prompts and debugging.
- [ ] Validation results are stable across repeated runs of similar requests.

## Revision Loop Behavior

- [ ] Revision triggers only when critique or validation meaningfully justifies another pass.
- [ ] Revision instructions are compact, implementation-oriented, and derived from actual issues.
- [ ] Revised coder output preserves already-correct parts when applying fixes.
- [ ] Retry handling for invalid JSON and validator failures is bounded and does not loop indefinitely.
- [ ] Failed outputs and repair attempts are persisted with traceable run-state keys.
- [ ] Revision improves outputs more often than it degrades them.

## Output Artifact Quality

- [ ] Final artifact matches the requested scope and user intent.
- [ ] Entry files and supporting files are internally consistent.
- [ ] Responsive behavior exists in code, not only as described intent.
- [ ] Visual hierarchy, readability, and CTA clarity are acceptable on desktop and mobile.
- [ ] Finalizer packaging preserves the approved implementation without introducing structure drift.
- [ ] Smoke requests cover the common request types expected for early production usage.

## Exit Decision

- [ ] Smoke suite passes at an acceptable rate on representative prompts.
- [ ] Failures are understandable, diagnosable, and not dominated by orchestration bugs.
- [ ] Remaining issues are localized improvements, not architectural blockers.
- [ ] The current website pattern is clean enough to reuse for the next mode without major rework.
