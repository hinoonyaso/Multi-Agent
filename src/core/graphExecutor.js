/**
 * Graph-based pipeline executor.
 * Runs nodes according to graph edges and conditions, with support for
 * skip conditions, conditional edges, and retry/repair loops.
 */

/**
 * Get the next node(s) to run from the current node and result.
 * @param {Object} graph - Graph with nodes, edges
 * @param {string} currentNodeId - Just-finished node
 * @param {Object} result - Result from that node
 * @param {Object} context - Execution context
 * @returns {string|null} Next node id or null if done
 */
export function getNextNode(graph, currentNodeId, result, context) {
  const edges = graph.edges?.filter((e) => e.from === currentNodeId) ?? [];

  if (edges.length === 0) {
    return null;
  }

  for (const edge of edges) {
    if (evaluateEdgeCondition(edge, result, context)) {
      return edge.to;
    }
  }

  const fallback = edges.find((e) => !e.condition);
  return fallback?.to ?? null;
}

/**
 * Check if a node should be skipped.
 * @param {Object} node - Node config
 * @param {Object} context - Execution context
 * @returns {boolean} True if node should be skipped
 */
export function shouldSkipNode(node, context) {
  if (!node?.skipCondition || !context) {
    return false;
  }

  const condition = node.skipCondition;
  if (condition === "followUp") {
    return Boolean(context.followUpArtifact);
  }

  return false;
}

/**
 * Get the skip handler result when a node is skipped.
 * @param {Object} graph - Graph with skipHandlers
 * @param {string} nodeId - Skipped node id
 * @param {Object} context - Execution context
 * @returns {Object|null} Injected result or null
 */
export function getSkipHandlerResult(graph, nodeId, context) {
  const handlerKey = graph.skipHandlers?.[nodeId];
  if (!handlerKey || typeof context.getSkipResult !== "function") {
    return null;
  }
  return context.getSkipResult?.(nodeId, handlerKey, context) ?? null;
}

/**
 * Execute a graph pipeline.
 * @param {Object} graph - Graph with nodes, edges, retryPolicy
 * @param {Object} initialContext - Initial context (runtime, input, etc.)
 * @param {Object} nodeRunners - Map of nodeId -> async (context) => result
 * @param {Object} [options] - { emit, maxRepairAttempts }
 * @returns {Promise<Object>} Final context with result
 */
export async function executeGraph(graph, initialContext, nodeRunners, options = {}) {
  const context = { ...initialContext };
  let currentNodeId = graph.entryNode ?? graph.nodes?.[0]?.id;
  let lastResult = null;

  while (currentNodeId) {
    const node = graph.nodes?.find((n) => n.id === currentNodeId);
    if (!node) {
      break;
    }

    const runner = nodeRunners[currentNodeId];
    if (!runner || typeof runner !== "function") {
      break;
    }

    if (shouldSkipNode(node, context)) {
      const skipResult = getSkipHandlerResult(graph, currentNodeId, context);
      if (skipResult) {
        Object.assign(context, skipResult);
      }
      const skipTarget = getSkipTargetNode(graph, currentNodeId);
      if (skipTarget) {
        currentNodeId = skipTarget;
        continue;
      }
    }

    lastResult = await runner(context);
    mergeResultIntoContext(context, currentNodeId, lastResult);

    const nextId = getNextNode(graph, currentNodeId, lastResult, context);
    if (!nextId) {
      break;
    }

    currentNodeId = nextId;
  }

  return context;
}

function evaluateEdgeCondition(edge, result, context) {
  if (!edge.condition) {
    return true;
  }
  if (edge.condition === "revise") {
    return result?.parsed?.final_recommendation === "revise";
  }
  if (edge.condition === "approve") {
    return result?.parsed?.final_recommendation === "approve" || result?.parsed?.final_recommendation !== "revise";
  }
  if (edge.condition === "contractFailure") {
    return result?.contractFailed === true;
  }
  return true;
}

function evaluateEntryCondition(condition, context) {
  if (condition === "criticRevise") {
    const critic = context.uiCritic ?? context.critique?.uiCritic;
    return critic?.parsed?.final_recommendation === "revise";
  }
  if (condition === "validatorContractFailure") {
    return context.contractValidation?.ok === false;
  }
  return true;
}

function getSkipTargetNode(graph, skippedNodeId) {
  const handlerKey = graph.skipHandlers?.[skippedNodeId];
  if (handlerKey) {
    const edge = graph.edges?.find((e) => e.from === skippedNodeId);
    return edge?.to ?? null;
  }
  return null;
}

function mergeResultIntoContext(context, nodeId, result) {
  if (nodeId === "architect") {
    context.architect = result;
  } else if (nodeId === "coder_first_pass") {
    context.firstPass = result;
    context.artifactCandidate = result?.artifactCandidate;
  } else if (nodeId === "ui_critic") {
    context.uiCritic = result;
    context.critique = { uiCritic: result };
  } else if (nodeId === "revision" || nodeId === "coder_revision") {
    context.revision = result;
    context.validatedRevision = result;
  } else if (nodeId === "validator") {
    context.validatorResult = result;
    context.contractValidation = result?.contractValidation;
    context.contractFailed = !result?.contractValidation?.ok;
  } else if (nodeId === "coder_repair") {
    context.repairResult = result;
    context.validatedRevision = result?.revision ?? context.validatedRevision;
  }
}
