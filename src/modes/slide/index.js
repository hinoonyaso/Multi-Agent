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

const MODE_NAME = "slide";
const DEFAULT_OUTPUT_TYPE = "structured_slides_json";
const STAGE_ORDER = [
  "strategist",
  "writer",
  "consistency_checker",
  "validator",
  "finalizer"
];

export async function runSlideMode(context = {}) {
  const runtime = await createModeRuntime(context);

  const strategist = await runStrategistStage(runtime);
  await runtime.save("strategist", strategist);

  const writer = await runWriterStage(runtime, strategist);
  await runtime.save("writer", writer);

  const artifactCandidate = buildSlideArtifact({
    strategist: strategist.parsed,
    writer: writer.parsed
  });
  const consistencyChecker = await runConsistencyCheckerStage(
    runtime,
    strategist,
    writer,
    artifactCandidate
  );
  await runtime.save("consistency_checker", consistencyChecker);

  const validator = await runValidatorStage(
    runtime,
    strategist,
    writer,
    consistencyChecker,
    artifactCandidate
  );
  await runtime.save("validator", validator);

  const finalizer = await runFinalizerStage(runtime, artifactCandidate, validator);
  await runtime.save("finalizer", finalizer);

  return extractFinalArtifact(finalizer.parsed) ?? artifactCandidate;
}

async function runStrategistStage(runtime) {
  const prompt = await loadModePrompt(MODE_NAME, "strategist");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "strategist",
    roleName: "slide_strategist",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      routing: runtime.routing,
      planning: runtime.planning
    },
    expectedOutput: {
      presentation_title: "Presentation Title",
      audience: "Primary audience",
      core_message: "Main takeaway",
      slides: [
        {
          slide_number: 1,
          slide_title: "Opening takeaway",
          slide_goal: "Orient the audience to the presentation.",
          key_points: ["Context", "What matters now"],
          suggested_visual: "stat callout"
        }
      ]
    }
  });
}

async function runWriterStage(runtime, strategist) {
  const prompt = await loadModePrompt(MODE_NAME, "writer");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "writer",
    roleName: "slide_writer",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      routing: runtime.routing,
      planning: runtime.planning,
      approved_strategy: strategist.parsed
    },
    expectedOutput: {
      slides: [
        {
          slide_number: 1,
          title: strategist.parsed?.slides?.[0]?.slide_title ?? "Opening takeaway",
          bullets: ["Bullet one", "Bullet two", "Bullet three"],
          speaker_note: ""
        }
      ]
    }
  });
}

async function runConsistencyCheckerStage(
  runtime,
  strategist,
  writer,
  artifactCandidate
) {
  const prompt = await loadRolePrompt("critic");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "consistency_checker",
    roleName: "critic",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      approved_strategy: strategist.parsed,
      draft_deck: writer.parsed,
      implementation: artifactCandidate
    },
    expectedOutput: {
      critical_issues: [],
      minor_issues: [],
      approved_if_fixed: true
    }
  });
}

async function runValidatorStage(
  runtime,
  strategist,
  writer,
  consistencyChecker,
  artifactCandidate
) {
  const prompt = await loadRolePrompt("validator");
  const contractValidation = await validateOutput({
    mode: MODE_NAME,
    output: artifactCandidate
  });
  const validatorDecision = decideRevision({
    strategist,
    writer,
    consistencyChecker,
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
      approved_strategy: strategist.parsed,
      draft_deck: writer.parsed,
      review: consistencyChecker.parsed,
      implementation: artifactCandidate,
      contract_validation: contractValidation,
      revision_signal: validatorDecision
    },
    expectedOutput: {
      status: validatorDecision.needsRevision ? "revise" : "approve",
      reasons: contractValidation.errors.map((issue) => issue.message),
      next_action: validatorDecision.needsRevision
        ? "Request a targeted revision from the writer stage."
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
      // TODO: Use retryPolicy plus writer-targeted revisions to resolve
      // critical deck consistency issues before final packaging.
      nextTargetStage: validatorDecision.needsRevision ? "writer" : null
    }
  };
}

async function runFinalizerStage(runtime, artifactCandidate, validator) {
  const prompt = await loadRolePrompt("finalizer");
  const deliverableName = artifactCandidate.title || "slide-deck-artifact";

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

function buildSlideArtifact({ strategist, writer }) {
  const title = normalizeString(strategist?.presentation_title);
  const slides = mergeSlides({
    strategySlides: strategist?.slides,
    writtenSlides: writer?.slides
  });

  return {
    mode: MODE_NAME,
    output_type: DEFAULT_OUTPUT_TYPE,
    title,
    slides,
    audience: normalizeString(strategist?.audience),
    core_message: normalizeString(strategist?.core_message)
  };
}

function mergeSlides({ strategySlides, writtenSlides }) {
  if (!Array.isArray(writtenSlides)) {
    return [];
  }

  const strategyByNumber = new Map(
    (Array.isArray(strategySlides) ? strategySlides : [])
      .filter((slide) => Number.isInteger(slide?.slide_number))
      .map((slide) => [slide.slide_number, slide])
  );

  return writtenSlides
    .filter((slide) => Number.isInteger(slide?.slide_number))
    .map((slide) => {
      const strategy = strategyByNumber.get(slide.slide_number) ?? {};
      const bullets = normalizeStringArray(slide?.bullets);

      return {
        slide_number: slide.slide_number,
        title: normalizeString(slide?.title) || normalizeString(strategy?.slide_title),
        content: bullets.join("\n"),
        bullets,
        speaker_note: normalizeString(slide?.speaker_note),
        slide_goal: normalizeString(strategy?.slide_goal),
        suggested_visual: normalizeString(strategy?.suggested_visual)
      };
    })
    .filter((slide) => slide.title && slide.content);
}

function normalizeString(value) {
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

    if (parsed.ok && isSlideArtifact(parsed.value)) {
      return parsed.value;
    }
  }

  return null;
}

function isSlideArtifact(value) {
  return value?.mode === MODE_NAME && typeof value?.title === "string" && Array.isArray(value?.slides);
}

function decideRevision({
  strategist,
  writer,
  consistencyChecker,
  contractValidation
}) {
  const stageInvalid = !strategist.ok || !writer.ok || !consistencyChecker.ok;
  const criticalIssues = Array.isArray(consistencyChecker?.parsed?.critical_issues)
    ? consistencyChecker.parsed.critical_issues.length
    : 0;

  return {
    needsRevision: stageInvalid || criticalIssues > 0 || !contractValidation.ok,
    reasons: [
      ...(stageInvalid ? ["slide_stage_output_invalid"] : []),
      ...(criticalIssues > 0 ? ["consistency_checker_found_critical_issues"] : []),
      ...(!contractValidation.ok ? ["slide_contract_validation_failed"] : [])
    ]
  };
}

export const slideModeStageOrder = STAGE_ORDER;
