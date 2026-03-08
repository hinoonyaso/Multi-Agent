import { createAgent } from "./schema.js";
import { RETRY_ERROR_TYPES } from "../core/retryPolicy.js";

export const websiteArchitectAgent = createAgent({
  id: "website_architect",
  roleName: "website_architect",
  promptPath: "website:architect",
  retryPolicy: {
    [RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT]: 2
  }
});
