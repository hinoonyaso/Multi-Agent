import {
  getAgent,
  loadAgentPrompt,
  loadModePrompt,
  MODE_NAME,
  STEP_KEYS,
  getFollowUpContext,
  runWebsiteJsonStage,
  persistWebsiteStep,
  emitStageEvent,
  summarizeArchitectResult
} from "./shared.js";

export async function architectNodeRunner(ctx) {
  emitStageEvent(ctx.emit, "architect_started", "architect", "Generating website architecture.");
  const architect = await runArchitectStage(ctx.runtime);
  emitStageEvent(ctx.emit, "architect_completed", "architect", summarizeArchitectResult(architect));
  await persistWebsiteStep(ctx.runtime, STEP_KEYS.architect, architect);
  return architect;
}

async function runArchitectStage(runtime) {
  const agent = getAgent("website_architect");
  const prompt = agent ? await loadAgentPrompt(agent) : await loadModePrompt(MODE_NAME, "architect");
  const followUpContext = getFollowUpContext(runtime.input);

  return runWebsiteJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "architect",
    roleName: "website_architect",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      previous_request: followUpContext.previousRequest,
      previous_run: followUpContext.previousRun,
      routing: runtime.routing,
      planning: runtime.planning
    },
    expectedOutput: {
      site_type: "landing",
      pages: [],
      design_system_guidance: { tone: "minimal", layout_principles: [], responsive_notes: [] },
      implementation_notes: []
    },
    agent
  });
}
