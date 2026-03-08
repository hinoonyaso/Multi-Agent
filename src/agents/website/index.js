import { architectAgent } from "./architectAgent.js";
import { coderAgent } from "./coderAgent.js";
import { uiCriticAgent } from "./uiCriticAgent.js";
import { validatorAgent } from "./validatorAgent.js";

export const WEBSITE_AGENTS = Object.freeze({
  website_architect: architectAgent,
  website_coder: coderAgent,
  website_ui_critic: uiCriticAgent,
  website_validator: validatorAgent
});

export { architectAgent, coderAgent, uiCriticAgent, validatorAgent };
