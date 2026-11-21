import { authTables } from '@convex-dev/auth/server';
import { vWorkflowId } from '@convex-dev/workflow';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import { decisionValidator, lifecycleValidator } from './approvalContract';

export default defineSchema({
  ...authTables,
  syntheticApprovalRuns: defineTable({
    instanceId: v.string(),
    workflowId: v.optional(vWorkflowId),
    decision: decisionValidator,
    decisionPayload: v.union(v.boolean(), v.string(), v.null()),
    lifecycle: lifecycleValidator,
    error: v.union(v.string(), v.null()),
    expiresAt: v.union(v.number(), v.null()),
    retentionExpiresAt: v.optional(v.number()),
    preparationAttempts: v.number(),
    deliveryAttempts: v.number(),
    deliveryCount: v.number(),
    operationId: v.union(v.string(), v.null()),
    receiptId: v.union(v.string(), v.null()),
  }).index('by_instanceId', ['instanceId']),
  companies: defineTable({
    name: v.string(),
    domain: v.string(),
    industry: v.string(),
    location: v.string(),
    employeeCount: v.number(),
    demo: v.literal(true),
  }).index('by_demo_name', ['demo', 'name']),
  workspaces: defineTable({
    name: v.string(),
    createdByUserId: v.id('users'),
    createdAt: v.number(),
  }),
  workspaceMembers: defineTable({
    workspaceId: v.id('workspaces'),
    userId: v.id('users'),
    displayName: v.string(),
    role: v.union(v.literal('admin'), v.literal('member')),
    createdAt: v.number(),
  })
    .index('by_workspaceId_and_userId', ['workspaceId', 'userId'])
    .index('by_userId', ['userId']),
  workspaceCompanies: defineTable({
    workspaceId: v.id('workspaces'),
    revision: v.number(),
    name: v.string(),
    domainName: v.object({
      primaryLinkUrl: v.string(),
      primaryLinkLabel: v.string(),
      secondaryLinks: v.array(
        v.object({
          url: v.string(),
          label: v.string(),
        }),
      ),
    }),
    accountOwnerId: v.union(v.id('workspaceMembers'), v.null()),
    createdBy: v.id('workspaceMembers'),
    updatedBy: v.id('workspaceMembers'),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.union(v.number(), v.null()),
  }).index('by_workspaceId_and_deletedAt_and_name', [
    'workspaceId',
    'deletedAt',
    'name',
  ]),
});
