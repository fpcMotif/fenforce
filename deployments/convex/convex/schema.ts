import { authTables } from '@convex-dev/auth/server';
import { vWorkflowId } from '@convex-dev/workflow';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import { decisionValidator, lifecycleValidator } from './approvalContract';
import { accountValuesValidator, industryValidator } from './accountContract';
import { membershipRoleValidator } from './membershipRole';

export default defineSchema({
  ...authTables,
  authSessions: authTables.authSessions.index('by_userId_and_expirationTime', [
    'userId',
    'expirationTime',
  ]),
  employeeIdentities: defineTable({
    issuer: v.string(),
    tenant: v.string(),
    subject: v.string(),
    userId: v.id('users'),
  })
    .index('by_issuer_and_tenant_and_subject', ['issuer', 'tenant', 'subject'])
    .index('by_userId', ['userId']),
  employeeInvitations: defineTable({
    issuer: v.string(),
    tenant: v.string(),
    subject: v.string(),
    workspaceId: v.id('workspaces'),
    displayName: v.string(),
    role: membershipRoleValidator,
    expiresAt: v.number(),
    acceptedUserId: v.optional(v.id('users')),
  }).index('by_issuer_and_tenant_and_subject', ['issuer', 'tenant', 'subject']),
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
    active: v.optional(v.boolean()),
    workspaceId: v.id('workspaces'),
    userId: v.id('users'),
    displayName: v.string(),
    role: membershipRoleValidator,
    createdAt: v.number(),
  })
    .index('by_workspaceId_and_userId', ['workspaceId', 'userId'])
    .index('by_userId', ['userId'])
    .index('by_workspaceId_and_active_and_role', [
      'workspaceId',
      'active',
      'role',
    ])
    .index('by_userId_and_active', ['userId', 'active']),
  workspaceCompanies: defineTable({
    workspaceId: v.id('workspaces'),
    revision: v.number(),
    industry: v.optional(industryValidator),
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
  accountAudit: defineTable({
    workspaceId: v.id('workspaces'),
    companyId: v.id('workspaceCompanies'),
    actorId: v.id('workspaceMembers'),
    timestamp: v.number(),
    before: v.union(accountValuesValidator, v.null()),
    after: accountValuesValidator,
  }).index('by_companyId', ['companyId']),
});
