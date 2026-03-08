/**
 * Agent definition schema.
 * Each agent is an executable unit with model, prompt, retry policy, and optional tools/memory.
 */

export const DEFAULT_MODEL = "gpt-5.4";
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
export const DEFAULT_TEMPERATURE = 0;

/**
 * @typedef {Object} AgentConfig
 * @property {string} id - Unique agent id, e.g. "website_architect"
 * @property {string} roleName - Maps to validator ROLE_SPECS
 * @property {string} [model] - Model override (default: gpt-5.4)
 * @property {number} [temperature] - Sampling temperature
 * @property {number} [timeoutMs] - Request timeout
 * @property {string} [promptPath] - Mode/prompt path, e.g. "website:architect" for modes/website/architect.txt
 * @property {Object.<string, number>} [retryPolicy] - ErrorType -> maxAttempts
 * @property {string[]} [tools] - Future tool access
 * @property {Object} [memoryPolicy] - Context window, summarization
 */

/**
 * Creates an agent from config.
 * @param {AgentConfig} config
 * @returns {Object} Agent instance with run(request) and metadata
 */
export function createAgent(config) {
  const {
    id,
    roleName,
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    promptPath,
    retryPolicy = {},
    tools = [],
    memoryPolicy = {}
  } = config;

  if (!id || typeof id !== "string") {
    throw new TypeError("Agent id must be a non-empty string.");
  }

  if (!roleName || typeof roleName !== "string") {
    throw new TypeError("Agent roleName must be a non-empty string.");
  }

  return {
    id,
    roleName,
    model,
    temperature,
    timeoutMs,
    promptPath,
    retryPolicy,
    tools,
    memoryPolicy,

    /**
     * Merge agent config into a Codex run request.
     * @param {Object} request - Partial run request
     * @returns {Object} Request with model/timeout injected
     */
    enrichRequest(request = {}) {
      return {
        ...request,
        model: request.model ?? model,
        timeoutMs: request.timeoutMs ?? timeoutMs
      };
    }
  };
}
