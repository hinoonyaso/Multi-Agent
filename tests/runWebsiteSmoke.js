import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPipeline } from "../src/core/orchestrator.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REQUESTS_PATH = path.join(MODULE_DIR, "website.smoke.requests.json");
const RESULTS_DIR = path.join(MODULE_DIR, "results");

async function main() {
  const startedAt = new Date().toISOString();
  const requests = await loadRequests();
  const results = [];

  console.log(`Running ${requests.length} website smoke case(s)...`);

  for (const testCase of requests) {
    const result = await runCase(testCase);
    results.push(result);
    printCaseSummary(result);
  }

  const summary = buildSummary(results, startedAt);
  const summaryPath = await writeSummary(summary);

  printFinalSummary(summary, summaryPath);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

async function loadRequests() {
  const contents = await readFile(REQUESTS_PATH, "utf8");
  const parsed = JSON.parse(contents);

  if (!Array.isArray(parsed)) {
    throw new Error("Smoke request file must contain a JSON array.");
  }

  return parsed;
}

async function runCase(testCase) {
  const startedAt = Date.now();

  try {
    const pipelineResult = await runPipeline({
      userRequest: testCase.userRequest,
      modeHint: testCase.modeHint,
      workingDir: process.cwd()
    });
    const validationOk = pipelineResult?.validation?.ok === true;
    const status = validationOk ? "passed" : "failed";

    return {
      id: testCase.id,
      title: testCase.title,
      modeHint: testCase.modeHint,
      status,
      durationMs: Date.now() - startedAt,
      validationOk,
      mode: pipelineResult?.mode ?? null,
      runId: pipelineResult?.state?.runId ?? null,
      error: validationOk ? null : summarizeValidationErrors(pipelineResult?.validation),
      validation: pipelineResult?.validation ?? null
    };
  } catch (error) {
    return {
      id: testCase.id,
      title: testCase.title,
      modeHint: testCase.modeHint,
      status: "failed",
      durationMs: Date.now() - startedAt,
      validationOk: false,
      mode: null,
      runId: null,
      error: error instanceof Error ? error.message : String(error),
      validation: null
    };
  }
}

function summarizeValidationErrors(validation) {
  const messages = Array.isArray(validation?.errors)
    ? validation.errors
        .map((issue) => issue?.message)
        .filter((message) => typeof message === "string" && message.trim())
    : [];

  if (messages.length === 0) {
    return "Validation failed without reported errors.";
  }

  return messages.join(" | ");
}

function printCaseSummary(result) {
  const label = result.status === "passed" ? "PASS" : "FAIL";
  const suffix = result.error ? ` - ${result.error}` : "";
  console.log(`${label} ${result.id} (${result.durationMs}ms)${suffix}`);
}

function buildSummary(results, startedAt) {
  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.length - passed;

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    total: results.length,
    passed,
    failed,
    results
  };
}

async function writeSummary(summary) {
  await mkdir(RESULTS_DIR, { recursive: true });

  const fileName = `website-smoke-${formatTimestamp(new Date())}.json`;
  const summaryPath = path.join(RESULTS_DIR, fileName);
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;

  await writeFile(summaryPath, serialized, "utf8");

  return summaryPath;
}

function printFinalSummary(summary, summaryPath) {
  console.log(
    `Done: ${summary.passed}/${summary.total} passed, ${summary.failed} failed.`
  );
  console.log(`Summary: ${summaryPath}`);
}

function formatTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Smoke runner failed: ${message}`);
  process.exitCode = 1;
});
