import { useEffect, useMemo, useState } from "react";

const cardStyle = {
  padding: "20px",
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.78)",
  border: "1px solid rgba(31, 41, 51, 0.12)"
};

const layoutStyle = {
  display: "grid",
  gridTemplateColumns: "180px minmax(0, 1fr)",
  gap: "16px",
  minHeight: "520px",
  alignItems: "start"
};

const listStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "8px",
  maxHeight: "520px",
  overflowY: "auto"
};

const buttonStyle = {
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(31, 41, 51, 0.12)",
  background: "#f8fafc",
  color: "#1f2933",
  font: "inherit",
  cursor: "pointer"
};

const fileButtonHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px"
};

const filePathStyle = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};

const changeTagStyle = {
  flexShrink: 0,
  padding: "2px 6px",
  borderRadius: "999px",
  fontSize: "0.72rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em"
};

const fileMetaStyle = {
  marginTop: "6px",
  fontSize: "0.78rem",
  color: "#52606d",
  lineHeight: 1.35
};

const removedBlockStyle = {
  marginTop: "14px",
  padding: "12px 14px",
  borderRadius: "12px",
  background: "rgba(155, 28, 28, 0.05)",
  border: "1px solid rgba(155, 28, 28, 0.12)"
};

const previewStyle = {
  margin: 0,
  padding: "14px",
  borderRadius: "12px",
  background: "#17212b",
  color: "#e5edf5",
  fontFamily: "monospace",
  fontSize: "0.85rem",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflow: "auto",
  maxHeight: "360px"
};

const frameStyle = {
  width: "100%",
  minHeight: "560px",
  border: "1px solid rgba(31, 41, 51, 0.12)",
  borderRadius: "12px",
  background: "#ffffff"
};

export default function FilePreview({ deliverables = [], files = [], revisionTrace = null }) {
  const previewFiles = useMemo(
    () => normalizePreviewFiles({ deliverables, files }),
    [deliverables, files]
  );
  const fileChangeMap = useMemo(
    () => buildFileChangeMap(revisionTrace),
    [revisionTrace]
  );
  const removedFiles = useMemo(
    () => getRemovedFiles(revisionTrace),
    [revisionTrace]
  );
  const renderedPreview = useMemo(
    () => buildRenderedPreview(previewFiles),
    [previewFiles]
  );
  const [selectedPath, setSelectedPath] = useState(previewFiles[0]?.path ?? "");

  useEffect(() => {
    if (!previewFiles.some((file) => file.path === selectedPath)) {
      setSelectedPath(previewFiles[0]?.path ?? "");
    }
  }, [previewFiles, selectedPath]);

  const selectedFile =
    previewFiles.find((file) => file.path === selectedPath) ?? previewFiles[0] ?? null;

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>File Preview</h2>

      {previewFiles.length === 0 ? (
        <p style={{ marginBottom: 0, color: "#52606d" }}>
          No files available for preview.
        </p>
      ) : (
        <div style={layoutStyle}>
          <ol style={listStyle}>
            {previewFiles.map((file) => (
              <li key={file.path}>
                {(() => {
                  const change = fileChangeMap.get(file.path) ?? null;
                  const changeTone = getChangeTone(change?.changeType);

                  return (
                <button
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                  style={{
                    ...buttonStyle,
                    background: file.path === selectedFile?.path ? "#d9e8f5" : "#f8fafc",
                    borderColor:
                      file.path === selectedFile?.path
                        ? "rgba(40, 99, 163, 0.36)"
                        : changeTone.borderColor
                  }}
                >
                  <div style={fileButtonHeaderStyle}>
                    <span style={filePathStyle} title={file.path}>
                      {file.path}
                    </span>
                    {change ? (
                      <span
                        style={{
                          ...changeTagStyle,
                          background: changeTone.background,
                          color: changeTone.color
                        }}
                      >
                        {change.changeType}
                      </span>
                    ) : null}
                  </div>
                  {change?.summary ? (
                    <div style={fileMetaStyle}>{change.summary}</div>
                  ) : null}
                </button>
                  );
                })()}
              </li>
            ))}
          </ol>

          <div>
            <p style={{ marginTop: 0, marginBottom: "8px", color: "#52606d" }}>
              {selectedFile?.path ?? "No file selected"}
            </p>
            {removedFiles.length > 0 ? (
              <div style={removedBlockStyle}>
                <p style={{ margin: "0 0 6px", color: "#9b1c1c", fontWeight: 700 }}>
                  Removed in revision
                </p>
                <p style={{ margin: 0, color: "#7b8794", lineHeight: 1.45 }}>
                  {removedFiles.map((file) => file.identifier).join(", ")}
                </p>
              </div>
            ) : null}
            {renderedPreview ? (
              <>
                <p style={{ marginTop: 0, marginBottom: "8px", color: "#52606d" }}>
                  Rendered Preview
                </p>
                <iframe
                  title="Rendered file preview"
                  srcDoc={renderedPreview}
                  style={frameStyle}
                  sandbox="allow-scripts"
                />
                <p style={{ marginTop: "12px", marginBottom: "8px", color: "#52606d" }}>
                  Source
                </p>
              </>
            ) : null}
            <pre style={previewStyle}>
              {selectedFile?.content ?? "No preview content available."}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}

function normalizePreviewFiles({ deliverables, files }) {
  const directFiles = Array.isArray(files) ? files : [];
  const deliverableFiles = Array.isArray(deliverables)
    ? deliverables.flatMap((item, index) => {
        if (Array.isArray(item?.files)) {
          return item.files;
        }

        if (typeof item?.content === "string") {
          return [
            {
              path: item?.name || `deliverable-${index + 1}.txt`,
              content: item.content
            }
          ];
        }

        return [];
      })
    : [];

  const dedupedFiles = [...directFiles, ...deliverableFiles]
    .filter((file) => typeof file?.path === "string" && typeof file?.content === "string")
    .map((file) => ({
      path: file.path.trim(),
      content: file.content
    }))
    .filter((file) => file.path)
    .reduce((accumulator, file) => {
      if (!accumulator.some((entry) => entry.path === file.path)) {
        accumulator.push(file);
      }

      return accumulator;
    }, []);

  return dedupedFiles;
}

function buildFileChangeMap(revisionTrace) {
  const changedArtifacts = getChangedArtifacts(revisionTrace);

  return changedArtifacts.reduce((result, entry) => {
    if (entry?.artifact_type !== "file" || typeof entry?.identifier !== "string") {
      return result;
    }

    const path = entry.identifier.trim();

    if (!path) {
      return result;
    }

    result.set(path, {
      changeType: typeof entry.change_type === "string" ? entry.change_type : "modified",
      summary: typeof entry.summary === "string" ? entry.summary.trim() : ""
    });

    return result;
  }, new Map());
}

function getRemovedFiles(revisionTrace) {
  return getChangedArtifacts(revisionTrace).filter(
    (entry) => entry?.artifact_type === "file" && entry?.change_type === "removed"
  );
}

function getChangedArtifacts(revisionTrace) {
  if (Array.isArray(revisionTrace?.changed_artifacts)) {
    return revisionTrace.changed_artifacts;
  }

  if (Array.isArray(revisionTrace?.changedFiles)) {
    return revisionTrace.changedFiles.map((entry) => ({
      artifact_type: "file",
      identifier: entry?.identifier,
      change_type: entry?.change_type,
      summary: entry?.summary
    }));
  }

  return [];
}

function buildRenderedPreview(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return null;
  }

  const fileMap = new Map(
    files.map((file) => [normalizeAssetPath(file.path), file.content])
  );
  const htmlFile =
    files.find((file) => file.path.toLowerCase().endsWith(".html")) ?? null;

  if (!htmlFile) {
    return null;
  }

  let html = htmlFile.content;

  html = html.replace(
    /<link\b([^>]*?)href=(["'])([^"']+)\2([^>]*?)>/gi,
    (match, beforeHref, quote, href, afterHref) => {
      const stylesheet = fileMap.get(normalizeAssetPath(href));

      if (!stylesheet) {
        return match;
      }

      const relValue = `${beforeHref} ${afterHref}`.toLowerCase();

      if (!relValue.includes("stylesheet")) {
        return match;
      }

      return `<style data-source="${href}">\n${stylesheet}\n</style>`;
    }
  );

  html = html.replace(
    /<script\b([^>]*?)src=(["'])([^"']+)\2([^>]*)><\/script>/gi,
    (match, beforeSrc, quote, src) => {
      const script = fileMap.get(normalizeAssetPath(src));

      if (!script) {
        return match;
      }

      return `<script data-source="${src}">\n${script}\n</script>`;
    }
  );

  return html;
}

function normalizeAssetPath(path) {
  return String(path || "")
    .trim()
    .replace(/^\.?\//, "")
    .replace(/^\//, "");
}

function getChangeTone(changeType) {
  if (changeType === "added") {
    return {
      background: "rgba(18, 122, 69, 0.14)",
      color: "#0f6b3e",
      borderColor: "rgba(18, 122, 69, 0.24)"
    };
  }

  if (changeType === "removed") {
    return {
      background: "rgba(155, 28, 28, 0.12)",
      color: "#9b1c1c",
      borderColor: "rgba(155, 28, 28, 0.2)"
    };
  }

  if (changeType === "modified") {
    return {
      background: "rgba(194, 120, 3, 0.14)",
      color: "#8d5a00",
      borderColor: "rgba(194, 120, 3, 0.24)"
    };
  }

  return {
    background: "rgba(15, 23, 42, 0.08)",
    color: "#52606d",
    borderColor: "rgba(31, 41, 51, 0.12)"
  };
}
