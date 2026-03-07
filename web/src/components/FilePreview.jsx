import { useEffect, useMemo, useState } from "react";

const cardStyle = {
  padding: "20px",
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.78)",
  border: "1px solid rgba(31, 41, 51, 0.12)"
};

const layoutStyle = {
  display: "grid",
  gridTemplateColumns: "220px 1fr",
  gap: "16px",
  minHeight: "280px"
};

const listStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "8px",
  maxHeight: "320px",
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
  maxHeight: "320px"
};

export default function FilePreview({ deliverables = [], files = [] }) {
  const previewFiles = useMemo(
    () => normalizePreviewFiles({ deliverables, files }),
    [deliverables, files]
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
                <button
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                  style={{
                    ...buttonStyle,
                    background: file.path === selectedFile?.path ? "#d9e8f5" : "#f8fafc",
                    borderColor:
                      file.path === selectedFile?.path
                        ? "rgba(40, 99, 163, 0.36)"
                        : "rgba(31, 41, 51, 0.12)"
                  }}
                >
                  {file.path}
                </button>
              </li>
            ))}
          </ol>

          <div>
            <p style={{ marginTop: 0, marginBottom: "8px", color: "#52606d" }}>
              {selectedFile?.path ?? "No file selected"}
            </p>
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

  return [...directFiles, ...deliverableFiles]
    .filter((file) => typeof file?.path === "string" && typeof file?.content === "string")
    .map((file) => ({
      path: file.path.trim(),
      content: file.content
    }))
    .filter((file) => file.path);
}
