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
    if (evaluateEdgeCondition(graph, edge, result, context)) {
      return edge.to;
    }
  }

  const fallback = edges.find((e) => !e.condition);
  return fallback?.to ?? null;
}

/**
 * Check if a node should be skipped.
 * Uses graph.skipConditionEvaluators when provided, else falls back to built-in conditions.
 * @param {Object} graph - Graph with optional skipConditionEvaluators
 * @param {Object} node - Node config
 * @param {Object} context - Execution context
 * @returns {boolean} True if node should be skipped
 */
export function shouldSkipNode(graph, node, context, resolveCondition) {
  if (!node?.skipCondition || !context) {
    return false;
  }

  if (typeof resolveCondition === "function") {
    return resolveCondition(node.skipCondition, context);
  }

  const evaluators = graph?.skipConditionEvaluators;
  if (evaluators && typeof evaluators[node.skipCondition] === "function") {
    return evaluators[node.skipCondition](node, context);
  }

  if (node.skipCondition === "followUp") {
    return Boolean(context.followUpArtifact);
  }

  return false;
}

/**
 * Get the skip handler result when a node is skipped.
 * @param {Object} graph - Graph with skipHandlers
 * @param {string} nodeId - Skipped node id
 * @param {Object} context - Execution context
 * @param {Function} [resolveSkipHandler] - Optional callback override
 * @returns {Object|null} Injected result or null
 */
export function getSkipHandlerResult(graph, nodeId, context, resolveSkipHandler) {
  const handlerKey = graph.skipHandlers?.[nodeId];
  if (!handlerKey) return null;

  if (typeof resolveSkipHandler === "function") {
    return resolveSkipHandler(handlerKey, context) ?? null;
  }

  if (typeof context.getSkipResult !== "function") return null;
  return context.getSkipResult?.(nodeId, handlerKey, context) ?? null;
}

/**
 * Execute a graph pipeline.
 * @param {Object} graph - Graph with nodes, edges, retryPolicy
 * @param {Object} initialContext - Initial context (runtime, input, etc.)
 * @param {Object} nodeRunners - Map of nodeId -> async (context) => result
 * @param {Object} [options] - {
 *   emit,
 *   maxRepairAttempts,
 *   resolveCondition?: (condition, ctx) => boolean,
 *   mergeNodeResult?: (ctx, nodeId, result) => ctx,
 *   resolveSkipHandler?: (handlerKey, ctx) => result|null
 * }
 * @returns {Promise<Object>} Final context with result
 */
export async function executeGraph(graph, initialContext, nodeRunners, options = {}) {
  const { resolveCondition, mergeNodeResult, resolveSkipHandler } = options;
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

    if (shouldSkipNode(graph, node, context, resolveCondition)) {
      const skipResult = getSkipHandlerResult(graph, currentNodeId, context, resolveSkipHandler);
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

    if (typeof mergeNodeResult === "function") {
      const merged = mergeNodeResult(context, currentNodeId, lastResult);
      if (merged && merged !== context) Object.assign(context, merged);
    } else {
      mergeResultIntoContext(graph, node, context, currentNodeId, lastResult);
    }

    const nextId = getNextNode(graph, currentNodeId, lastResult, context);
    if (!nextId) {
      break;
    }

    currentNodeId = nextId;
  }

  return context;
}

function evaluateEdgeCondition(graph, edge, result, context) {
  if (!edge.condition) {
    return true;
  }

  const evaluators = graph?.edgeConditionEvaluators;
  if (evaluators && typeof evaluators[edge.condition] === "function") {
    return evaluators[edge.condition](edge, result, context);
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

function mergeResultIntoContext(graph, node, context, nodeId, result) {
  if (node?.contextKey) {
    context[node.contextKey] = result;
    return;
  }

  if (node?.contextMerge && typeof node.contextMerge === "object") {
    for (const [key, spec] of Object.entries(node.contextMerge)) {
      if (typeof spec === "function") {
        context[key] = spec(result, context);
      } else if (typeof spec === "string") {
        context[key] = getByPath(result, spec);
      }
    }
    return;
  }

  applyDefaultMerge(context, nodeId, result);
}

function getByPath(obj, path) {
  if (path === "result" || path === "") {
    return obj;
  }
  if (!path?.startsWith("result.")) {
    return obj;
  }
  const keys = path.slice(7).split(".");
  let cur = obj;
  for (const k of keys) {
    cur = cur?.[k];
  }
  return cur;
}

function applyDefaultMerge(context, nodeId, result) {
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
