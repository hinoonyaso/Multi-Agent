import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(MODULE_DIR, "results");

async function main() {
  const summaryPath = await resolveSummaryPath(process.argv[2]);
  const summary = await loadSummary(summaryPath);
  const report = buildReport(summary, summaryPath);

  console.log(report);
}

async function resolveSummaryPath(inputPath) {
  if (inputPath) {
    return path.resolve(process.cwd(), inputPath);
  }

  const entries = await readdir(RESULTS_DIR, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith("website-smoke-"))
    .map((entry) => entry.name)
    .sort();

  const latest = candidates.at(-1);

  if (!latest) {
    throw new Error(`No website smoke summaries found in ${RESULTS_DIR}`);
  }

  return path.join(RESULTS_DIR, latest);
}

async function loadSummary(summaryPath) {
  const contents = await readFile(summaryPath, "utf8");
  return JSON.parse(contents);
}

function buildReport(summary, summaryPath) {
  const total = Number(summary?.total ?? 0);
  const passed = Number(summary?.passed ?? 0);
  const failed = Number(summary?.failed ?? 0);
  const revisedCount = Number(summary?.revisedCount ?? 0);
  const missingRevisionTraceCount = Number(summary?.missingRevisionTraceCount ?? 0);
  const validationFailedCount = Number(summary?.validationFailedCount ?? 0);
  const completionGate = normalizeCompletionGate(summary, {
    failed,
    validationFailedCount,
    missingRevisionTraceCount
  });
  const results = Array.isArray(summary?.results) ? summary.results : [];
  const finalizerTimings = results
    .map((result) => result?.finalizerDurationMs)
    .filter((value) => Number.isFinite(value));

  const successRate = total === 0 ? "n/a" : formatPercent(passed / total);
  const revisionCoverage =
    revisedCount === 0
      ? "n/a (no revisions occurred)"
      : formatPercent((revisedCount - missingRevisionTraceCount) / revisedCount);
  const validatorReliability =
    total === 0 ? "n/a" : formatPercent((total - validationFailedCount) / total);
  const finalizerTimingSummary = summarizeTimings(finalizerTimings);
  const recommendation = completionGate.readyToMoveOn === true ? "READY" : "NOT READY";
  const blockers = Array.isArray(completionGate.blockers) ? completionGate.blockers : [];

  return [
    "Website Completion Report",
    `Summary file: ${summaryPath}`,
    "",
    "Success Rate",
    `- Passed: ${passed}/${total} (${successRate})`,
    `- Failed: ${failed}`,
    "",
    "Revision Observability Coverage",
    `- Revised runs: ${revisedCount}`,
    `- Revised runs with trace: ${Math.max(0, revisedCount - missingRevisionTraceCount)}/${revisedCount}`,
    `- Coverage: ${revisionCoverage}`,
    "",
    "Validator Reliability",
    `- Validator-approved runs: ${total - validationFailedCount}/${total} (${validatorReliability})`,
    `- Validator failures: ${validationFailedCount}`,
    "",
    "Finalizer Timing",
    `- Runs with timing: ${finalizerTimingSummary.count}/${total}`,
    `- Avg duration: ${finalizerTimingSummary.average}`,
    `- Min duration: ${finalizerTimingSummary.min}`,
    `- Max duration: ${finalizerTimingSummary.max}`,
    "",
    "Recommendation",
    `- ${recommendation}`,
    ...formatBlockers(blockers)
  ].join("\n");
}

function summarizeTimings(values) {
  if (values.length === 0) {
    return {
      count: 0,
      average: "n/a",
      min: "n/a",
      max: "n/a"
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    count: values.length,
    average: formatDuration(total / values.length),
    min: formatDuration(Math.min(...values)),
    max: formatDuration(Math.max(...values))
  };
}

function normalizeCompletionGate(summary, counts) {
  const gate = summary?.completionGate;

  if (gate && typeof gate === "object") {
    return {
      readyToMoveOn: gate.readyToMoveOn === true,
      blockers: Array.isArray(gate.blockers) ? gate.blockers : []
    };
  }

  const blockers = [];

  if (counts.failed > 0) {
    blockers.push(`${counts.failed} smoke case(s) failed`);
  }

  if (counts.validationFailedCount > 0) {
    blockers.push(`${counts.validationFailedCount} case(s) failed validation`);
  }

  if (counts.missingRevisionTraceCount > 0) {
    blockers.push(`${counts.missingRevisionTraceCount} revised case(s) missing revision trace`);
  }

  return {
    readyToMoveOn: blockers.length === 0,
    blockers
  };
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(value) {
  return `${Math.round(value)}ms`;
}

function formatBlockers(blockers) {
  if (blockers.length === 0) {
    return ["- No blockers recorded."];
  }

  return blockers.map((blocker) => `- ${blocker}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Website completion report failed: ${message}`);
  process.exitCode = 1;
});
