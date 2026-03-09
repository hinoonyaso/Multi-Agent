import { createModeRuntime } from "../shared/pipeline.js";
import {
  assignWorkerForRole,
  listWorkersByMode,
  summarizeWorker
} from "../../core/workerRegistry.js";
import { architectNodeRunner } from "./stages/architectStage.js";
import { runCoderStage } from "./stages/coderStage.js";
import { uiCriticNodeRunner, buildFollowUpSkipResult } from "./stages/uiCriticStage.js";
import { validatorNodeRunner } from "./stages/validatorStage.js";
import {
  createRevisionPlan,
  createRevisionSummary
} from "./stages/revisionStage.js";
import {
  MODE_NAME,
  STEP_KEYS,
  RETRY_ERROR_TYPES,
  buildContractRepairPrompt,
  buildContractRetryStageName,
  buildRetryPolicyInstruction,
  buildRetryRolePrompt,
  buildWebsiteArtifact,
  createContractRepairPlan,
  createFollowUpRevisionSummary,
  createModeEventEmitter,
  emitStageEvent,
  getRetryLimit,
  normalizeCriticIssues,
  persistWebsiteStep,
  sanitizeFollowUpArtifact,
  shouldRetryWithPolicy
} from "./stages/shared.js";
import {
  getWebsiteRole,
  listWebsiteRoles,
  summarizeWebsiteRole
} from "./roleRegistry.js";

const MAX_ROLE_CYCLES = 10;

export async function runWebsiteRoleOrchestrator(context = {}) {
  const state = await createRoleExecutionState(context);

  await persistStaticRoleMetadata(state);

  while (state.cycleCount < MAX_ROLE_CYCLES) {
    const selectedRoles = selectRolesForNextCycle(state);

    if (selectedRoles.length === 0) {
      break;
    }

    state.cycleCount += 1;
    const assignments = buildRoleAssignments(selectedRoles, state.workerPool);
    state.lastSelectedRoles = selectedRoles.slice();

    await persistRoleSelectionCycle(state, selectedRoles, assignments);

    for (const roleId of selectedRoles) {
      await executeRole(roleId, state, assignments[roleId] ?? null);

      if (state.completed) {
        break;
      }
    }

    if (state.completed) {
      break;
    }
  }

  const finalArtifact =
    state.validatedRevision?.finalArtifactCandidate ??
    state.revision?.finalArtifactCandidate ??
    state.firstPass?.artifactCandidate ??
    null;

  if (!finalArtifact) {
    throw new Error("Website role orchestrator completed without a final artifact.");
  }

  return finalArtifact;
}

async function createRoleExecutionState(context) {
  const runtime = await createModeRuntime(context);
  const emit = createModeEventEmitter(context.onEvent, runtime);
  const followUpArtifact = sanitizeFollowUpArtifact(runtime.input?.previousArtifact);

  return {
    runtime,
    emit,
    followUpArtifact,
    roleRegistry: listWebsiteRoles(),
    workerPool: listWorkersByMode(MODE_NAME),
    roleAssignments: {},
    lastSelectedRoles: [],
    cycleCount: 0,
    completed: false,
    requestProfile: null,
    changeImpact: null,
    requirementsSpec: null,
    architect: null,
    firstPass: null,
    uiCritic: null,
    criticResolution: null,
    retryPlan: null,
    failureAnalysis: null,
    revision: null,
    validatedRevision: null,
    validator: null,
    contractRepairAttempts: 0
  };
}

async function persistStaticRoleMetadata(state) {
  await persistWebsiteStep(state.runtime, "role_registry", {
    mode: MODE_NAME,
    roles: state.roleRegistry.map((role) => summarizeWebsiteRole(role))
  });
  await persistWebsiteStep(state.runtime, "worker_pool", {
    mode: MODE_NAME,
    workers: state.workerPool.map((worker) => summarizeWorker(worker))
  });
}

function buildRoleAssignments(roleIds, workerPool) {
  return roleIds.reduce((result, roleId) => {
    const roleDefinition = getWebsiteRole(roleId);
    const worker = assignWorkerForRole(roleDefinition, { workers: workerPool });

    result[roleId] = worker
      ? {
          id: worker.id,
          label: worker.label,
          agentId: worker.agentId,
          capabilities: worker.capabilities
        }
      : null;

    return result;
  }, {});
}

async function persistRoleSelectionCycle(state, roleIds, assignments) {
  const selection = {
    cycle: state.cycleCount,
    selected_roles: roleIds,
    assignments,
    state_snapshot: summarizeRoleState(state)
  };

  await persistWebsiteStep(
    state.runtime,
    `role_selection_cycle_${state.cycleCount}`,
    selection
  );

  state.roleAssignments = {
    ...state.roleAssignments,
    ...assignments
  };

  await persistWebsiteStep(state.runtime, "worker_assignments", {
    mode: MODE_NAME,
    assignments: state.roleAssignments
  });
}

function selectRolesForNextCycle(state) {
  if (!state.requestProfile) {
    return [
      "request_interpreter",
      ...(state.followUpArtifact ? ["change_impact_analyzer"] : []),
      ...(shouldRunRequirementsAnalystFromInput(state) ? ["requirements_analyst"] : [])
    ];
  }

  if (state.requestProfile.needsRequirementsAnalysis && !state.requirementsSpec) {
    return ["requirements_analyst"];
  }

  if (!state.architect) {
    return ["information_architect"];
  }

  if (!state.firstPass) {
    return ["frontend_coder"];
  }

  if (!state.uiCritic) {
    return ["ui_critic"];
  }

  if (!state.criticResolution) {
    return ["retry_planner"];
  }

  if (state.retryPlan?.action === "run_coder_revision" && !state.retryPlan.consumed) {
    return ["frontend_coder"];
  }

  if (!state.validator && state.validatedRevision?.finalArtifactCandidate) {
    return ["validator_gate"];
  }

  if (state.validator?.approval?.ok) {
    return [];
  }

  if (state.validator && !state.failureAnalysis) {
    return ["failure_analyst", "retry_planner"];
  }

  if (state.retryPlan?.action === "run_validator_repair" && !state.retryPlan.consumed) {
    return ["frontend_coder"];
  }

  if (
    state.validator &&
    !state.validator.approval?.ok &&
    state.retryPlan?.action === "revalidate" &&
    !state.retryPlan.consumed &&
    state.validatedRevision?.finalArtifactCandidate
  ) {
    return ["validator_gate"];
  }

  return [];
}

async function executeRole(roleId, state, assignment) {
  emitRoleLifecycleEvent(state.emit, "role_started", roleId, assignment);

  let result;

  switch (roleId) {
    case "request_interpreter":
      result = await executeRequestInterpreterRole(state, assignment);
      break;
    case "change_impact_analyzer":
      result = await executeChangeImpactAnalyzerRole(state, assignment);
      break;
    case "requirements_analyst":
      result = await executeRequirementsAnalystRole(state, assignment);
      break;
    case "information_architect":
      result = await executeInformationArchitectRole(state, assignment);
      break;
    case "frontend_coder":
      result = await executeFrontendCoderRole(state, assignment);
      break;
    case "ui_critic":
      result = await executeUiCriticRole(state, assignment);
      break;
    case "failure_analyst":
      result = await executeFailureAnalystRole(state, assignment);
      break;
    case "retry_planner":
      result = await executeRetryPlannerRole(state, assignment);
      break;
    case "validator_gate":
      result = await executeValidatorGateRole(state, assignment);
      break;
    default:
      throw new Error(`Unsupported website role "${roleId}".`);
  }

  emitRoleLifecycleEvent(state.emit, "role_completed", roleId, assignment, {
    summary: summarizeRoleCompletion(roleId, result)
  });

  return result;
}

async function executeRequestInterpreterRole(state, assignment) {
  const userRequest = normalizeString(state.runtime.input?.userRequest);
  const wordCount = userRequest ? userRequest.split(/\s+/).length : 0;
  const openQuestions = extractPlannerOpenQuestions(state.runtime.planning);
  const requestType = classifyWebsiteRequestType({
    userRequest,
    hasPreviousArtifact: Boolean(state.followUpArtifact)
  });
  const taskSize = classifyTaskSize({ userRequest, wordCount });
  const ambiguousSignals = buildAmbiguitySignals({ userRequest, openQuestions });
  const needsRequirementsAnalysis = ambiguousSignals.length > 0 || taskSize === "large";

  const result = annotateRoleResult(
    {
      stage: "request_interpreter",
      status: "complete",
      request_type: requestType,
      task_size: taskSize,
      signals: {
        follow_up: Boolean(state.followUpArtifact),
        ambiguous_request: ambiguousSignals.length > 0,
        open_questions: openQuestions,
        responsive_priority: /mobile|responsive|tablet/i.test(userRequest) || requestType === "new_build",
        brand_sensitive: /brand|tone|voice|style/i.test(userRequest)
      },
      recommended_next_roles: [
        ...(needsRequirementsAnalysis ? ["requirements_analyst"] : []),
        ...(state.followUpArtifact ? ["change_impact_analyzer"] : []),
        "information_architect"
      ],
      blockers: [],
      confidence: needsRequirementsAnalysis ? 0.71 : 0.88
    },
    "request_interpreter",
    assignment
  );

  state.requestProfile = result;
  await persistWebsiteStep(state.runtime, "request_interpreter", result);
  return result;
}

async function executeChangeImpactAnalyzerRole(state, assignment) {
  const previousFiles = state.followUpArtifact?.files ?? [];
  const userRequest = normalizeString(state.runtime.input?.userRequest);
  const structuralChange =
    /restructure|rebuild|re-?architect|new page|multi-page|navigation/i.test(userRequest);

  const result = annotateRoleResult(
    {
      stage: "change_impact_analyzer",
      status: "complete",
      target_scope: structuralChange ? "broad_update" : "targeted_update",
      preserve_existing_files: !structuralChange,
      impacted_areas: [
        previousFiles.length > 0 ? "existing_artifact" : "new_artifact",
        structuralChange ? "structure_and_navigation" : "targeted_surface_change"
      ],
      blockers: [],
      risks: structuralChange
        ? ["Follow-up request may invalidate parts of the existing architecture."]
        : [],
      recommended_next_roles: structuralChange
        ? ["information_architect", "frontend_coder"]
        : ["information_architect", "frontend_coder"],
      confidence: structuralChange ? 0.74 : 0.9
    },
    "change_impact_analyzer",
    assignment
  );

  state.changeImpact = result;
  await persistWebsiteStep(state.runtime, "change_impact_analyzer", result);
  return result;
}

async function executeRequirementsAnalystRole(state, assignment) {
  const userRequest = normalizeString(state.runtime.input?.userRequest);
  const openQuestions = extractPlannerOpenQuestions(state.runtime.planning);
  const ambiguitySignals = buildAmbiguitySignals({ userRequest, openQuestions });
  const scope = classifyTaskSize({
    userRequest,
    wordCount: userRequest ? userRequest.split(/\s+/).length : 0
  });

  const result = annotateRoleResult(
    {
      stage: "requirements_analyst",
      status: "complete",
      requirements_summary: summarizeRequirements(userRequest),
      missing_information: ambiguitySignals,
      resolved_assumptions: buildResolvedAssumptions({
        userRequest,
        followUpArtifact: state.followUpArtifact,
        changeImpact: state.changeImpact
      }),
      scope,
      blockers: [],
      confidence: ambiguitySignals.length > 0 ? 0.67 : 0.86,
      recommended_next_roles: ["information_architect"]
    },
    "requirements_analyst",
    assignment
  );

  state.requirementsSpec = result;
  await persistWebsiteStep(state.runtime, "requirements_analyst", result);
  return result;
}

async function executeInformationArchitectRole(state, assignment) {
  const architect = await architectNodeRunner({
    ...state,
    assignedWorker: assignment,
    requestProfile: state.requestProfile,
    requirementsSpec: state.requirementsSpec,
    changeImpact: state.changeImpact
  });

  const annotated = annotateRoleResult(architect, "information_architect", assignment);
  state.architect = annotated;
  await persistWebsiteStep(state.runtime, STEP_KEYS.architect, annotated);
  return annotated;
}

async function executeFrontendCoderRole(state, assignment) {
  if (!state.firstPass) {
    const coder = await runCoderStage(state.runtime, state.architect, {
      stageName: "coder_first_pass",
      passName: "first_pass",
      emit: state.emit,
      requestProfile: state.requestProfile,
      requirementsSpec: state.requirementsSpec,
      changeImpact: state.changeImpact,
      assignedWorker: assignment
    });
    const annotated = annotateRoleResult(coder, "frontend_coder", assignment);
    const artifactCandidate = buildWebsiteArtifact(annotated.parsed);

    await persistWebsiteStep(state.runtime, STEP_KEYS.coderFirstPass, annotated);

    state.firstPass = {
      coder: annotated,
      artifactCandidate
    };
    state.validator = null;
    return annotated;
  }

  if (state.retryPlan?.action === "run_coder_revision" && !state.retryPlan.consumed) {
    emitStageEvent(state.emit, "revision_started", "revision", "Applying targeted revision plan.");
    const revisedCoder = await runCoderStage(state.runtime, state.architect, {
      stageName: "coder_revision",
      passName: "revision",
      previousCoder: state.firstPass.coder,
      revisionPlan: state.retryPlan.revision_plan,
      emit: state.emit,
      requestProfile: state.requestProfile,
      requirementsSpec: state.requirementsSpec,
      changeImpact: state.changeImpact,
      assignedWorker: assignment
    });
    emitStageEvent(state.emit, "revision_completed", "revision", "Revision pass completed.");

    const annotated = annotateRoleResult(revisedCoder, "frontend_coder", assignment);
    const revision = {
      firstPassCoder: state.firstPass.coder,
      firstPassArtifactCandidate: state.firstPass.artifactCandidate,
      revisedCoder: annotated,
      finalCoder: annotated,
      finalArtifactCandidate: buildWebsiteArtifact(annotated.parsed),
      summary: createRevisionSummary({
        plan: state.retryPlan.revision_plan,
        selectedStage: annotated.stage,
        revisedCoder: annotated
      })
    };

    await persistWebsiteStep(state.runtime, STEP_KEYS.coderRevision, annotated);
    await persistSelectedRevisionState(state.runtime, revision);

    state.retryPlan = {
      ...state.retryPlan,
      consumed: true,
      completed_at: new Date().toISOString()
    };
    state.criticResolution = state.retryPlan;
    state.revision = revision;
    state.validatedRevision = revision;
    state.validator = null;
    return annotated;
  }

  if (state.retryPlan?.action === "run_validator_repair" && !state.retryPlan.consumed) {
    const repairAttempt = state.retryPlan.attempt ?? state.contractRepairAttempts + 1;
    const repairedCoder = await runCoderStage(state.runtime, state.architect, {
      stageName: buildContractRetryStageName(repairAttempt),
      passName: "repair",
      previousCoder: currentFinalCoder(state),
      revisionPlan: state.retryPlan.revision_plan,
      emit: state.emit,
      requestProfile: state.requestProfile,
      requirementsSpec: state.requirementsSpec,
      changeImpact: state.changeImpact,
      assignedWorker: assignment,
      repairPrompt: buildRetryRolePrompt({
        basePrompt: "",
        retryInstruction: buildRetryPolicyInstruction(
          state.runtime,
          RETRY_ERROR_TYPES.CONTRACT_VALIDATION_FAILURE,
          state.validator?.contractValidation?.errors ?? []
        ),
        repairPrompt: buildContractRepairPrompt({
          roleName: "website_coder",
          violations: state.validator?.contractValidation?.errors ?? [],
          previousOutput:
            currentFinalCoder(state)?.parsed ??
            currentFinalCoder(state)?.run?.stdout ??
            null
        })
      })
    });

    const annotated = annotateRoleResult(repairedCoder, "frontend_coder", assignment);
    const previousRevision = ensureValidatedRevision(state);
    const updatedRevision = {
      ...previousRevision,
      validatorRetryCoder: annotated,
      finalCoder: annotated,
      finalArtifactCandidate: buildWebsiteArtifact(annotated.parsed),
      summary: {
        ...previousRevision.summary,
        validator_repair_attempts: repairAttempt,
        validator_repair_stage: annotated.stage
      }
    };

    await persistWebsiteStep(state.runtime, annotated.stage, annotated);
    await persistSelectedRevisionState(state.runtime, updatedRevision);

    state.contractRepairAttempts = repairAttempt;
    state.retryPlan = {
      ...state.retryPlan,
      consumed: true,
      completed_at: new Date().toISOString(),
      action: "revalidate"
    };
    state.failureAnalysis = null;
    state.revision = updatedRevision;
    state.validatedRevision = updatedRevision;
    state.validator = null;
    return annotated;
  }

  throw new Error("frontend_coder was selected without a valid generation or repair action.");
}

async function executeUiCriticRole(state, assignment) {
  if (state.followUpArtifact) {
    emitStageEvent(state.emit, "ui_critic_started", "ui_critic", "Running lightweight follow-up critique.");
    const skipResult = buildFollowUpSkipResult(state);
    const annotated = annotateRoleResult(skipResult.uiCritic, "ui_critic", assignment);

    await persistWebsiteStep(state.runtime, STEP_KEYS.uiCritic, annotated);
    emitStageEvent(
      state.emit,
      "ui_critic_completed",
      "ui_critic",
      annotated?.parsed?.final_recommendation === "revise"
        ? "Lightweight follow-up critique requested changes."
        : "Lightweight follow-up critique approved the update."
    );

    state.uiCritic = annotated;
    return annotated;
  }

  const uiCritic = await uiCriticNodeRunner({
    ...state,
    assignedWorker: assignment
  });
  const annotated = annotateRoleResult(uiCritic, "ui_critic", assignment);
  await persistWebsiteStep(state.runtime, STEP_KEYS.uiCritic, annotated);
  state.uiCritic = annotated;
  return annotated;
}

async function executeFailureAnalystRole(state, assignment) {
  const contractErrors = normalizeContractErrors(state.validator?.contractValidation?.errors);
  const criticIssues = normalizeCriticIssues(state.uiCritic?.parsed?.issues);

  const issues = [
    ...contractErrors.map((message) => ({
      type: "contract_validation",
      severity: "high",
      problem: message,
      suggested_role: "frontend_coder"
    })),
    ...criticIssues.map((problem) => ({
      type: "ui_quality",
      severity: "medium",
      problem,
      suggested_role: "frontend_coder"
    }))
  ];

  const result = annotateRoleResult(
    {
      stage: "failure_analyst",
      status: issues.length > 0 ? "needs_revision" : "clear",
      issues,
      blockers: [],
      confidence: issues.length > 0 ? 0.84 : 0.94,
      recommended_next_roles: issues.length > 0 ? ["retry_planner"] : []
    },
    "failure_analyst",
    assignment
  );

  state.failureAnalysis = result;
  await persistWebsiteStep(state.runtime, "failure_analyst", result);
  return result;
}

async function executeRetryPlannerRole(state, assignment) {
  const source = resolveRetryPlannerSource(state);

  if (source === "ui_critic") {
    const plan = createRevisionPlan(state.uiCritic);

    if (!plan.shouldRevise) {
      const selectedRevision = buildSelectedRevisionWithoutRewrite(state, plan);
      const result = annotateRoleResult(
        {
          stage: "retry_planner",
          status: "planned",
          source,
          action: "proceed_to_validator",
          issues: plan.issues,
          instructions: plan.instructions,
          target_roles: ["validator_gate"],
          blockers: [],
          confidence: 0.93
        },
        "retry_planner",
        assignment
      );

      await persistSelectedRevisionState(state.runtime, selectedRevision);
      state.criticResolution = result;
      state.retryPlan = null;
      state.revision = selectedRevision;
      state.validatedRevision = selectedRevision;
      await persistWebsiteStep(state.runtime, "retry_planner", result);
      return result;
    }

    const result = annotateRoleResult(
      {
        stage: "retry_planner",
        status: "planned",
        source,
        action: "run_coder_revision",
        issues: plan.issues,
        instructions: plan.instructions,
        revision_plan: plan,
        target_roles: ["frontend_coder"],
        blockers: [],
        consumed: false,
        confidence: 0.86
      },
      "retry_planner",
      assignment
    );

    state.criticResolution = result;
    state.retryPlan = result;
    await persistWebsiteStep(state.runtime, "retry_planner", result);
    return result;
  }

  const attempt = state.contractRepairAttempts + 1;
  const maxAttempts = getRetryLimit(
    state.runtime,
    RETRY_ERROR_TYPES.CONTRACT_VALIDATION_FAILURE
  );
  const canRetry =
    shouldRetryWithPolicy(
      state.runtime,
      RETRY_ERROR_TYPES.CONTRACT_VALIDATION_FAILURE,
      attempt
    ) && attempt <= maxAttempts;

  if (!canRetry) {
    const blocked = annotateRoleResult(
      {
        stage: "retry_planner",
        status: "blocked",
        source,
        action: "stop",
        issues: normalizeContractErrors(state.validator?.contractValidation?.errors),
        instructions: [],
        target_roles: [],
        blockers: [
          `Validator repair retries exhausted after ${state.contractRepairAttempts} attempt(s).`
        ],
        confidence: 0.96
      },
      "retry_planner",
      assignment
    );

    state.retryPlan = blocked;
    state.completed = true;
    await persistWebsiteStep(state.runtime, "retry_planner", blocked);
    return blocked;
  }

  const repairPlan = createContractRepairPlan(state.validator?.contractValidation);
  const result = annotateRoleResult(
    {
      stage: "retry_planner",
      status: "planned",
      source,
      action: "run_validator_repair",
      attempt,
      issues: repairPlan.issues,
      instructions: repairPlan.instructions,
      revision_plan: repairPlan,
      target_roles: ["frontend_coder", "validator_gate"],
      blockers: [],
      consumed: false,
      confidence: 0.88
    },
    "retry_planner",
    assignment
  );

  state.retryPlan = result;
  await persistWebsiteStep(state.runtime, "retry_planner", result);
  return result;
}

async function executeValidatorGateRole(state, assignment) {
  const selectedRevision = ensureValidatedRevision(state);
  state.revision = selectedRevision;
  state.validatedRevision = selectedRevision;

  const validator = await validatorNodeRunner({
    ...state,
    assignedWorker: assignment,
    revision: selectedRevision,
    validatedRevision: selectedRevision
  });
  const annotated = annotateRoleResult(validator, "validator_gate", assignment);

  await persistWebsiteStep(state.runtime, STEP_KEYS.validator, annotated);

  state.validator = annotated;
  state.retryPlan =
    state.retryPlan?.action === "revalidate"
      ? {
          ...state.retryPlan,
          consumed: true,
          completed_at: new Date().toISOString()
        }
      : state.retryPlan;
  state.completed = Boolean(annotated?.approval?.ok);
  return annotated;
}

function buildSelectedRevisionWithoutRewrite(state, plan) {
  if (state.followUpArtifact) {
    return {
      firstPassCoder: state.firstPass.coder,
      firstPassArtifactCandidate: state.followUpArtifact,
      revisedCoder: null,
      finalCoder: state.firstPass.coder,
      finalArtifactCandidate: state.firstPass.artifactCandidate,
      summary: createFollowUpRevisionSummary(
        state.followUpArtifact,
        state.firstPass.artifactCandidate
      )
    };
  }

  return {
    firstPassCoder: state.firstPass.coder,
    firstPassArtifactCandidate: state.firstPass.artifactCandidate,
    revisedCoder: null,
    finalCoder: state.firstPass.coder,
    finalArtifactCandidate: state.firstPass.artifactCandidate,
    summary: createRevisionSummary({
      plan,
      selectedStage: state.firstPass.coder.stage,
      revisedCoder: null
    })
  };
}

async function persistSelectedRevisionState(runtime, revision) {
  await persistWebsiteStep(runtime, STEP_KEYS.revisionSummary, revision.summary);
  await persistWebsiteStep(runtime, STEP_KEYS.coderFinal, revision.finalCoder);
}

function ensureValidatedRevision(state) {
  if (state.validatedRevision?.finalArtifactCandidate) {
    return state.validatedRevision;
  }

  if (state.revision?.finalArtifactCandidate) {
    return state.revision;
  }

  if (!state.firstPass?.artifactCandidate) {
    throw new Error("Validator gate requested before any artifact candidate existed.");
  }

  const plan = createRevisionPlan(state.uiCritic);
  const selectedRevision = buildSelectedRevisionWithoutRewrite(state, {
    ...plan,
    shouldRevise: false
  });
  state.revision = selectedRevision;
  state.validatedRevision = selectedRevision;
  return selectedRevision;
}

function shouldRunRequirementsAnalystFromInput(state) {
  const openQuestions = extractPlannerOpenQuestions(state.runtime.planning);
  if (openQuestions.length > 0) {
    return true;
  }

  const userRequest = normalizeString(state.runtime.input?.userRequest);
  return buildAmbiguitySignals({ userRequest, openQuestions }).length > 0;
}

function resolveRetryPlannerSource(state) {
  if (!state.criticResolution && state.uiCritic) {
    return "ui_critic";
  }

  if (state.validator && !state.validator.approval?.ok) {
    return "validator";
  }

  if (state.failureAnalysis) {
    return "failure_analyst";
  }

  return "validator";
}

function classifyWebsiteRequestType({ userRequest, hasPreviousArtifact }) {
  if (hasPreviousArtifact) {
    return "follow_up_update";
  }

  if (/fix|bug|broken|error|regression/i.test(userRequest)) {
    return "bug_fix";
  }

  if (/redesign|polish|improve|refresh|visual|layout|style/i.test(userRequest)) {
    return "design_improvement";
  }

  return "new_build";
}

function classifyTaskSize({ userRequest, wordCount }) {
  if (/dashboard|admin|portal|multi-page|saas app|application/i.test(userRequest) || wordCount > 45) {
    return "large";
  }

  if (wordCount > 18) {
    return "medium";
  }

  return "small";
}

function buildAmbiguitySignals({ userRequest, openQuestions }) {
  const signals = [...openQuestions];

  if (!userRequest) {
    signals.push("The request is empty.");
    return dedupeStrings(signals);
  }

  if (userRequest.split(/\s+/).length < 6) {
    signals.push("The request is terse and leaves important scope details unstated.");
  }

  if (/something|some kind|nice|cool|good|modern|pretty/i.test(userRequest)) {
    signals.push("Visual direction is underspecified and will require explicit assumptions.");
  }

  return dedupeStrings(signals);
}

function summarizeRequirements(userRequest) {
  if (!userRequest) {
    return [];
  }

  const sentences = userRequest
    .split(/[.!?]\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return sentences.slice(0, 3);
}

function buildResolvedAssumptions({ userRequest, followUpArtifact, changeImpact }) {
  const assumptions = [];

  if (followUpArtifact?.files?.length > 0) {
    assumptions.push(
      `Preserve the existing artifact unless the request explicitly demands structural replacement.`
    );
  }

  if (/mobile|responsive|landing|homepage|hero/i.test(userRequest)) {
    assumptions.push("Treat responsive layout quality as a first-class acceptance criterion.");
  }

  if (changeImpact?.target_scope === "targeted_update") {
    assumptions.push("Prefer localized edits over broad rewrites for this follow-up request.");
  }

  return assumptions;
}

function extractPlannerOpenQuestions(planning) {
  const parsed =
    planning?.parsed && typeof planning.parsed === "object"
      ? planning.parsed
      : planning;

  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  return Array.isArray(parsed.open_questions_to_resolve)
    ? parsed.open_questions_to_resolve.filter((entry) => typeof entry === "string" && entry.trim())
    : [];
}

function summarizeRoleState(state) {
  return {
    has_request_profile: Boolean(state.requestProfile),
    has_change_impact: Boolean(state.changeImpact),
    has_requirements_spec: Boolean(state.requirementsSpec),
    has_architecture: Boolean(state.architect),
    has_first_pass: Boolean(state.firstPass),
    has_ui_critic: Boolean(state.uiCritic),
    has_validated_revision: Boolean(state.validatedRevision?.finalArtifactCandidate),
    validator_status: state.validator?.approval?.recommendation ?? null,
    pending_retry_action: state.retryPlan?.action ?? null,
    repair_attempts: state.contractRepairAttempts
  };
}

function summarizeRoleCompletion(roleId, result) {
  if (roleId === "request_interpreter") {
    return `Request classified as "${result?.request_type ?? "unknown"}".`;
  }

  if (roleId === "change_impact_analyzer") {
    return `Change impact marked as "${result?.target_scope ?? "unknown"}".`;
  }

  if (roleId === "requirements_analyst") {
    return `Requirements analysis captured ${result?.missing_information?.length ?? 0} ambiguity signal(s).`;
  }

  if (roleId === "retry_planner") {
    return `Retry planner selected action "${result?.action ?? "unknown"}".`;
  }

  if (roleId === "failure_analyst") {
    return `Failure analysis identified ${result?.issues?.length ?? 0} issue(s).`;
  }

  return null;
}

function emitRoleLifecycleEvent(emit, type, roleId, assignment, extra = {}) {
  if (typeof emit !== "function") {
    return;
  }

  emit(type, {
    step: roleId,
    role: roleId,
    workerId: assignment?.id ?? null,
    agentId: assignment?.agentId ?? null,
    ...extra
  });
}

function annotateRoleResult(result, roleId, assignment) {
  if (!result || typeof result !== "object") {
    return result;
  }

  return {
    ...result,
    role: roleId,
    role_assignment: assignment
      ? {
          worker_id: assignment.id ?? null,
          agent_id: assignment.agentId ?? null,
          capabilities: Array.isArray(assignment.capabilities)
            ? assignment.capabilities
            : []
        }
      : null
  };
}

function currentFinalCoder(state) {
  return (
    state.validatedRevision?.finalCoder ??
    state.revision?.finalCoder ??
    state.firstPass?.coder ??
    null
  );
}

function normalizeContractErrors(errors) {
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors
    .map((entry) => {
      if (typeof entry?.message === "string" && entry.message.trim()) {
        return entry.message.trim();
      }

      if (typeof entry === "string" && entry.trim()) {
        return entry.trim();
      }

      return null;
    })
    .filter(Boolean);
}

function dedupeStrings(values) {
  return [...new Set(values.filter((entry) => typeof entry === "string" && entry.trim()))];
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}
