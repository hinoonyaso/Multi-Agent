import { diffFileArtifacts } from "../../core/artifactDiff.js";

const ENTRYPOINT_HTML_PATHS = ["index.html", "main.html", "app.html"];

/**
 * Run a lightweight regression check on changed files for follow-up updates.
 * Uses diff-based analysis rather than full UI critic to catch critical issues.
 *
 * @param {Object} previousArtifact - Previous artifact with files
 * @param {Object} newArtifact - New artifact with files
 * @returns {{ issues: string[], passes: string[], final_recommendation: "approve"|"revise" }}
 */
export function runLightweightCritic(previousArtifact, newArtifact) {
  const issues = [];
  const passes = [];

  if (!previousArtifact?.files?.length || !newArtifact?.files?.length) {
    return {
      issues: ["Cannot perform lightweight critique: missing artifact files."],
      passes: [],
      final_recommendation: "revise"
    };
  }

  const artifactDiff = diffFileArtifacts(previousArtifact.files, newArtifact.files);
  const changedFiles = [
    ...(artifactDiff.modified_files ?? []),
    ...(artifactDiff.added_files ?? []),
    ...(artifactDiff.removed_files ?? [])
  ].filter((f) => f?.content_changed);

  const previousMap = new Map(
    (previousArtifact.files ?? [])
      .filter((f) => f?.path && f?.content != null)
      .map((f) => [f.path, f.content])
  );
  const newMap = new Map(
    (newArtifact.files ?? [])
      .filter((f) => f?.path && f?.content != null)
      .map((f) => [f.path, f.content])
  );

  for (const changed of changedFiles) {
    const path = changed.path ?? changed.file?.path;
    if (!path) continue;

    const content = newMap.get(path) ?? previousMap.get(path) ?? "";
    if (typeof content !== "string") continue;

    checkEntrypointStructure(path, content, changed, previousMap, newMap, issues);
  }

  if (issues.length === 0) {
    passes.push("Lightweight critique: no critical layout or structure regressions detected in changed files.");
    return {
      issues: [],
      passes,
      final_recommendation: "approve"
    };
  }

  return {
    issues,
    passes,
    final_recommendation: "revise"
  };
}

function checkEntrypointStructure(path, content, changed, previousMap, newMap, issues) {
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase();
  const isEntrypoint = ENTRYPOINT_HTML_PATHS.some((p) => normalizedPath.endsWith(p));

  if (!isEntrypoint || !content) return;

  const previousContent = previousMap.get(path) ?? "";
  if (typeof previousContent !== "string") return;

  const hadBody = /<body[^>]*>[\s\S]*<\/body>/i.test(previousContent);
  const hasBody = /<body[^>]*>[\s\S]*<\/body>/i.test(content);

  if (hadBody && !hasBody) {
    issues.push(`${path}: Entrypoint HTML lost body structure.`);
  }

  const bodyContent = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyContent && bodyContent[1].trim().length < 10) {
    issues.push(`${path}: Entrypoint HTML body appears nearly empty.`);
  }
}
