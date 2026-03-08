import { createHash } from "node:crypto";

export function diffFileArtifacts(previousFiles, revisedFiles) {
  const previousMap = toFileMap(previousFiles);
  const revisedMap = toFileMap(revisedFiles);
  const paths = [...new Set([...previousMap.keys(), ...revisedMap.keys()])].sort();

  const addedFiles = [];
  const removedFiles = [];
  const modifiedFiles = [];
  const perFileSummary = [];

  for (const path of paths) {
    const previousFile = previousMap.get(path) ?? null;
    const revisedFile = revisedMap.get(path) ?? null;

    if (!previousFile && revisedFile) {
      const summary = buildAddedFileSummary(revisedFile);

      addedFiles.push(summary);
      perFileSummary.push(summary);
      continue;
    }

    if (previousFile && !revisedFile) {
      const summary = buildRemovedFileSummary(previousFile);

      removedFiles.push(summary);
      perFileSummary.push(summary);
      continue;
    }

    const summary = buildModifiedFileSummary(previousFile, revisedFile);
    perFileSummary.push(summary);

    if (summary.content_changed) {
      modifiedFiles.push(summary);
    }
  }

  return {
    added_files: addedFiles,
    removed_files: removedFiles,
    modified_files: modifiedFiles,
    per_file_summary: perFileSummary
  };
}

function toFileMap(files) {
  const normalizedFiles = normalizeFiles(files);
  return new Map(normalizedFiles.map((file) => [file.path, file]));
}

function normalizeFiles(files) {
  if (!Array.isArray(files)) {
    return [];
  }

  return files
    .map((file) => normalizeFile(file))
    .filter(Boolean)
    .sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeFile(file) {
  if (!isPlainObject(file)) {
    return null;
  }

  const path = normalizeFilePath(file.path);

  if (!path || typeof file.content !== "string") {
    return null;
  }

  const content = file.content;

  return {
    path,
    content,
    content_hash: hashContent(content),
    line_count: countLines(content),
    byte_count: Buffer.byteLength(content, "utf8")
  };
}

function buildAddedFileSummary(file) {
  return {
    path: file.path,
    change_type: "added",
    content_changed: true,
    summary: `Added file '${file.path}'.`,
    stats: {
      previous_line_count: 0,
      revised_line_count: file.line_count,
      line_delta: file.line_count,
      previous_byte_count: 0,
      revised_byte_count: file.byte_count,
      byte_delta: file.byte_count
    }
  };
}

function buildRemovedFileSummary(file) {
  return {
    path: file.path,
    change_type: "removed",
    content_changed: true,
    summary: `Removed file '${file.path}'.`,
    stats: {
      previous_line_count: file.line_count,
      revised_line_count: 0,
      line_delta: -file.line_count,
      previous_byte_count: file.byte_count,
      revised_byte_count: 0,
      byte_delta: -file.byte_count
    }
  };
}

function buildModifiedFileSummary(previousFile, revisedFile) {
  const contentChanged = previousFile.content_hash !== revisedFile.content_hash;
  const lineDelta = revisedFile.line_count - previousFile.line_count;
  const byteDelta = revisedFile.byte_count - previousFile.byte_count;

  return {
    path: revisedFile.path,
    change_type: contentChanged ? "modified" : "unchanged",
    content_changed: contentChanged,
    summary: contentChanged
      ? buildChangedSummary(revisedFile.path, lineDelta, byteDelta)
      : `No content change in '${revisedFile.path}'.`,
    stats: {
      previous_line_count: previousFile.line_count,
      revised_line_count: revisedFile.line_count,
      line_delta: lineDelta,
      previous_byte_count: previousFile.byte_count,
      revised_byte_count: revisedFile.byte_count,
      byte_delta: byteDelta
    }
  };
}

function buildChangedSummary(path, lineDelta, byteDelta) {
  const lineText =
    lineDelta === 0
      ? "line count unchanged"
      : `${Math.abs(lineDelta)} line${Math.abs(lineDelta) === 1 ? "" : "s"} ${lineDelta > 0 ? "added" : "removed"}`;
  const byteText =
    byteDelta === 0
      ? "byte size unchanged"
      : `${Math.abs(byteDelta)} byte${Math.abs(byteDelta) === 1 ? "" : "s"} ${byteDelta > 0 ? "added" : "removed"}`;

  return `Modified file '${path}' (${lineText}; ${byteText}).`;
}

function normalizeFilePath(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\\/g, "/");
}

function countLines(content) {
  if (!content) {
    return 0;
  }

  return content.split("\n").length;
}

function hashContent(content) {
  return createHash("sha1").update(content).digest("hex");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
