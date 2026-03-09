import { STAGE_ORDER } from "./stages/shared.js";
import { listWebsiteRoles } from "./roleRegistry.js";
import { runWebsiteRoleOrchestrator } from "./roleOrchestrator.js";

export async function runWebsiteMode(context = {}) {
  return runWebsiteRoleOrchestrator(context);
}

export const websiteModeStageOrder = STAGE_ORDER;
export const websiteModeRoleOrder = listWebsiteRoles().map((role) => role.id);
