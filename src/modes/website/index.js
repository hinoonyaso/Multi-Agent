import { createModeRuntime } from "../shared/pipeline.js";
import { executeGraph } from "../../core/graphExecutor.js";
import { WEBSITE_MODE_GRAPH } from "./graph.js";
import { architectNodeRunner } from "./stages/architectStage.js";
import { coderFirstPassNodeRunner } from "./stages/coderStage.js";
import { uiCriticNodeRunner, buildFollowUpSkipResult } from "./stages/uiCriticStage.js";
import { revisionNodeRunner } from "./stages/revisionStage.js";
import { validatorNodeRunner } from "./stages/validatorStage.js";
import {
  sanitizeFollowUpArtifact,
  createModeEventEmitter,
  STAGE_ORDER
} from "./stages/shared.js";

export async function runWebsiteMode(context = {}) {
  const runtime = await createModeRuntime(context);
  const emit = createModeEventEmitter(context.onEvent, runtime);
  const followUpArtifact = sanitizeFollowUpArtifact(runtime.input?.previousArtifact);

  const initialContext = {
    runtime,
    emit,
    followUpArtifact,
    input: runtime.input,
    getSkipResult(nodeId, handlerKey, ctx) {
      if (nodeId === "ui_critic" && handlerKey === "followUp") {
        return buildFollowUpSkipResult(ctx);
      }
      return null;
    }
  };

  const nodeRunners = {
    architect: architectNodeRunner,
    coder_first_pass: coderFirstPassNodeRunner,
    ui_critic: uiCriticNodeRunner,
    revision: revisionNodeRunner,
    validator: validatorNodeRunner
  };

  const finalContext = await executeGraph(WEBSITE_MODE_GRAPH, initialContext, nodeRunners, { emit });

  const validatedRevision =
    finalContext.validatedRevision ??
    (finalContext.followUpArtifact
      ? { finalArtifactCandidate: finalContext.firstPass?.artifactCandidate ?? finalContext.artifactCandidate }
      : null);

  return validatedRevision?.finalArtifactCandidate ?? null;
}

export const websiteModeStageOrder = STAGE_ORDER;
