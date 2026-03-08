import { RETRY_ERROR_TYPES } from "../../core/retryPolicy.js";

/**
 * Default edge condition evaluators for website mode.
 * Used when graph.edgeConditionEvaluators is not provided.
 */
export const defaultEdgeConditionEvaluators = Object.freeze({
  revise: (edge, result) => result?.parsed?.final_recommendation === "revise",
  approve: (edge, result) =>
    result?.parsed?.final_recommendation === "approve" ||
    result?.parsed?.final_recommendation !== "revise",
  contractFailure: (edge, result) => result?.contractFailed === true
});

/**
 * Default skip condition evaluators for website mode.
 */
export const defaultSkipConditionEvaluators = Object.freeze({
  followUp: (node, ctx) => Boolean(ctx?.followUpArtifact)
});

/**
 * Declarative graph for website mode pipeline.
 * Nodes define agents and conditions; edges define flow.
 * The revision runner internally handles validator→coder_repair retry loop.
 */
export const WEBSITE_MODE_GRAPH = Object.freeze({
  nodes: [
    { id: "architect", agentId: "website_architect", contextKey: "architect" },
    {
      id: "coder_first_pass",
      agentId: "website_coder",
      contextMerge: {
        firstPass: "result",
        artifactCandidate: "result.artifactCandidate"
      }
    },
    {
      id: "ui_critic",
      agentId: "website_ui_critic",
      skipCondition: "followUp",
      contextMerge: {
        uiCritic: "result",
        critique: (result) => ({ uiCritic: result })
      }
    },
    {
      id: "revision",
      agentId: "website_coder",
      contextMerge: {
        revision: "result",
        validatedRevision: "result"
      }
    },
    {
      id: "validator",
      agentId: "website_validator",
      contextMerge: {
        validatorResult: "result",
        contractValidation: "result.contractValidation",
        contractFailed: (result) => !result?.contractValidation?.ok
      }
    }
  ],
  edges: [
    { from: "architect", to: "coder_first_pass" },
    { from: "coder_first_pass", to: "ui_critic" },
    { from: "ui_critic", to: "revision" },
    { from: "revision", to: "validator" }
  ],
  retryPolicy: {
    architect: { [RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT]: 2 },
    coder_first_pass: { [RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT]: 2 },
    coder_revision: { [RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT]: 2 },
    ui_critic: { [RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT]: 2 },
    validator: { [RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT]: 2 }
  },
  entryNode: "architect",
  skipHandlers: {
    ui_critic: "followUp"
  },
  edgeConditionEvaluators: defaultEdgeConditionEvaluators,
  skipConditionEvaluators: defaultSkipConditionEvaluators
});
