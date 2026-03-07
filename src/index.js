import { runPipeline } from "./core/orchestrator.js";
import { startServer } from "./server/app.js";

const USAGE = [
  "Usage:",
  "  node src/index.js serve",
  "  node src/index.js [--mode <mode>] <request>"
].join("\n");

async function main() {
  const command = parseArgs(process.argv.slice(2));

  if (command.help) {
    console.log(USAGE);
    return;
  }

  if (command.kind === "serve") {
    startServer();
    return;
  }

  const result = await runPipeline({
    userRequest: command.userRequest,
    modeHint: command.modeHint
  });
  console.log(formatSummary(result));
}

function parseArgs(args) {
  if (args.length === 0) {
    throw new Error(`Missing request text.\n${USAGE}`);
  }

  if (args[0] === "--help" || args[0] === "-h") {
    return { help: true, kind: "help" };
  }

  if (args[0] === "serve") {
    return { help: false, kind: "serve" };
  }

  const requestParts = [];
  let modeHint = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      return { help: true, kind: "help" };
    }

    if (arg === "--mode") {
      modeHint = args[index + 1];
      index += 1;

      if (!modeHint || modeHint.startsWith("--")) {
        throw new Error("Missing value for --mode.");
      }

      continue;
    }

    if (arg.startsWith("--mode=")) {
      modeHint = arg.slice("--mode=".length).trim();

      if (!modeHint) {
        throw new Error("Missing value for --mode.");
      }

      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    requestParts.push(arg);
  }

  const userRequest = requestParts.join(" ").trim();

  if (!userRequest) {
    throw new Error(`Missing request text.\n${USAGE}`);
  }

  return {
    help: false,
    kind: "run",
    modeHint,
    userRequest
  };
}

function formatSummary(result) {
  const validationErrors = result?.validation?.errors?.length ?? 0;
  const parts = [
    `status=${result?.status ?? "unknown"}`,
    result?.mode ? `mode=${result.mode}` : null,
    result?.state?.runId ? `run=${result.state.runId}` : null,
    `validationErrors=${validationErrors}`
  ].filter(Boolean);

  return parts.join(" ");
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
