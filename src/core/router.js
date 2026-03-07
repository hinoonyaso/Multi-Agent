import { runWebsiteMode } from "../modes/website/index.js";
import { runDocxMode } from "../modes/docx/index.js";
import { runSlideMode } from "../modes/slide/index.js";
import { runSheetMode } from "../modes/sheet/index.js";
import { runDeepResearchMode } from "../modes/deep_research/index.js";

const MODE_PIPELINES = {
  website: runWebsiteMode,
  docx: runDocxMode,
  slide: runSlideMode,
  sheet: runSheetMode,
  deep_research: runDeepResearchMode
};

export function selectModePipeline(mode) {
  return MODE_PIPELINES[mode] ?? unsupportedMode;
}

async function unsupportedMode({ input }) {
  return {
    status: "unsupported_mode",
    mode: input.mode,
    message: "Mode routing is not implemented for this value yet."
  };
}
