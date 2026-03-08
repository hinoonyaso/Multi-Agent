import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(MODULE_DIR, "..");
const PROMPTS_ROOT = path.join(SRC_ROOT, "prompts");
const CONTRACTS_ROOT = path.join(SRC_ROOT, "contracts");
const SIMPLE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export async function loadCoreSystemPrompt() {
  return loadPromptText("core", "system.txt");
}

export async function loadRolePrompt(name) {
  return loadPromptText("roles", `${normalizeName(name, "role name")}.txt`);
}

export async function loadModePrompt(mode, name) {
  return loadPromptText(
    "modes",
    normalizeName(mode, "mode"),
    `${normalizeName(name, "prompt name")}.txt`
  );
}

export async function loadAgentPrompt(agent) {
  if (!agent?.promptPath || typeof agent.promptPath !== "string") {
    return null;
  }

  const parts = agent.promptPath.split(":");
  if (parts.length < 2) {
    return null;
  }

  const [kind, name] = parts;
  if (kind === "roles") {
    return loadRolePrompt(name);
  }

  return loadModePrompt(kind, name);
}

export async function loadContract(mode) {
  const filePath = resolveWithin(
    CONTRACTS_ROOT,
    `${normalizeName(mode, "mode")}.contract.json`
  );
  const contents = await readFile(filePath, "utf8");

  return JSON.parse(contents);
}

async function loadPromptText(...segments) {
  const filePath = resolveWithin(PROMPTS_ROOT, ...segments);
  return readFile(filePath, "utf8");
}

function resolveWithin(root, ...segments) {
  const targetPath = path.resolve(root, ...segments);
  const relativePath = path.relative(root, targetPath);

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Resolved path escapes root: ${targetPath}`);
  }

  return targetPath;
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
