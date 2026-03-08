export function buildRouterContext({ userRequest, modeHint } = {}) {
  return {
    // The router only needs the raw request to choose the primary mode.
    userRequest: normalizeString(userRequest),
    // The hint is optional guidance from the caller, not full execution history.
    modeHint: normalizeOptionalString(modeHint)
  };
}

export function buildPlannerContext({ userRequest, routerResult, contract } = {}) {
  return {
    // The planner needs the original request to turn routing into execution steps.
    userRequest: normalizeString(userRequest),
    // Only the selected routing outcome is needed, not the full router transcript.
    routerResult: summarizeRouterResult(routerResult),
    // The planner needs a compact contract view to plan against concrete deliverables.
    contract: summarizeContract(contract, {
      includeQualityChecks: true,
      includeValidationRules: false
    })
  };
}

export function buildWebsiteArchitectContext({
  userRequest,
  plannerResult,
  contract,
  researchResult
} = {}) {
  return {
    mode: "website",
    // The architect needs the user outcome to shape the site structure.
    userRequest: normalizeString(userRequest),
    // Only planning directives that affect information architecture are included.
    plannerResult: summarizePlannerResult(plannerResult),
    // The architect needs contract boundaries, not the entire raw contract document.
    contract: summarizeContract(contract, {
      includeQualityChecks: true,
      includeValidationRules: false
    }),
    // Research is optional and should arrive as a short brief, never full history.
    researchResult: summarizeResearchResult(researchResult)
  };
}

export function buildWebsiteCoderContext({
  architectureSpec,
  contract,
  revisionInstruction,
  approvedDecisions
} = {}) {
  return {
    mode: "website",
    // The coder needs the approved architecture spec as the source of truth.
    architectureSpec: summarizeArchitectureSpec(architectureSpec),
    // The coder needs implementation constraints and required output fields.
    contract: summarizeContract(contract, {
      includeQualityChecks: true,
      includeValidationRules: true
    }),
    // The revision block is optional and should stay compact when present.
    revisionInstruction: normalizeOptionalString(revisionInstruction),
    // Preserve already-approved decisions so revisions do not drift unnecessarily.
    approvedDecisions: summarizeApprovedDecisions(approvedDecisions)
  };
}

export function buildWebsiteCriticContext({
  architectureSpec,
  generatedFiles,
  contract
} = {}) {
  return {
    mode: "website",
    // The critic needs the intended structure to judge whether the implementation matches it.
    architectureSpec: summarizeArchitectureSpec(architectureSpec),
    // The critic must see the delivered files because critique depends on actual implementation.
    generatedFiles: summarizeGeneratedFiles(generatedFiles),
    // The critic only needs the contract slices relevant to frontend quality and scope.
    contract: summarizeContract(contract, {
      includeQualityChecks: true,
      includeValidationRules: false
    })
  };
}

export function buildWebsiteValidatorContext({ generatedFiles, contract } = {}) {
  return {
    mode: "website",
    // The validator checks the delivered artifact itself, so file payloads are required.
    generatedFiles: summarizeGeneratedFiles(generatedFiles),
    // The validator needs explicit contract rules because this stage is compliance-focused.
    contract: summarizeContract(contract, {
      includeQualityChecks: true,
      includeValidationRules: true
    })
  };
}

export function buildFinalizerContext({
  mode,
  approvedArtifact,
  validationResult,
  runMetadata
} = {}) {
  return {
    // The finalizer only needs the selected mode to package against the right artifact contract.
    mode: normalizeOptionalString(mode),
    // Pass only the approved artifact itself so the finalizer packages instead of regenerating.
    approvedArtifact: summarizeApprovedArtifact(approvedArtifact),
    // Keep validation input terse: enough to avoid packaging invalid output, not enough to re-litigate the run.
    validationSummary: summarizeValidationSummary(validationResult),
    // Include only a tiny operational slice of metadata when it may help packaging behavior.
    runMetadata: summarizeRunMetadata(runMetadata)
  };
}

function summarizeRouterResult(routerResult) {
  if (!routerResult || typeof routerResult !== "object") {
    return null;
  }

  return compactObject({
    // The selected mode is the main output the planner needs from routing.
    primary_mode: firstDefinedString(
      routerResult.primary_mode,
      routerResult.mode,
      routerResult.parsed?.primary_mode,
      routerResult.output?.primary_mode
    ),
    // Task type helps the planner choose execution depth without full routing notes.
    task_type: firstDefinedString(
      routerResult.task_type,
      routerResult.parsed?.task_type,
      routerResult.output?.task_type
    ),
    // Research need informs whether the planner should expect upstream evidence gathering.
    requires_research: firstDefinedBoolean(
      routerResult.requires_research,
      routerResult.parsed?.requires_research,
      routerResult.output?.requires_research
    ),
    // Risks help the planner shape the plan without inheriting the whole router result.
    risks: normalizeStringArray(
      routerResult.risks ??
        routerResult.parsed?.risks ??
        routerResult.output?.risks
    )
  });
}

function summarizePlannerResult(plannerResult) {
  if (!plannerResult || typeof plannerResult !== "object") {
    return null;
  }

  const parsed = plannerResult.parsed && typeof plannerResult.parsed === "object"
    ? plannerResult.parsed
    : plannerResult;

  return compactObject({
    // Execution steps guide the architect without exposing planner internals.
    execution_steps: summarizeExecutionSteps(parsed.execution_steps ?? parsed.steps),
    // Artifact contract from planning can contain distilled delivery expectations.
    artifact_contract: compactObject(parsed.artifact_contract),
    // Open questions identify ambiguity the architect should resolve in structure.
    open_questions_to_resolve: normalizeStringArray(parsed.open_questions_to_resolve),
    // Risks help architecture stay inside likely failure boundaries.
    risks: normalizeStringArray(parsed.risks)
  });
}

function summarizeResearchResult(researchResult) {
  if (!researchResult || typeof researchResult !== "object") {
    return null;
  }

  const parsed = researchResult.parsed && typeof researchResult.parsed === "object"
    ? researchResult.parsed
    : researchResult;

  return compactObject({
    // The architect only needs the synthesized answer, not every research step.
    executive_summary: normalizeOptionalString(
      parsed.executive_summary ?? parsed.recommended_conclusion ?? parsed.summary
    ),
    // Key findings provide constraints or facts that should affect the site structure.
    key_findings: summarizeResearchFindings(parsed.key_findings ?? parsed.research_summary),
    // Uncertainties prevent the architect from overcommitting to unsupported details.
    conflicts_or_uncertainties: normalizeStringArray(
      parsed.conflicts_or_uncertainties ?? parsed.unresolved_gaps
    )
  });
}

function summarizeArchitectureSpec(architectureSpec) {
  if (!architectureSpec || typeof architectureSpec !== "object") {
    return null;
  }

  return compactObject({
    // Site type influences the implementation pattern and component structure.
    site_type: normalizeOptionalString(architectureSpec.site_type),
    // Pages define the main navigational and structural surfaces to implement.
    pages: summarizePages(architectureSpec.pages),
    // Design guidance gives the coder and critic the intended visual/system direction.
    design_system_guidance: compactObject(architectureSpec.design_system_guidance),
    // Implementation notes carry only architecture-approved constraints and decisions.
    implementation_notes: normalizeStringArray(architectureSpec.implementation_notes)
  });
}

function summarizeApprovedDecisions(approvedDecisions) {
  if (Array.isArray(approvedDecisions)) {
    return approvedDecisions
      .map((entry) => summarizeDecision(entry))
      .filter(Boolean);
  }

  if (approvedDecisions && typeof approvedDecisions === "object") {
    const normalized = Object.keys(approvedDecisions)
      .sort()
      .reduce((result, key) => {
        const value = approvedDecisions[key];
        const summarized = summarizeDecision(value);

        if (summarized !== null) {
          result[key] = summarized;
        }

        return result;
      }, {});

    return Object.keys(normalized).length > 0 ? normalized : null;
  }

  return normalizeOptionalString(approvedDecisions);
}

function summarizeDecision(value) {
  if (typeof value === "string") {
    return normalizeOptionalString(value);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  return compactObject(value);
}

function summarizeGeneratedFiles(generatedFiles) {
  const files = extractFiles(generatedFiles);

  return {
    // Paths are needed for entrypoint, structure, and internal consistency checks.
    files: files.map((file) => ({
      path: file.path,
      // Full file contents are required for coding, critique, and validation.
      content: file.content
    }))
  };
}

function summarizeApprovedArtifact(approvedArtifact) {
  // Prefer the approved artifact payload itself and strip common runner wrappers so the
  // finalizer does not receive step metadata, transcripts, or other intermediate state.
  const unwrappedArtifact = unwrapApprovedArtifact(approvedArtifact);

  if (unwrappedArtifact == null) {
    return null;
  }

  return unwrappedArtifact;
}

function unwrapApprovedArtifact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value ?? null;
  }

  if (value.approvedArtifact !== undefined) {
    return unwrapApprovedArtifact(value.approvedArtifact);
  }

  if (value.artifact !== undefined) {
    return unwrapApprovedArtifact(value.artifact);
  }

  if (value.parsed !== undefined) {
    return unwrapApprovedArtifact(value.parsed);
  }

  if (value.output !== undefined) {
    return unwrapApprovedArtifact(value.output);
  }

  return value;
}

function summarizeValidationSummary(validationResult) {
  if (!validationResult || typeof validationResult !== "object") {
    return null;
  }

  return compactObject({
    // The packaging layer mainly needs pass/fail state and a short issue summary.
    ok: typeof validationResult.ok === "boolean" ? validationResult.ok : undefined,
    errorCount: countEntries(validationResult.errors),
    warningCount: countEntries(validationResult.warnings),
    issues: summarizeValidationIssues(validationResult.errors)
  });
}

function summarizeValidationIssues(errors) {
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors
    .slice(0, 5)
    .map((error) => {
      if (typeof error === "string") {
        return normalizeOptionalString(error);
      }

      if (!error || typeof error !== "object") {
        return null;
      }

      return compactObject({
        code: normalizeOptionalString(error.code),
        path: normalizeOptionalString(error.path),
        message: firstDefinedString(error.message, error.summary, error.detail)
      });
    })
    .filter(Boolean);
}

function summarizeRunMetadata(runMetadata) {
  if (!runMetadata || typeof runMetadata !== "object") {
    return null;
  }

  return compactObject({
    // Only retain metadata that can affect packaging mechanics; exclude history and planner state.
    runId: firstDefinedString(runMetadata.runId, runMetadata.run_id),
    workingDir: firstDefinedString(runMetadata.workingDir, runMetadata.working_dir),
    attempt: Number.isInteger(runMetadata.attempt) ? runMetadata.attempt : undefined
  });
}

function summarizeContract(contract, options = {}) {
  if (!contract || typeof contract !== "object") {
    return null;
  }

  const summary = compactObject({
    // Mode keeps the receiving agent anchored to the expected artifact type.
    mode: normalizeOptionalString(contract.mode),
    // Artifact kind provides a short description of what must be produced.
    artifact_kind: normalizeOptionalString(contract.artifact_kind),
    // Supported output types constrain implementation shape.
    supported_output_types: normalizeStringArray(contract.supported_output_types),
    // Required deliverables define the minimum artifact payload.
    required_deliverables: summarizeRequiredDeliverables(contract.required_deliverables),
    // Structural expectations guide implementation layout without passing the whole contract.
    structural_expectations: summarizeStructuralExpectations(contract.structural_expectations),
    // Responsive expectations matter for website authoring and review.
    responsive_expectations: summarizeResponsiveExpectations(contract.responsive_expectations)
  });

  if (options.includeQualityChecks) {
    summary.minimum_quality_checks = normalizeStringArray(contract.minimum_quality_checks);
  }

  if (options.includeValidationRules) {
    summary.validation_rules = normalizeStringArray(contract.validation_rules);
    summary.failure_conditions = normalizeStringArray(contract.failure_conditions);
  }

  return summary;
}

function summarizeRequiredDeliverables(requiredDeliverables) {
  if (!requiredDeliverables || typeof requiredDeliverables !== "object") {
    return null;
  }

  return Object.keys(requiredDeliverables)
    .sort()
    .reduce((result, key) => {
      const value = requiredDeliverables[key];

      if (!value || typeof value !== "object") {
        return result;
      }

      result[key] = compactObject({
        required: typeof value.required === "boolean" ? value.required : undefined,
        minimum_count: Number.isInteger(value.minimum_count) ? value.minimum_count : undefined,
        fields: normalizeStringArray(value.fields),
        requirements: normalizeStringArray(value.requirements),
        allowed_examples: normalizeStringArray(value.allowed_examples),
        rules: normalizeStringArray(value.rules)
      });

      return result;
    }, {});
}

function summarizeStructuralExpectations(structuralExpectations) {
  if (!structuralExpectations || typeof structuralExpectations !== "object") {
    return null;
  }

  return compactObject({
    general: normalizeStringArray(structuralExpectations.general),
    static_html_css_js: normalizeStringArray(structuralExpectations.static_html_css_js),
    react_vite_app: normalizeStringArray(structuralExpectations.react_vite_app)
  });
}

function summarizeResponsiveExpectations(responsiveExpectations) {
  if (!responsiveExpectations || typeof responsiveExpectations !== "object") {
    return null;
  }

  return compactObject({
    required:
      typeof responsiveExpectations.required === "boolean"
        ? responsiveExpectations.required
        : undefined,
    rules: normalizeStringArray(
      responsiveExpectations.rules ?? responsiveExpectations.expectations
    )
  });
}

function summarizeExecutionSteps(steps) {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .map((step) => {
      if (typeof step === "string") {
        return normalizeOptionalString(step);
      }

      if (!step || typeof step !== "object") {
        return null;
      }

      return compactObject({
        step: normalizeOptionalString(step.step ?? step.name),
        purpose: normalizeOptionalString(step.purpose),
        output: normalizeOptionalString(step.output)
      });
    })
    .filter(Boolean);
}

function summarizeResearchFindings(findings) {
  if (!Array.isArray(findings)) {
    return [];
  }

  return findings
    .map((finding) => {
      if (typeof finding === "string") {
        return normalizeOptionalString(finding);
      }

      if (!finding || typeof finding !== "object") {
        return null;
      }

      return compactObject({
        topic: normalizeOptionalString(finding.topic),
        claim: normalizeOptionalString(finding.claim),
        key_findings: normalizeStringArray(finding.key_findings),
        support: normalizeStringArray(finding.support),
        constraints_or_implications: normalizeStringArray(
          finding.constraints_or_implications
        ),
        confidence: normalizeOptionalString(finding.confidence)
      });
    })
    .filter(Boolean);
}

function summarizePages(pages) {
  if (!Array.isArray(pages)) {
    return [];
  }

  return pages
    .map((page) => {
      if (!page || typeof page !== "object") {
        return null;
      }

      return compactObject({
        name: normalizeOptionalString(page.name),
        purpose: normalizeOptionalString(page.purpose),
        sections: summarizeSections(page.sections)
      });
    })
    .filter(Boolean);
}

function summarizeSections(sections) {
  if (!Array.isArray(sections)) {
    return [];
  }

  return sections
    .map((section) => {
      if (typeof section === "string") {
        return normalizeOptionalString(section);
      }

      if (!section || typeof section !== "object") {
        return null;
      }

      return compactObject({
        name: normalizeOptionalString(section.name),
        purpose: normalizeOptionalString(section.purpose),
        content: normalizeOptionalString(section.content)
      });
    })
    .filter(Boolean);
}

function extractFiles(generatedFiles) {
  if (Array.isArray(generatedFiles?.files)) {
    return normalizeFiles(generatedFiles.files);
  }

  if (Array.isArray(generatedFiles)) {
    return normalizeFiles(generatedFiles);
  }

  return [];
}

function normalizeFiles(files) {
  return files
    .filter((file) => typeof file?.path === "string" && typeof file?.content === "string")
    .map((file) => ({
      path: file.path.trim(),
      content: file.content
    }))
    .filter((file) => file.path && file.content);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeOptionalString(entry))
    .filter(Boolean);
}

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function firstDefinedString(...values) {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function firstDefinedBoolean(...values) {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

function countEntries(value) {
  return Array.isArray(value) ? value.length : undefined;
}

function compactObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value ?? null;
  }

  const entries = Object.entries(value).filter(([, entryValue]) => {
    if (entryValue == null) {
      return false;
    }

    if (Array.isArray(entryValue)) {
      return entryValue.length > 0;
    }

    if (typeof entryValue === "object") {
      return Object.keys(entryValue).length > 0;
    }

    return true;
  });

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}
