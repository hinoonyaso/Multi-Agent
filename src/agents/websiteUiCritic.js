import { createAgent } from "./schema.js";
import { RETRY_ERROR_TYPES } from "../core/retryPolicy.js";

export const websiteUiCriticAgent = createAgent({
  id: "website_ui_critic",
  roleName: "website_ui_critic",
  promptPath: "website:ui_critic",
  retryPolicy: {
    [RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT]: 2
  }
});
