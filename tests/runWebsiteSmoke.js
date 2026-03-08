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
    const revisionOccurred = didRevisionOccur(pipelineResult);
    const revisionTraceExists = hasRevisionTrace(pipelineResult);
    const validatorOutcome = getValidatorOutcome(pipelineResult);
    const overallRunStatus = getOverallRunStatus(pipelineResult, validationOk);
    const readyForCompletion =
      validationOk && overallRunStatus === "ok" && (!revisionOccurred || revisionTraceExists);
    const status = readyForCompletion ? "passed" : "failed";

    return {
      id: testCase.id,
      title: testCase.title,
      modeHint: testCase.modeHint,
      status,
      durationMs: Date.now() - startedAt,
      validationOk,
      readyForCompletion,
      revisionOccurred,
      revisionTraceExists,
      validatorOutcome,
      finalizerDurationMs: pipelineResult?.finalizerTiming?.durationMs ?? null,
      overallRunStatus,
      mode: pipelineResult?.mode ?? null,
      runId: pipelineResult?.state?.runId ?? null,
      error: buildCaseError({
        validationOk,
        revisionOccurred,
        revisionTraceExists,
        overallRunStatus,
        validation: pipelineResult?.validation
      }),
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
      readyForCompletion: false,
      revisionOccurred: false,
      revisionTraceExists: false,
      validatorOutcome: {
        decision: null,
        ok: false,
        errorCount: 0,
        reasons: []
      },
      finalizerDurationMs: null,
      overallRunStatus: "run_failed",
      mode: null,
      runId: null,
      error: error instanceof Error ? error.message : String(error),
      validation: null
    };
  }
}

function didRevisionOccur(pipelineResult) {
  return pipelineResult?.state?.steps?.revision_summary?.triggered === true;
}

function hasRevisionTrace(pipelineResult) {
  return pipelineResult?.state?.steps?.revision_trace != null;
}

function getValidatorOutcome(pipelineResult) {
  const validatorStep = pipelineResult?.state?.steps?.validator;
  const validation = pipelineResult?.validation;
  const reasons = [
    ...normalizeStringArray(validatorStep?.parsed?.reasons),
    ...normalizeValidationMessages(validation)
  ];

  return {
    decision: validatorStep?.parsed?.status ?? validation?.recommendation ?? null,
    ok: validation?.ok === true,
    errorCount: Array.isArray(validation?.errors) ? validation.errors.length : 0,
    reasons: [...new Set(reasons)]
  };
}

function getOverallRunStatus(pipelineResult, validationOk) {
  if (typeof pipelineResult?.status === "string") {
    return pipelineResult.status;
  }

  return validationOk ? "ok" : "validation_failed";
}

function buildCaseError({
  validationOk,
  revisionOccurred,
  revisionTraceExists,
  overallRunStatus,
  validation
}) {
  if (!validationOk) {
    return summarizeValidationErrors(validation);
  }

  if (revisionOccurred && !revisionTraceExists) {
    return "Revision occurred without a persisted revision trace.";
  }

  if (overallRunStatus !== "ok") {
    return `Run status was ${overallRunStatus}.`;
  }

  return null;
}

function summarizeValidationErrors(validation) {
  const messages = normalizeValidationMessages(validation);

  if (messages.length === 0) {
    return "Validation failed without reported errors.";
  }

  return messages.join(" | ");
}

function normalizeValidationMessages(validation) {
  return Array.isArray(validation?.errors)
    ? validation.errors
        .map((issue) => issue?.message)
        .filter((message) => typeof message === "string" && message.trim())
    : [];
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((value) => typeof value === "string" && value.trim());
}

function printCaseSummary(result) {
  const label = result.status === "passed" ? "PASS" : "FAIL";
  const suffix = result.error ? ` - ${result.error}` : "";
  console.log(`${label} ${result.id} (${result.durationMs}ms)${suffix}`);
}

function buildSummary(results, startedAt) {
  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.length - passed;
  const revisedCount = results.filter((result) => result.revisionOccurred).length;
  const missingRevisionTraceCount = results.filter(
    (result) => result.revisionOccurred && !result.revisionTraceExists
  ).length;
  const validationFailedCount = results.filter((result) => !result.validationOk).length;
  const runStatusCounts = countBy(results, (result) => result.overallRunStatus ?? "unknown");
  const readiness = buildCompletionGate(results, {
    failed,
    missingRevisionTraceCount,
    validationFailedCount
  });

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    total: results.length,
    passed,
    failed,
    revisedCount,
    missingRevisionTraceCount,
    validationFailedCount,
    runStatusCounts,
    completionGate: readiness,
    results
  };
}

function buildCompletionGate(results, counts) {
  const blockers = [];

  if (counts.failed > 0) {
    blockers.push(`${counts.failed} smoke case(s) did not satisfy the completion gate`);
  }

  if (counts.validationFailedCount > 0) {
    blockers.push(`${counts.validationFailedCount} case(s) failed validator approval`);
  }

  if (counts.missingRevisionTraceCount > 0) {
    blockers.push(
      `${counts.missingRevisionTraceCount} revised case(s) are missing a persisted revision trace`
    );
  }

  return {
    readyToMoveOn: blockers.length === 0,
    status: blockers.length === 0 ? "ready" : "not_ready",
    blockers,
    evaluatedCases: results.map((result) => ({
      id: result.id,
      ready: result.readyForCompletion,
      revisionOccurred: result.revisionOccurred,
      revisionTraceExists: result.revisionTraceExists,
      validatorDecision: result.validatorOutcome?.decision ?? null,
      overallRunStatus: result.overallRunStatus
    }))
  };
}

function countBy(items, keySelector) {
  const counts = {};

  for (const item of items) {
    const key = keySelector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
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
  console.log(
    `Website completion gate: ${summary.completionGate.status.toUpperCase()}`
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
