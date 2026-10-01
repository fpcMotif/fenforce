import { v } from 'convex/values';

export const APPROVAL_TIMEOUT_MS = 15 * 60 * 1_000;
export const APPROVAL_STEP_TIMEOUT_MS = 30 * 1_000;
export const APPROVAL_RETENTION_MS = 24 * 60 * 60 * 1_000;
export const APPROVAL_EVENT = 'approval';
export const APPROVAL_RETRY = {
  maxAttempts: 3,
  initialBackoffMs: 1_000,
  base: 1,
};

export const decisionValidator = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('invalid'),
  v.literal('timedOut'),
);

export const lifecycleValidator = v.union(
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed'),
  v.literal('canceled'),
);

export const ledgerFields = {
  instanceId: v.string(),
  preparationAttempts: v.number(),
  deliveryAttempts: v.number(),
  deliveryCount: v.number(),
  receiptId: v.union(v.string(), v.null()),
};

export const approvalResultValidator = v.object({
  ...ledgerFields,
  decision: v.union(v.literal('approved'), v.literal('rejected')),
});
