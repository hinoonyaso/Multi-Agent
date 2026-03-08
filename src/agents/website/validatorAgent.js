import { createAgent } from "../schema.js";
import { RETRY_ERROR_TYPES } from "../../core/retryPolicy.js";

export const validatorAgent = createAgent({
  id: "website_validator",
  roleName: "validator",
  promptPath: "roles:validator",
  retryPolicy: {
    [RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT]: 2
  }
});
