import { selectModePipeline } from "./router.js";
import { createStateStore } from "./stateStore.js";

export function createOrchestrator() {
  const stateStore = createStateStore();

  return {
    async run(input) {
      const pipeline = selectModePipeline(input.mode);

      stateStore.set("lastRun", {
        mode: input.mode,
        startedAt: new Date().toISOString()
      });

      return pipeline({
        input,
        stateStore
      });
    }
  };
}
