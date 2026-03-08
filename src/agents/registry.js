import { WEBSITE_AGENTS } from "./website/index.js";

const AGENT_MAP = new Map([
  ...Object.entries(WEBSITE_AGENTS)
]);

const MODE_AGENTS = Object.freeze({
  website: Object.keys(WEBSITE_AGENTS)
});

/**
 * Get an agent by id.
 * @param {string} agentId - e.g. "website_architect"
 * @returns {Object|null} Agent or null if not found
 */
export function getAgent(agentId) {
  if (typeof agentId !== "string" || !agentId.trim()) {
    return null;
  }
  return AGENT_MAP.get(agentId.trim()) ?? null;
}

/**
 * List agent ids for a mode.
 * @param {string} mode - e.g. "website"
 * @returns {string[]} Agent ids for the mode
 */
export function listAgentsByMode(mode) {
  if (typeof mode !== "string" || !mode.trim()) {
    return [];
  }
  return MODE_AGENTS[mode.trim()] ?? [];
}
