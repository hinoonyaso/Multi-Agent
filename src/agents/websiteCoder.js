import { createAgent } from "./schema.js";
import { RETRY_ERROR_TYPES } from "../core/retryPolicy.js";

export const websiteCoderAgent = createAgent({
  id: "website_coder",
  roleName: "website_coder",
  promptPath: "website:coder",
  retryPolicy: {
    [RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT]: 2,
    [RETRY_ERROR_TYPES.CONTRACT_VALIDATION_FAILURE]: 2
  }
});
