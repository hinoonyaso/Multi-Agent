import { readFile } from "node:fs/promises";
import path from "node:path";

const PROMPTS_ROOT = path.resolve("src/prompts");

export async function loadPrompt(relativePath) {
  const filePath = path.join(PROMPTS_ROOT, relativePath);
  return readFile(filePath, "utf8");
}
