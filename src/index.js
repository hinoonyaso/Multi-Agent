import { createOrchestrator } from "./core/orchestrator.js";

async function main() {
  const mode = process.argv[2] ?? "website";
  const task = process.argv.slice(3).join(" ") || "Placeholder task";

  const orchestrator = createOrchestrator();
  const result = await orchestrator.run({ mode, task });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Skeleton execution failed:", error.message);
  process.exitCode = 1;
});
