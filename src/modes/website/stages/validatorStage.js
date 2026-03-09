import { validateOutput } from "../../../core/validator.js";
import {
  getAgent,
  loadAgentPrompt,
  loadRolePrompt,
  MODE_NAME,
  STEP_KEYS,
  runWebsiteJsonStage,
  persistWebsiteStep,
  emitStageEvent,
  summarizeValidatorResult
} from "./shared.js";
import { persistRevisionTrace } from "./revisionStage.js";
import { resolveAgentForWorker } from "../../../core/workerRegistry.js";

export async function validatorNodeRunner(ctx) {
  const validatedRevision = ctx.validatedRevision ?? ctx.revision;
  const uiCritic = ctx.uiCritic;
  emitStageEvent(ctx.emit, "validator_started", "validator", "Validating website artifact.");
  const validator = await runValidatorStage(
    {
      ...ctx.runtime,
      assignedWorker: ctx.assignedWorker ?? null
    },
    ctx.architect,
    uiCritic,
    validatedRevision
  );
  emitStageEvent(ctx.emit, "validator_completed", "validator", summarizeValidatorResult(validator));
  await persistWebsiteStep(ctx.runtime, STEP_KEYS.validator, validator);
  await persistRevisionTrace(ctx.runtime, uiCritic, validatedRevision, validator);
  return validator;
}

async function runValidatorStage(runtime, architect, uiCritic, revision) {
  const assignedAgent = resolveAgentForWorker(runtime.assignedWorker);
  const agent = assignedAgent ?? getAgent("website_validator");
  const prompt = agent ? await loadAgentPrompt(agent) : await loadRolePrompt("validator");
  const contractValidation = await validateOutput({
    mode: MODE_NAME,
    output: revision.finalArtifactCandidate
  });
  const validatorDecision = decideRevision({ coder: revision.finalCoder, uiCritic, contractValidation, revision });

  const stage = await runWebsiteJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "validator",
    roleName: "validator",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      architecture: architect.parsed,
      implementation: revision.finalArtifactCandidate,
      coder_output: revision.finalCoder.parsed,
      first_pass_coder_output: revision.firstPassCoder.parsed,
      revised_coder_output: revision.revisedCoder?.parsed ?? null,
      ui_review: uiCritic.parsed,
      revision_summary: revision.summary,
      contract_validation: contractValidation,
      revision_signal: validatorDecision
    },
    expectedOutput: {
      status: validatorDecision.needsRevision ? "revise" : "approve",
      reasons: contractValidation.errors.map((i) => i.message),
      next_action: validatorDecision.needsRevision
        ? "Request a targeted revision from the coder stage."
        : "Proceed to final packaging."
    },
    agent
  });

  return {
    ...stage,
    contractValidation,
    approval: {
      ok: contractValidation.ok && !validatorDecision.needsRevision,
      recommendation: validatorDecision.needsRevision ? "revise" : "approve"
    },
    revision: {
      ...validatorDecision,
      nextTargetStage: validatorDecision.needsRevision ? "coder" : null
    }
  };
}

function decideRevision({ coder, uiCritic, contractValidation, revision }) {
  const criticRecommendation = uiCritic?.parsed?.final_recommendation;
  const criticNeedsRevision = criticRecommendation === "revise" && revision?.summary?.attempts === 0;
  const coderInvalid = Boolean(coder) && !coder.ok;
  return {
    needsRevision: coderInvalid || criticNeedsRevision || !contractValidation.ok,
    reasons: [
      ...(coderInvalid ? ["coder_output_invalid"] : []),
      ...(criticNeedsRevision ? ["ui_critic_requested_revision"] : []),
      ...(!contractValidation.ok ? ["website_contract_validation_failed"] : [])
    ]
  };
}
