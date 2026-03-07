import test from "node:test";
import assert from "node:assert/strict";

import {
  RETRY_ERROR_TYPES,
  buildRetryInstruction,
  createRetryPolicy,
  maxAttemptsFor,
  shouldRetry
} from "../src/core/retryPolicy.js";

test("maxAttemptsFor uses conservative defaults for each retry class", () => {
  assert.equal(maxAttemptsFor(RETRY_ERROR_TYPES.PROCESS_FAILURE), 2);
  assert.equal(maxAttemptsFor(RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT), 2);
  assert.equal(maxAttemptsFor(RETRY_ERROR_TYPES.CONTRACT_VALIDATION_FAILURE), 2);
  assert.equal(maxAttemptsFor(RETRY_ERROR_TYPES.CRITIC_REQUESTED_REVISION), 2);
});

test("shouldRetry stops retrying once the category limit is reached", () => {
  assert.equal(shouldRetry(RETRY_ERROR_TYPES.PROCESS_FAILURE, 1), true);
  assert.equal(shouldRetry(RETRY_ERROR_TYPES.PROCESS_FAILURE, 2), false);
  assert.equal(shouldRetry(RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT, 2), false);
});

test("buildRetryInstruction tailors guidance for invalid JSON output", () => {
  const instruction = buildRetryInstruction(
    RETRY_ERROR_TYPES.INVALID_JSON_OUTPUT,
    ["Missing closing brace", "Wrapped JSON in markdown fences"]
  );

  assert.match(instruction, /valid JSON only/i);
  assert.match(instruction, /Details:/);
  assert.match(instruction, /- Missing closing brace/);
  assert.match(instruction, /- Wrapped JSON in markdown fences/);
});

test("createRetryPolicy stays backward-compatible and allows category overrides", () => {
  const policy = createRetryPolicy({
    backoffMs: 750,
    rules: {
      [RETRY_ERROR_TYPES.CRITIC_REQUESTED_REVISION]: {
        maxAttempts: 3
      }
    }
  });

  assert.equal(policy.backoffMs, 750);
  assert.equal(policy.maxAttempts, 3);
  assert.equal(
    policy.maxAttemptsFor(RETRY_ERROR_TYPES.CRITIC_REQUESTED_REVISION),
    3
  );
  assert.equal(
    policy.shouldRetry(RETRY_ERROR_TYPES.CRITIC_REQUESTED_REVISION, 2),
    true
  );
});
