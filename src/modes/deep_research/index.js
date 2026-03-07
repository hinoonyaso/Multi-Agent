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

const MODE_NAME = "deep_research";
const DEFAULT_OUTPUT_TYPE = "structured_research_json";
const STAGE_ORDER = [
  "query_planner",
  "researcher",
  "synthesizer",
  "citation_checker",
  "validator",
  "finalizer"
];

export async function runDeepResearchMode(context = {}) {
  const runtime = await createModeRuntime(context);
  const loopState = createResearchLoopState(runtime);

  const queryPlanner = await runQueryPlannerStage(runtime, loopState);
  await runtime.save("query_planner", queryPlanner);

  const researcher = await runResearcherStage(runtime, queryPlanner, loopState);
  await runtime.save("researcher", researcher);

  const synthesizer = await runSynthesizerStage(
    runtime,
    queryPlanner,
    researcher,
    loopState
  );
  await runtime.save("synthesizer", synthesizer);

  const artifactCandidate = buildResearchArtifact({
    input: runtime.input,
    queryPlanner: queryPlanner.parsed,
    researcher: researcher.parsed,
    synthesizer: synthesizer.parsed
  });
  const citationChecker = await runCitationCheckerStage(
    runtime,
    queryPlanner,
    researcher,
    synthesizer,
    artifactCandidate,
    loopState
  );
  await runtime.save("citation_checker", citationChecker);

  const validator = await runValidatorStage(
    runtime,
    queryPlanner,
    researcher,
    synthesizer,
    citationChecker,
    artifactCandidate,
    loopState
  );
  await runtime.save("validator", validator);

  const finalizer = await runFinalizerStage(runtime, artifactCandidate, validator, loopState);
  await runtime.save("finalizer", finalizer);

  return extractFinalArtifact(finalizer.parsed) ?? artifactCandidate;
}

async function runQueryPlannerStage(runtime, loopState) {
  const prompt = await loadModePrompt(MODE_NAME, "query_planner");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "query_planner",
    roleName: "deep_research_query_planner",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      routing: runtime.routing,
      planning: runtime.planning,
      loop: loopState
    },
    expectedOutput: {
      research_goal: runtime.input.userRequest ?? "Research goal",
      sub_questions: [
        {
          question: "What is the core factual question to answer?",
          question_type: "factual",
          required_evidence: ["Primary-source confirmation"]
        }
      ],
      evidence_plan: ["Collect authoritative evidence for each sub-question."]
    }
  });
}

async function runResearcherStage(runtime, queryPlanner, loopState) {
  const prompt = await loadRolePrompt("researcher");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "researcher",
    roleName: "researcher",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      approved_query_plan: queryPlanner.parsed,
      loop: loopState
    },
    expectedOutput: {
      research_summary: [
        {
          topic: "Evidence topic",
          key_findings: ["Confirmed fact or explicitly labeled assumption."],
          constraints_or_implications: ["Why this evidence matters downstream."]
        }
      ],
      unresolved_gaps: [],
      recommendations_for_next_stage: []
    }
  });
}

async function runSynthesizerStage(runtime, queryPlanner, researcher, loopState) {
  const prompt = await loadModePrompt(MODE_NAME, "synthesizer");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "synthesizer",
    roleName: "deep_research_synthesizer",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      approved_query_plan: queryPlanner.parsed,
      research_handoff: researcher.parsed,
      loop: loopState
    },
    expectedOutput: {
      executive_summary: "Best-supported short answer.",
      key_findings: [
        {
          claim: "Supported claim",
          support: ["Evidence statement"],
          confidence: "medium"
        }
      ],
      conflicts_or_uncertainties: [],
      recommended_conclusion: "Best-supported conclusion."
    }
  });
}

async function runCitationCheckerStage(
  runtime,
  queryPlanner,
  researcher,
  synthesizer,
  artifactCandidate,
  loopState
) {
  const prompt = await loadModePrompt(MODE_NAME, "citation_checker");

  return runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "citation_checker",
    roleName: "deep_research_citation_checker",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      approved_query_plan: queryPlanner.parsed,
      research_handoff: researcher.parsed,
      synthesized_report: synthesizer.parsed,
      implementation: artifactCandidate,
      loop: loopState
    },
    expectedOutput: {
      unsupported_or_weak_claims: [],
      coverage_assessment: "Broadly supported with no material citation gaps.",
      final_recommendation: "approve"
    }
  });
}

async function runValidatorStage(
  runtime,
  queryPlanner,
  researcher,
  synthesizer,
  citationChecker,
  artifactCandidate,
  loopState
) {
  const prompt = await loadRolePrompt("validator");
  const contractValidation = await validateOutput({
    mode: MODE_NAME,
    output: artifactCandidate
  });
  const revisionSignal = decideRevision({
    researcher,
    synthesizer,
    citationChecker,
    contractValidation,
    loopState
  });

  const stage = await runJsonStage({
    runtime,
    modeName: MODE_NAME,
    stageName: "validator",
    rolePrompt: prompt,
    input: {
      mode: MODE_NAME,
      userRequest: runtime.input.userRequest,
      approved_query_plan: queryPlanner.parsed,
      research_handoff: researcher.parsed,
      synthesized_report: synthesizer.parsed,
      citation_review: citationChecker.parsed,
      research_artifact: artifactCandidate,
      contract_validation: contractValidation,
      revision_signal: revisionSignal,
      loop: loopState
    },
    expectedOutput: {
      status: revisionSignal.needsRevision ? "revise" : "approve",
      reasons: contractValidation.errors.map((issue) => issue.message),
      next_action: revisionSignal.needsRevision
        ? "Request another research or synthesis pass before packaging."
        : "Proceed to final packaging."
    }
  });

  return {
    ...stage,
    contractValidation,
    approval: {
      ok: contractValidation.ok && !revisionSignal.needsRevision,
      recommendation: revisionSignal.needsRevision ? "revise" : "approve"
    },
    loop: {
      ...loopState,
      // TODO: When iterative loops are enabled, increment the iteration and
      // re-enter the pipeline at revisionSignal.nextTargetStage.
      nextTargetStage: revisionSignal.needsRevision ? revisionSignal.nextTargetStage : null,
      canIterate: loopState.iteration < loopState.maxIterations
    },
    revision: revisionSignal
  };
}

async function runFinalizerStage(runtime, artifactCandidate, validator, loopState) {
  const prompt = await loadRolePrompt("finalizer");
  const deliverableName = artifactCandidate.topic || "research-artifact";

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
      },
      loop: loopState
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
      // TODO: Validate packaged research output independently if finalizer
      // starts transforming the artifact instead of wrapping it directly.
      nextTargetStage: null
    }
  };
}

function createResearchLoopState(runtime) {
  const configuredMax = runtime.input.maxResearchIterations ?? runtime.retryPolicy?.maxAttempts ?? 1;
  const maxIterations = Number.isFinite(configuredMax) && configuredMax > 0
    ? Math.floor(configuredMax)
    : 1;

  return {
    iteration: 1,
    maxIterations,
    // TODO: Replace this placeholder with accumulated loop feedback once the
    // mode supports iterative re-search and re-synthesis passes.
    priorRevisionNotes: []
  };
}

function buildResearchArtifact({ input, queryPlanner, researcher, synthesizer }) {
  const topic =
    normalizeString(queryPlanner?.research_goal) ||
    normalizeString(input?.topic) ||
    normalizeString(input?.userRequest);
  const findingBundle = buildFindingsBundle(researcher, synthesizer);
  const sources = findingBundle.sources.length > 0
    ? findingBundle.sources
    : normalizeSourceList(input?.sources);
  const finalSynthesis = buildFinalSynthesisText(synthesizer);

  return {
    mode: MODE_NAME,
    output_type: DEFAULT_OUTPUT_TYPE,
    topic,
    executive_summary: normalizeString(synthesizer?.executive_summary),
    findings: findingBundle.findings,
    final_synthesis: finalSynthesis,
    sources,
    research_goal: normalizeString(queryPlanner?.research_goal),
    sub_questions: normalizeSubQuestions(queryPlanner?.sub_questions),
    evidence_plan: normalizeStringArray(queryPlanner?.evidence_plan),
    unresolved_gaps: normalizeStringArray(researcher?.unresolved_gaps),
    conflicts_or_uncertainties: normalizeStringArray(synthesizer?.conflicts_or_uncertainties),
    recommendations_for_next_stage: normalizeStringArray(
      researcher?.recommendations_for_next_stage
    )
  };
}

function buildFindingsBundle(researcher, synthesizer) {
  const sourceRegistry = new Map();
  const findings = [];
  const synthesizedFindings = Array.isArray(synthesizer?.key_findings)
    ? synthesizer.key_findings
    : [];

  synthesizedFindings.forEach((finding, index) => {
    const normalizedFinding = normalizeSynthesizedFinding(finding, index, sourceRegistry);

    if (normalizedFinding) {
      findings.push(normalizedFinding);
    }
  });

  const researchTopics = Array.isArray(researcher?.research_summary)
    ? researcher.research_summary
    : [];

  if (findings.length === 0) {
    researchTopics.forEach((topic, index) => {
      const fallbackFinding = normalizeResearchTopicAsFinding(topic, index, sourceRegistry);

      if (fallbackFinding) {
        findings.push(fallbackFinding);
      }
    });
  } else {
    researchTopics.forEach((topic) => registerSourcesFromResearchTopic(topic, sourceRegistry));
  }

  return {
    findings,
    sources: [...sourceRegistry.values()]
  };
}

function normalizeSynthesizedFinding(finding, index, sourceRegistry) {
  if (!finding || typeof finding !== "object") {
    return null;
  }

  const citations = normalizeCitationIds(finding.citations ?? finding.citation_refs);
  const embeddedSources = normalizeSourceList(finding.sources);

  embeddedSources.forEach((source) => {
    sourceRegistry.set(source.id, source);
  });

  const support = normalizeSupportEntries(finding.support);

  support.forEach((entry) => {
    normalizeSourceList(entry.sources).forEach((source) => {
      sourceRegistry.set(source.id, source);
    });
  });

  return {
    id: `finding_${index + 1}`,
    claim: normalizeString(finding.claim),
    support,
    confidence: normalizeString(finding.confidence),
    citations
  };
}

function normalizeResearchTopicAsFinding(topic, index, sourceRegistry) {
  if (!topic || typeof topic !== "object") {
    return null;
  }

  const evidenceEntries = normalizeSupportEntries(topic.evidence ?? topic.key_findings);
  normalizeSourceList(topic.sources).forEach((source) => {
    sourceRegistry.set(source.id, source);
  });

  const claim =
    normalizeString(topic.claim) ||
    normalizeString(topic.topic) ||
    `Finding ${index + 1}`;

  return {
    id: `finding_${index + 1}`,
    claim,
    support: evidenceEntries,
    confidence: normalizeString(topic.confidence) || "medium",
    citations: normalizeCitationIds(topic.citations)
  };
}

function registerSourcesFromResearchTopic(topic, sourceRegistry) {
  normalizeSourceList(topic?.sources).forEach((source) => {
    sourceRegistry.set(source.id, source);
  });
}

function normalizeSupportEntries(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          evidence: entry.trim(),
          citations: extractCitationIdsFromText(entry)
        };
      }

      if (entry && typeof entry === "object") {
        const sourceNote = normalizeString(entry.source_note);

        return {
          evidence:
            normalizeString(entry.evidence) ||
            normalizeString(entry.text) ||
            normalizeString(entry.finding),
          citations: normalizeCitationIds(entry.citations ?? entry.citation_refs),
          ...(sourceNote ? { source_note: sourceNote } : {})
        };
      }

      return null;
    })
    .filter((entry) => entry?.evidence);
}

function normalizeSubQuestions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      question: normalizeString(entry.question),
      question_type: normalizeString(entry.question_type),
      required_evidence: normalizeStringArray(entry.required_evidence)
    }))
    .filter((entry) => entry.question);
}

function normalizeSourceList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((source, index) => normalizeSource(source, index))
    .filter(Boolean);
}

function normalizeSource(source, index) {
  if (typeof source === "string") {
    const id = `source_${index + 1}`;

    return {
      id,
      title: source.trim()
    };
  }

  if (!source || typeof source !== "object") {
    return null;
  }

  const id =
    normalizeString(source.id) ||
    normalizeString(source.source_id) ||
    `source_${index + 1}`;
  const title =
    normalizeString(source.title) ||
    normalizeString(source.name) ||
    normalizeString(source.url);

  if (!title) {
    return null;
  }

  return {
    id,
    title,
    authoring_entity: normalizeString(source.authoring_entity),
    publication_name: normalizeString(source.publication_name),
    url: normalizeString(source.url),
    date: normalizeString(source.date)
  };
}

function normalizeCitationIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractCitationIdsFromText(text) {
  if (typeof text !== "string") {
    return [];
  }

  const matches = text.match(/\[([^[\]]+)\]/g) ?? [];

  return matches
    .map((match) => match.slice(1, -1).trim())
    .filter(Boolean);
}

function buildFinalSynthesisText(synthesizer) {
  const conclusion = normalizeString(synthesizer?.recommended_conclusion);
  const uncertainties = normalizeStringArray(synthesizer?.conflicts_or_uncertainties);

  if (!conclusion) {
    return uncertainties.join("\n");
  }

  if (uncertainties.length === 0) {
    return conclusion;
  }

  return `${conclusion}\n\nMaterial uncertainties:\n- ${uncertainties.join("\n- ")}`;
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

    if (parsed.ok && isResearchArtifact(parsed.value)) {
      return parsed.value;
    }
  }

  return null;
}

function isResearchArtifact(value) {
  return value?.mode === MODE_NAME &&
    typeof value?.topic === "string" &&
    Array.isArray(value?.findings) &&
    Array.isArray(value?.sources);
}

function decideRevision({
  researcher,
  synthesizer,
  citationChecker,
  contractValidation,
  loopState
}) {
  const stageInvalid = !researcher.ok || !synthesizer.ok || !citationChecker.ok;
  const citationNeedsRevision = citationChecker?.parsed?.final_recommendation === "revise";
  const unresolvedResearchGaps = Array.isArray(researcher?.parsed?.unresolved_gaps) &&
    researcher.parsed.unresolved_gaps.length > 0;
  const canIterate = loopState.iteration < loopState.maxIterations;
  const nextTargetStage = unresolvedResearchGaps && canIterate ? "researcher" : "synthesizer";

  return {
    needsRevision: stageInvalid || citationNeedsRevision || !contractValidation.ok,
    reasons: [
      ...(stageInvalid ? ["deep_research_stage_output_invalid"] : []),
      ...(citationNeedsRevision ? ["citation_checker_requested_revision"] : []),
      ...(!contractValidation.ok ? ["deep_research_contract_validation_failed"] : [])
    ],
    nextTargetStage,
    canIterate
  };
}

export const deepResearchModeStageOrder = STAGE_ORDER;
