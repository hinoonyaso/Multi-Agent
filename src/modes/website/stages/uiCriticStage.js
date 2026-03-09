import {
  getAgent,
  loadAgentPrompt,
  loadModePrompt,
  MODE_NAME,
  STEP_KEYS,
  runWebsiteJsonStage,
  persistWebsiteStep,
  emitStageEvent,
  summarizeCritiqueResult
} from "./shared.js";
import { captureRenderDiagnostics } from "../renderer.js";
import { runLightweightCritic } from "../lightweightCritic.js";
import { resolveAgentForWorker } from "../../../core/workerRegistry.js";

export async function uiCriticNodeRunner(ctx) {
  emitStageEvent(ctx.emit, "ui_critic_started", "ui_critic", "Reviewing first-pass implementation.");
  const { uiCritic, renderDiagnosticsSummary } = await runUiCriticStage(
    {
      ...ctx.runtime,
      assignedWorker: ctx.assignedWorker ?? null
    },
    ctx.architect,
    ctx.firstPass.coder,
    ctx.firstPass.artifactCandidate
  );
  emitStageEvent(ctx.emit, "ui_critic_completed", "ui_critic", summarizeCritiqueResult(uiCritic));
  await persistWebsiteStep(ctx.runtime, STEP_KEYS.uiCritic, uiCritic);
  if (renderDiagnosticsSummary) {
    await persistWebsiteStep(ctx.runtime, "render_diagnostics", renderDiagnosticsSummary);
  }
  return uiCritic;
}

export function buildFollowUpSkipResult(ctx) {
  const lightweight = runLightweightCritic(
    ctx.followUpArtifact,
    ctx.firstPass?.artifactCandidate ?? ctx.artifactCandidate
  );
  const uiCritic = {
    stage: "ui_critic",
    ok: lightweight.final_recommendation === "approve",
    parsed: lightweight
  };
  return { uiCritic, critique: { uiCritic } };
}

async function runUiCriticStage(runtime, architect, coder, artifactCandidate) {
  const assignedAgent = resolveAgentForWorker(runtime.assignedWorker);
  const agent = assignedAgent ?? getAgent("website_ui_critic");
  let prompt = agent ? await loadAgentPrompt(agent) : await loadModePrompt(MODE_NAME, "ui_critic");
  const input = {
    mode: MODE_NAME,
    userRequest: runtime.input.userRequest,
    architecture: architect.parsed,
    implementation: artifactCandidate,
    coder_output: coder.parsed
  };

  const diagnostics = await captureRenderDiagnostics(
    artifactCandidate?.files ?? [],
    artifactCandidate?.output_type ?? "static_html_css_js"
  );

  if (diagnostics.success) {
    input.render_diagnostics = {
      screenshot_base64: diagnostics.screenshotBase64,
      console_errors: diagnostics.consoleErrors,
      mobile_viewport_issues: diagnostics.mobileViewportIssues,
      url: diagnostics.url
    };
    prompt =
      `[RENDER-BASED REVIEW] Actual page render was captured. Use the screenshot (as base64 PNG in render_diagnostics.screenshot_base64), console errors (render_diagnostics.console_errors), and mobile viewport issues (render_diagnostics.mobile_viewport_issues) to evaluate the real rendered UI. Prioritize findings from actual render over code inference.\n\n` +
      prompt;
  }

  const uiCritic = await runWebsiteJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "ui_critic",
    roleName: "website_ui_critic",
    rolePrompt: prompt,
    input,
    expectedOutput: { issues: [], passes: [], final_recommendation: "approve" },
    agent
  });

  const renderDiagnosticsSummary = diagnostics.success
    ? {
        success: true,
        hasScreenshot: Boolean(diagnostics.screenshotBase64),
        consoleErrorCount: diagnostics.consoleErrors?.length ?? 0,
        mobileIssueCount: diagnostics.mobileViewportIssues?.length ?? 0
      }
    : null;

  return {
    uiCritic: renderDiagnosticsSummary
      ? {
          ...uiCritic,
          render_diagnostics_summary: renderDiagnosticsSummary
        }
      : uiCritic,
    renderDiagnosticsSummary
  };
}
