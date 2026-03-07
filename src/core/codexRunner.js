import { spawn } from "node:child_process";

const CODEX_CLI = "codex";
const DEFAULT_MODEL = "gpt-5.4";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const FORCE_COLOR_ARGS = ["--color", "never"];
const STATELESS_ARGS = ["--skip-git-repo-check", "--ephemeral"];
const KILL_GRACE_PERIOD_MS = 5 * 1000;

export async function runCodexAgent({
  model = DEFAULT_MODEL,
  prompt = "",
  cwd = process.cwd(),
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const normalizedPrompt = typeof prompt === "string" ? prompt : safeSerialize(prompt);
  const normalizedCwd = typeof cwd === "string" && cwd.trim() ? cwd : process.cwd();

  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    return createFailureResult(`Invalid timeoutMs: expected a non-negative finite number, received ${String(timeoutMs)}.`);
  }

  if (typeof model !== "string" || !model.trim()) {
    return createFailureResult("Invalid model: expected a non-empty string.");
  }

  return new Promise((resolve) => {
    const stdoutChunks = [];
    const stderrChunks = [];
    let exitCode = null;
    let timedOut = false;
    let settled = false;
    let timeoutId = null;
    let killTimerId = null;

    const child = spawn(
      CODEX_CLI,
      [
        "exec",
        ...FORCE_COLOR_ARGS,
        ...STATELESS_ARGS,
        "--model",
        model,
        "--cd",
        normalizedCwd,
        "-"
      ],
      {
        cwd: normalizedCwd,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      }
    );

    const finalize = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimer(timeoutId);
      clearTimer(killTimerId);

      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      resolve({
        ok: !timedOut && exitCode === 0,
        stdout,
        stderr,
        exitCode,
        timedOut
      });
    };

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });

    child.stdin.on("error", (error) => {
      stderrChunks.push(Buffer.from(formatErrorMessage(error)));
    });

    child.on("error", (error) => {
      stderrChunks.push(Buffer.from(formatErrorMessage(error)));
      finalize();
    });

    child.on("close", (code) => {
      exitCode = typeof code === "number" ? code : null;
      finalize();
    });

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        stderrChunks.push(
          Buffer.from(`Process timed out after ${timeoutMs}ms and was terminated.\n`)
        );

        child.kill("SIGTERM");

        killTimerId = setTimeout(() => {
          if (!settled) {
            child.kill("SIGKILL");
          }
        }, KILL_GRACE_PERIOD_MS);
      }, timeoutMs);
    }

    try {
      child.stdin.end(normalizedPrompt);
    } catch (error) {
      stderrChunks.push(Buffer.from(formatErrorMessage(error)));

      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
  });
}

export function createCodexRunner({ model = DEFAULT_MODEL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const cli = CODEX_CLI;

  return {
    cli,
    model,
    runtime: "local_subprocess",
    async run(request = {}) {
      const selectedModel = request.model ?? model;
      const workingDir = request.cwd ?? request.input?.workingDir ?? process.cwd();
      const prompt = request.prompt ?? buildPrompt(request);
      const result = await runCodexAgent({
        model: selectedModel,
        prompt,
        cwd: workingDir,
        timeoutMs: request.timeoutMs ?? timeoutMs
      });

      return {
        ...result,
        cli,
        model: selectedModel,
        request
      };
    }
  };
}

function buildPrompt(request) {
  const sections = [
    formatSection("Stage", request.stage),
    formatSection("System Prompt", request.systemPrompt),
    formatSection("Role Prompt", request.rolePrompt),
    formatSection("Input", safeSerialize(request.input)),
    formatSection("Expected Output", safeSerialize(request.expectedOutput))
  ].filter(Boolean);

  return sections.join("\n\n").trim();
}

function formatSection(label, value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  return `${label}:\n${String(value)}`;
}

function safeSerialize(value) {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return `[unserializable value: ${formatErrorMessage(error)}]`;
  }
}

function formatErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function createFailureResult(stderr) {
  return {
    ok: false,
    stdout: "",
    stderr,
    exitCode: null,
    timedOut: false
  };
}

function clearTimer(timerId) {
  if (timerId) {
    clearTimeout(timerId);
  }
}
