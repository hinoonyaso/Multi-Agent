import {
  loadModePrompt,
  loadRolePrompt
} from "../../core/promptLoader.js";
import {
  parseJsonSafely,
  validateOutput
} from "../../core/validator.js";
import {
  createModeRuntime,
  runJsonStage
} from "../shared/pipeline.js";

const MODE_NAME = "docx";
const DEFAULT_OUTPUT_TYPE = "markdown_document";
const STAGE_ORDER = [
  "outline_builder",
  "writer",
  "editor",
  "validator",
  "finalizer"
];

export async function runDocxMode(context = {}) {
  const runtime = await createModeRuntime(context);

  const outlineBuilder = await runOutlineBuilderStage(runtime);
  await runtime.save("outline_builder", outlineBuilder);

  const writer = await runWriterStage(runtime, outlineBuilder);
  await runtime.save("writer", writer);

  const editor = await runEditorStage(runtime, outlineBuilder, writer);
  await runtime.save("editor", editor);

  const artifactCandidate = buildDocxArtifact({
    outline: outlineBuilder.parsed,
    writer: writer.parsed,
    editor: editor.parsed
  });
  const validator = await runValidatorStage(
    runtime,
    outlineBuilder,
    writer,
    editor,
    artifactCandidate
  );
  await runtime.save("validator", validator);

  const finalizer = await runFinalizerStage(runtime, artifactCandidate, validator);
  await runtime.save("finalizer", finalizer);

  return extractFinalArtifact(finalizer.parsed) ?? artifactCandidate;
}

async function runOutlineBuilderStage(runtime) {
  const prompt = await loadModePrompt(MODE_NAME, "outline_builder");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "outline_builder",
    roleName: "docx_outline_builder",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      routing: runtime.routing,
      planning: runtime.planning
    },
    expectedOutput: {
      document_title: "Document Title",
      target_audience: "Primary audience",
      tone: "professional",
      sections: [
        {
          heading: "Overview",
          purpose: "Introduce the document goal.",
          key_points: ["Key point one", "Key point two"]
        }
      ]
    }
  });
}

async function runWriterStage(runtime, outlineBuilder) {
  const prompt = await loadModePrompt(MODE_NAME, "writer");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "writer",
    roleName: "docx_writer",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      routing: runtime.routing,
      planning: runtime.planning,
      approved_outline: outlineBuilder.parsed
    },
    expectedOutput: {
      title: outlineBuilder.parsed?.document_title ?? "Document Title",
      body_markdown: "# Document Title\n\n## Overview\n\nDraft content.",
      notes_for_editor: []
    }
  });
}

async function runEditorStage(runtime, outlineBuilder, writer) {
  const prompt = await loadModePrompt(MODE_NAME, "editor");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "editor",
    roleName: "docx_editor",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      approved_outline: outlineBuilder.parsed,
      draft: writer.parsed
    },
    expectedOutput: {
      edited_body_markdown: writer.parsed?.body_markdown ?? "# Document Title",
      changes_made: [],
      remaining_issues: []
    }
  });
}

async function runValidatorStage(
  runtime,
  outlineBuilder,
  writer,
  editor,
  artifactCandidate
) {
  const prompt = await loadRolePrompt("validator");
  const contractValidation = await validateOutput({
    mode: MODE_NAME,
    output: artifactCandidate
  });
  const validatorDecision = decideRevision({
    outlineBuilder,
    writer,
    editor,
    contractValidation
  });

  const stage = await runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "validator",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      approved_outline: outlineBuilder.parsed,
      draft: writer.parsed,
      edited_draft: editor.parsed,
      implementation: artifactCandidate,
      contract_validation: contractValidation,
      revision_signal: validatorDecision
    },
    expectedOutput: {
      status: validatorDecision.needsRevision ? "revise" : "approve",
      reasons: contractValidation.errors.map((issue) => issue.message),
      next_action: validatorDecision.needsRevision
        ? "Request a targeted revision from the editor stage."
        : "Proceed to final packaging."
    }
  });

  return {
    ...stage,
    contractValidation,
    approval: {
      ok: contractValidation.ok && !validatorDecision.needsRevision,
      recommendation: validatorDecision.needsRevision ? "revise" : "approve"
    },
    revision: {
      ...validatorDecision,
      // TODO: Use retryPolicy plus editor-targeted revisions to resolve
      // contract gaps or structural issues before final packaging.
      nextTargetStage: validatorDecision.needsRevision ? "editor" : null
    }
  };
}

async function runFinalizerStage(runtime, artifactCandidate, validator) {
  const prompt = await loadRolePrompt("finalizer");
  const deliverableName = artifactCandidate.title || "document-artifact";

  const stage = await runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "finalizer",
    roleName: "finalizer",
    rolePrompt: prompt,
    input: {
      userRequest: runtime.input.userRequest,
      selectedMode: MODE_NAME,
      approvedDraft: artifactCandidate,
      validation: {
        contract: validator.contractValidation,
        recommendation: validator.approval
      }
    },
    expectedOutput: {
      final_mode: MODE_NAME,
      deliverables: [
        {
          name: deliverableName,
          type: "content",
          content: JSON.stringify(artifactCandidate, null, 2)
        }
      ],
      delivery_notes: []
    }
  });

  return {
    ...stage,
    artifact: extractFinalArtifact(stage.parsed) ?? artifactCandidate,
    revision: {
      needsRevision: false,
      reasons: [],
      // TODO: Route packaging-only failures back through validator once
      // finalizer outputs receive separate contract checks.
      nextTargetStage: null
    }
  };
}

function buildDocxArtifact({ outline, writer, editor }) {
  const title = normalizeTitle(writer?.title) || normalizeTitle(outline?.document_title);
  const bodyMarkdown = normalizeMarkdown(editor?.edited_body_markdown ?? writer?.body_markdown);
  const sections = buildSectionsFromMarkdown(bodyMarkdown, outline);

  return {
    mode: MODE_NAME,
    output_type: DEFAULT_OUTPUT_TYPE,
    title,
    sections,
    body_markdown: bodyMarkdown,
    target_audience: outline?.target_audience ?? "",
    tone: outline?.tone ?? "",
    notes_for_editor: normalizeStringArray(writer?.notes_for_editor),
    changes_made: normalizeStringArray(editor?.changes_made),
    remaining_issues: normalizeStringArray(editor?.remaining_issues)
  };
}

function buildSectionsFromMarkdown(bodyMarkdown, outline) {
  const sections = [];
  const leadingContent = [];
  let currentSection = null;

  for (const line of splitMarkdownLines(bodyMarkdown)) {
    if (/^#\s+/.test(line)) {
      continue;
    }

    const headingMatch = line.match(/^##+\s+(.+)$/);

    if (headingMatch) {
      if (currentSection && currentSection.content.trim()) {
        sections.push({
          heading: currentSection.heading,
          content: currentSection.content.trim()
        });
      }

      currentSection = {
        heading: headingMatch[1].trim(),
        content: ""
      };

      if (sections.length === 0 && leadingContent.join("\n").trim()) {
        currentSection.content = `${leadingContent.join("\n").trim()}\n\n`;
      }

      continue;
    }

    if (currentSection) {
      currentSection.content += `${line}\n`;
    } else {
      leadingContent.push(line);
    }
  }

  if (currentSection && currentSection.content.trim()) {
    sections.push({
      heading: currentSection.heading,
      content: currentSection.content.trim()
    });
  }

  if (sections.length > 0) {
    return sections;
  }

  const fallbackHeading = outline?.sections?.[0]?.heading ?? "Document Body";
  const fallbackContent = bodyMarkdown.trim();

  if (!fallbackContent) {
    return [];
  }

  return [
    {
      heading: fallbackHeading,
      content: fallbackContent
    }
  ];
}

function splitMarkdownLines(markdown) {
  return typeof markdown === "string" ? markdown.split(/\r?\n/) : [];
}

function normalizeTitle(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMarkdown(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractFinalArtifact(finalizerOutput) {
  if (!finalizerOutput || !Array.isArray(finalizerOutput.deliverables)) {
    return null;
  }

  for (const deliverable of finalizerOutput.deliverables) {
    if (typeof deliverable?.content !== "string") {
      continue;
    }

    const parsed = parseJsonSafely(deliverable.content);

    if (parsed.ok && isDocxArtifact(parsed.value)) {
      return parsed.value;
    }
  }

  return null;
}

function isDocxArtifact(value) {
  return value?.mode === MODE_NAME && typeof value?.title === "string" && Array.isArray(value?.sections);
}

function decideRevision({ outlineBuilder, writer, editor, contractValidation }) {
  const stageInvalid =
    !outlineBuilder.ok ||
    !writer.ok ||
    !editor.ok;
  const hasRemainingIssues = Array.isArray(editor?.parsed?.remaining_issues) &&
    editor.parsed.remaining_issues.length > 0;

  return {
    needsRevision: stageInvalid || hasRemainingIssues || !contractValidation.ok,
    reasons: [
      ...(stageInvalid ? ["draft_stage_output_invalid"] : []),
      ...(hasRemainingIssues ? ["editor_reported_remaining_issues"] : []),
      ...(!contractValidation.ok ? ["docx_contract_validation_failed"] : [])
    ]
  };
}

export const docxModeStageOrder = STAGE_ORDER;
