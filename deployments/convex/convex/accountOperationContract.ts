import { v, type Infer } from 'convex/values';

export const accountOperationValidator = v.union(
  v.literal('create'),
  v.literal('update'),
  v.literal('trash'),
  v.literal('restore'),
  v.literal('reassign'),
);
export type AccountOperation = Infer<typeof accountOperationValidator>;

export const operationReceiptValidator = v.object({
  operation: accountOperationValidator,
  companyId: v.id('workspaceCompanies'),
  revision: v.number(),
  changed: v.boolean(),
  acceptedAt: v.number(),
});
