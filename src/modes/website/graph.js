import { RETRY_ERROR_TYPES } from "../../core/retryPolicy.js";

/**
 * Declarative graph for website mode pipeline.
 * Nodes define agents and conditions; edges define flow.
 * The revision runner internally handles validator→coder_repair retry loop.
 */
export const WEBSITE_MODE_GRAPH = Object.freeze({
  nodes: [
    { id: "architect", agentId: "website_architect" },
    { id: "coder_first_pass", agentId: "website_coder" },
    {
      id: "ui_critic",
      agentId: "website_ui_critic",
      skipCondition: "followUp"
    },
    {
      id: "revision",
      agentId: "website_coder"
    },
    { id: "validator", agentId: "website_validator" }
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
  }
});
