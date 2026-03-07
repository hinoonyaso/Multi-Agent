import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

import { createRunState, loadRunState } from "../src/core/stateStore.js";
import { runDeepResearchMode } from "../src/modes/deep_research/index.js";

test("deep research mode runs planner-to-finalizer pipeline and persists each step", async () => {
  const stageRequests = [];
  const queryPlannerOutput = {
    research_goal: "Assess whether demand for grid-scale batteries is accelerating in the US.",
    sub_questions: [
      {
        question: "What do recent deployment and investment data show?",
        question_type: "factual",
        required_evidence: ["Recent deployment data", "Recent investment data"]
      },
      {
        question: "What constraints could slow that growth?",
        question_type: "evaluative",
        required_evidence: ["Supply-side constraints", "Policy or grid interconnection limits"]
      }
    ],
    evidence_plan: [
      "Use recent primary-source market data where possible.",
      "Separate direct facts from evidence-based interpretation."
    ]
  };
  const researcherOutput = {
    research_summary: [
      {
        topic: "Deployment momentum",
        key_findings: [
          "US grid-scale battery deployments increased materially year over year. [src_1]",
          "Project pipelines remain elevated in major interconnection queues. [src_2]"
        ],
        constraints_or_implications: [
          "Recent deployment data supports a growth conclusion, but queue data alone is not a build guarantee."
        ],
        sources: [
          {
            id: "src_1",
            title: "Grid-Scale Storage Market Report",
            authoring_entity: "Energy Agency",
            publication_name: "Energy Agency",
            url: "https://example.com/report",
            date: "2026-01-15"
          },
          {
            id: "src_2",
            title: "Interconnection Queue Update",
            authoring_entity: "Grid Operator",
            publication_name: "Grid Operator",
            url: "https://example.com/queue",
            date: "2026-02-10"
          }
        ]
      }
    ],
    unresolved_gaps: [],
    recommendations_for_next_stage: [
      "Keep the conclusion tied to recent deployment and queue evidence rather than long-range speculation."
    ]
  };
  const synthesizerOutput = {
    executive_summary: "US demand for grid-scale batteries appears to be accelerating, supported by recent deployment growth and active project pipelines, though execution constraints still matter.",
    key_findings: [
      {
        claim: "Recent US battery deployment growth indicates strong near-term demand.",
        support: [
          {
            evidence: "Recent market reporting shows a material year-over-year increase in grid-scale battery deployments.",
            citations: ["src_1"]
          },
          {
            evidence: "Interconnection queue data shows a large pipeline of storage projects awaiting execution.",
            citations: ["src_2"]
          }
        ],
        confidence: "medium",
        citations: ["src_1", "src_2"]
      }
    ],
    conflicts_or_uncertainties: [
      "Interconnection queue volume overstates realized builds if permitting and procurement constraints worsen."
    ],
    recommended_conclusion: "The best-supported conclusion is that demand is accelerating in the near term, but realized growth remains sensitive to execution bottlenecks."
  };
  const citationCheckerOutput = {
    unsupported_or_weak_claims: [],
    coverage_assessment: "The central claim is supported and the main uncertainty is stated.",
    final_recommendation: "approve"
  };
  const finalArtifact = {
    mode: "deep_research",
    output_type: "structured_research_json",
    topic: "Assess whether demand for grid-scale batteries is accelerating in the US.",
    executive_summary: synthesizerOutput.executive_summary,
    findings: [
      {
        id: "finding_1",
        claim: "Recent US battery deployment growth indicates strong near-term demand.",
        support: [
          {
            evidence: "Recent market reporting shows a material year-over-year increase in grid-scale battery deployments.",
            citations: ["src_1"]
          },
          {
            evidence: "Interconnection queue data shows a large pipeline of storage projects awaiting execution.",
            citations: ["src_2"]
          }
        ],
        confidence: "medium",
        citations: ["src_1", "src_2"]
      }
    ],
    final_synthesis: [
      "The best-supported conclusion is that demand is accelerating in the near term, but realized growth remains sensitive to execution bottlenecks.",
      "",
      "Material uncertainties:",
      "- Interconnection queue volume overstates realized builds if permitting and procurement constraints worsen."
    ].join("\n"),
    sources: researcherOutput.research_summary[0].sources,
    research_goal: queryPlannerOutput.research_goal,
    sub_questions: queryPlannerOutput.sub_questions,
    evidence_plan: queryPlannerOutput.evidence_plan,
    unresolved_gaps: [],
    conflicts_or_uncertainties: synthesizerOutput.conflicts_or_uncertainties,
    recommendations_for_next_stage: researcherOutput.recommendations_for_next_stage
  };

  const mockRunner = {
    async run(request) {
      stageRequests.push(request.stage);

      if (request.stage === "deep_research:query_planner") {
        return createRunResult(queryPlannerOutput, request);
      }

      if (request.stage === "deep_research:researcher") {
        return createRunResult(researcherOutput, request);
      }

      if (request.stage === "deep_research:synthesizer") {
        return createRunResult(synthesizerOutput, request);
      }

      if (request.stage === "deep_research:citation_checker") {
        return createRunResult(citationCheckerOutput, request);
      }

      if (request.stage === "deep_research:validator") {
        return createRunResult(
          {
            status: "approve",
            reasons: [],
            next_action: "Proceed to final packaging."
          },
          request
        );
      }

      if (request.stage === "deep_research:finalizer") {
        return createRunResult(
          {
            final_mode: "deep_research",
            deliverables: [
              {
                name: queryPlannerOutput.research_goal,
                type: "content",
                content: JSON.stringify(finalArtifact, null, 2)
              }
            ],
            delivery_notes: []
          },
          request
        );
      }

      throw new Error(`Unexpected stage: ${request.stage}`);
    }
  };

  const runState = await createRunState({
    userRequest: "Research whether US demand for grid-scale batteries is accelerating",
    workingDir: process.cwd()
  });
  const result = await runDeepResearchMode({
    input: {
      userRequest: "Research whether US demand for grid-scale batteries is accelerating",
      workingDir: process.cwd(),
      maxResearchIterations: 2
    },
    runState,
    codexRunner: mockRunner,
    systemPrompt: "System prompt"
  });

  try {
    assert.deepEqual(stageRequests, [
      "deep_research:query_planner",
      "deep_research:researcher",
      "deep_research:synthesizer",
      "deep_research:citation_checker",
      "deep_research:validator",
      "deep_research:finalizer"
    ]);
    assert.deepEqual(result, finalArtifact);

    const persistedRunState = await loadRunState(runState.runId);

    assert.equal(persistedRunState.steps.query_planner.stage, "query_planner");
    assert.equal(persistedRunState.steps.researcher.stage, "researcher");
    assert.equal(persistedRunState.steps.synthesizer.stage, "synthesizer");
    assert.equal(persistedRunState.steps.citation_checker.stage, "citation_checker");
    assert.equal(persistedRunState.steps.validator.stage, "validator");
    assert.equal(persistedRunState.steps.finalizer.stage, "finalizer");
    assert.equal(persistedRunState.steps.validator.contractValidation.ok, true);
    assert.equal(persistedRunState.steps.validator.loop.canIterate, true);
    assert.deepEqual(persistedRunState.steps.finalizer.artifact, finalArtifact);

    await rm(runState.runDir, { recursive: true, force: true });
  } catch (error) {
    await rm(runState.runDir, { recursive: true, force: true });
    throw error;
  }
});

function createRunResult(payload, request) {
  return {
    ok: true,
    stdout: JSON.stringify(payload),
    stderr: "",
    exitCode: 0,
    timedOut: false,
    cli: "mock-codex",
    model: "test-model",
    request
  };
}
