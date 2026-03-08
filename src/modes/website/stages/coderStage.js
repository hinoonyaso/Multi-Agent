import {
  getAgent,
  loadAgentPrompt,
  loadModePrompt,
  MODE_NAME,
  runWebsiteJsonStage,
  buildWebsiteArtifact,
  sanitizeFollowUpArtifact,
  createCoderGenerationInput,
  buildRetryRolePrompt,
  emitStageEvent,
  summarizeCoderStart,
  summarizeCoderResult
} from "./shared.js";

export async function coderFirstPassNodeRunner(ctx) {
  const firstPass = await runFirstPassGeneration(ctx.runtime, ctx.architect, ctx.emit);
  return { coder: firstPass.coder, artifactCandidate: firstPass.artifactCandidate };
}

async function runFirstPassGeneration(runtime, architect, emit) {
  const coder = await runCoderStage(runtime, architect, {
    stageName: "coder_first_pass",
    passName: "first_pass",
    emit
  });
  return { coder, artifactCandidate: buildWebsiteArtifact(coder.parsed) };
}

export async function runCoderStage(
  runtime,
  architect,
  {
    stageName = "coder",
    passName = "first_pass",
    previousCoder = null,
    revisionPlan = null,
    repairPrompt = "",
    emit = null
  } = {}
) {
  const agent = getAgent("website_coder");
  const basePrompt = agent ? await loadAgentPrompt(agent) : await loadModePrompt(MODE_NAME, "coder");
  const prompt = buildRetryRolePrompt({ basePrompt, repairPrompt });
  const followUpArtifact = sanitizeFollowUpArtifact(runtime.input?.previousArtifact);

  emitStageEvent(emit, "coder_started", "coder", summarizeCoderStart(passName, stageName));

  const result = await runWebsiteJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName,
    roleName: "website_coder",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      routing: runtime.routing,
      planning: runtime.planning,
      architecture: architect.parsed,
      generation: createCoderGenerationInput({ passName, previousCoder, revisionPlan, followUpArtifact })
    },
    expectedOutput: {
      files: [{ path: "index.html", content: "<!doctype html><html><body></body></html>" }],
      build_notes: [],
      known_limitations: []
    },
    agent
  });

  emitStageEvent(emit, "coder_completed", "coder", summarizeCoderResult(passName, result));
  return result;
}
