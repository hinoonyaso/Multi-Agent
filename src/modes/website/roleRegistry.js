import {
  createRoleRegistry,
  summarizeRoleDefinition
} from "../../core/roleRegistry.js";

const registry = createRoleRegistry([
  {
    id: "request_interpreter",
    mode: "website",
    kind: "internal",
    description: "Classify the incoming request and extract routing signals for website work.",
    inputs: ["user_request", "previous_artifact", "planning"],
    outputs: ["request_profile"],
    activationRules: ["always_on_entry"],
    preferredWorkerId: "website_planning_worker",
    requiredCapabilities: ["planning", "requirements_analysis"]
  },
  {
    id: "change_impact_analyzer",
    mode: "website",
    kind: "internal",
    description: "Estimate how much of an existing artifact can be preserved on follow-up requests.",
    inputs: ["user_request", "previous_artifact"],
    outputs: ["change_impact"],
    activationRules: ["follow_up_request"],
    preferredWorkerId: "website_planning_worker",
    requiredCapabilities: ["change_analysis"]
  },
  {
    id: "requirements_analyst",
    mode: "website",
    kind: "internal",
    description: "Resolve ambiguity, scope size, and missing assumptions before design or coding.",
    inputs: ["user_request", "planning", "history"],
    outputs: ["requirements_spec"],
    activationRules: ["ambiguous_request", "large_scope"],
    preferredWorkerId: "website_planning_worker",
    requiredCapabilities: ["requirements_analysis"]
  },
  {
    id: "information_architect",
    mode: "website",
    kind: "llm",
    description: "Plan the website structure, page system, and design direction.",
    inputs: ["user_request", "request_profile", "requirements_spec", "change_impact"],
    outputs: ["architecture_spec"],
    activationRules: ["new_build", "major_redesign", "follow_up_restructure"],
    preferredWorkerId: "website_planning_worker",
    requiredCapabilities: ["architecture"],
    stageName: "architect",
    stepKey: "architect"
  },
  {
    id: "frontend_coder",
    mode: "website",
    kind: "llm",
    description: "Generate, revise, or repair the website artifact bundle.",
    inputs: ["architecture_spec", "retry_plan", "previous_artifact"],
    outputs: ["artifact_bundle"],
    activationRules: ["initial_build", "targeted_revision", "contract_repair"],
    preferredWorkerId: "website_builder_worker",
    requiredCapabilities: ["frontend_coding", "bug_fix"],
    stageName: "coder_first_pass",
    stepKey: "coder_first_pass"
  },
  {
    id: "ui_critic",
    mode: "website",
    kind: "llm",
    description: "Review the rendered UI and implementation quality before validation.",
    inputs: ["architecture_spec", "artifact_bundle", "render_diagnostics"],
    outputs: ["ui_review"],
    activationRules: ["render_success", "visual_review_requested"],
    preferredWorkerId: "website_review_worker",
    requiredCapabilities: ["visual_review", "responsive_review"],
    stageName: "ui_critic",
    stepKey: "ui_critic"
  },
  {
    id: "failure_analyst",
    mode: "website",
    kind: "internal",
    description: "Classify validator or render failures into targeted repair categories.",
    inputs: ["validator_result", "ui_review", "render_diagnostics"],
    outputs: ["failure_analysis"],
    activationRules: ["validator_rejected", "render_failed"],
    preferredWorkerId: "website_review_worker",
    requiredCapabilities: ["failure_analysis"]
  },
  {
    id: "retry_planner",
    mode: "website",
    kind: "internal",
    description: "Choose the minimum next role set needed to recover from critique or validation failures.",
    inputs: ["ui_review", "failure_analysis", "validator_result", "artifact_bundle"],
    outputs: ["retry_plan"],
    activationRules: ["critic_requested_revision", "validator_rejected"],
    preferredWorkerId: "website_validation_worker",
    requiredCapabilities: ["retry_planning"]
  },
  {
    id: "validator_gate",
    mode: "website",
    kind: "llm",
    description: "Approve the selected artifact or reject it with a targeted revision signal.",
    inputs: ["artifact_bundle", "revision_summary", "contract_validation"],
    outputs: ["validator_result"],
    activationRules: ["artifact_candidate_ready"],
    preferredWorkerId: "website_validation_worker",
    requiredCapabilities: ["validation", "compliance"],
    stageName: "validator",
    stepKey: "validator"
  }
]);

export function listWebsiteRoles() {
  return registry.listByMode("website");
}

export function getWebsiteRole(roleId) {
  return registry.get(roleId);
}

export function summarizeWebsiteRole(roleId) {
  const role = typeof roleId === "string" ? getWebsiteRole(roleId) : roleId;
  return summarizeRoleDefinition(role);
}
