import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUNS_ROOT = path.resolve(MODULE_DIR, "..", "..", "runs");
const STEPS_DIRNAME = "steps";
const SIMPLE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export async function createRunState(initialInput) {
  const createdAt = new Date().toISOString();
  const runId = `${formatTimestamp(createdAt)}-${randomBytes(3).toString("hex")}`;
  const runDir = path.join(RUNS_ROOT, runId);

  await mkdir(path.join(runDir, STEPS_DIRNAME), { recursive: true });

  const runState = {
    runId,
    runDir,
    createdAt,
    updatedAt: createdAt,
    finalizedAt: null,
    input: initialInput ?? null,
    router: null,
    planner: null,
    steps: {},
    validation: null,
    final: null
  };

  await writeJson(path.join(runDir, "input.json"), runState.input);
  await writeRunMeta(runState);

  return runState;
}

export async function saveStep(runState, stepName, data) {
  assertRunState(runState);
  const normalizedStepName = normalizeName(stepName, "step name");
  const fileInfo = getStepFileInfo(normalizedStepName);

  runState.updatedAt = new Date().toISOString();

  if (fileInfo.kind === "router") {
    runState.router = data;
  } else if (fileInfo.kind === "planner") {
    runState.planner = data;
  } else if (fileInfo.kind === "validation") {
    runState.validation = data;
  } else {
    runState.steps[normalizedStepName] = data;
  }

  await writeJson(fileInfo.filePath(runState), data);
  await writeRunMeta(runState);

  return data;
}

export async function loadRunState(runId) {
  const normalizedRunId = normalizeName(runId, "run id");
  const runDir = path.join(RUNS_ROOT, normalizedRunId);
  const meta = await readJson(path.join(runDir, "run.json"));
  const stepsDir = path.join(runDir, STEPS_DIRNAME);

  const state = {
    runId: normalizedRunId,
    runDir,
    createdAt: meta?.createdAt ?? null,
    updatedAt: meta?.updatedAt ?? null,
    finalizedAt: meta?.finalizedAt ?? null,
    input: await readJson(path.join(runDir, "input.json")),
    router: await readOptionalJson(path.join(runDir, "router.json")),
    planner: await readOptionalJson(path.join(runDir, "planner.json")),
    steps: {},
    validation: await readOptionalJson(path.join(runDir, "validation.json")),
    final: await readOptionalJson(path.join(runDir, "final.json"))
  };

  for (const entry of await readdir(stepsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const stepName = entry.name.slice(0, -".json".length);
    state.steps[stepName] = await readJson(path.join(stepsDir, entry.name));
  }

  return state;
}

export async function finalizeRun(runState, finalData) {
  assertRunState(runState);
  const finalizedAt = new Date().toISOString();

  runState.updatedAt = finalizedAt;
  runState.finalizedAt = finalizedAt;
  runState.final = finalData;

  await writeJson(path.join(runState.runDir, "final.json"), finalData);
  await writeRunMeta(runState);

  return finalData;
}

function getStepFileInfo(stepName) {
  if (stepName === "router") {
    return {
      kind: "router",
      filePath(runState) {
        return path.join(runState.runDir, "router.json");
      }
    };
  }

  if (stepName === "planner") {
    return {
      kind: "planner",
      filePath(runState) {
        return path.join(runState.runDir, "planner.json");
      }
    };
  }

  if (stepName === "validation") {
    return {
      kind: "validation",
      filePath(runState) {
        return path.join(runState.runDir, "validation.json");
      }
    };
  }

  return {
    kind: "step",
    filePath(runState) {
      return path.join(runState.runDir, STEPS_DIRNAME, `${stepName}.json`);
    }
  };
}

async function writeRunMeta(runState) {
  const metadata = {
    runId: runState.runId,
    createdAt: runState.createdAt,
    updatedAt: runState.updatedAt,
    finalizedAt: runState.finalizedAt,
    files: {
      input: "input.json",
      router: runState.router === null ? null : "router.json",
      planner: runState.planner === null ? null : "planner.json",
      validation: runState.validation === null ? null : "validation.json",
      final: runState.final === null ? null : "final.json",
      steps: Object.keys(runState.steps)
        .sort()
        .map((stepName) => `${STEPS_DIRNAME}/${stepName}.json`)
    }
  };

  await writeJson(path.join(runState.runDir, "run.json"), metadata);
}

async function writeJson(filePath, data) {
  const serialized = `${JSON.stringify(toSerializable(data), null, 2)}\n`;
  await writeFile(filePath, serialized, "utf8");
}

async function readJson(filePath) {
  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents);
}

async function readOptionalJson(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function toSerializable(value, seen = new WeakSet()) {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return "[Undefined]";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item, seen));
  }

  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([key, entryValue]) => [
        String(key),
        toSerializable(entryValue, seen)
      ])
    );
  }

  if (value instanceof Set) {
    return [...value].map((item) => toSerializable(item, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);

    const result = {};

    for (const [key, entryValue] of Object.entries(value)) {
      result[key] = toSerializable(entryValue, seen);
    }

    seen.delete(value);

    return result;
  }

  return String(value);
}

function formatTimestamp(isoTimestamp) {
  return isoTimestamp.replaceAll(":", "-").replace(".", "-");
}

function normalizeName(value, label) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string.`);
  }

  const normalized = value.trim();

  if (!normalized || !SIMPLE_NAME_PATTERN.test(normalized)) {
    throw new Error(
      `${label} must contain only letters, numbers, underscores, or hyphens.`
    );
  }

  return normalized;
}

function assertRunState(runState) {
  if (!runState || typeof runState !== "object") {
    throw new TypeError("runState must be an object returned by createRunState.");
  }

  if (typeof runState.runId !== "string" || typeof runState.runDir !== "string") {
    throw new TypeError("runState is missing required run metadata.");
  }
}
