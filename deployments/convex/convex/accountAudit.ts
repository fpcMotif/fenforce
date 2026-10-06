import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

const values = (company: Doc<'workspaceCompanies'>) => ({
  name: company.name,
  industry: company.industry ?? null,
  accountOwnerId: company.accountOwnerId,
  domainName: company.domainName,
  revision: company.revision,
  deletedAt: company.deletedAt,
});

export const appendAccountAudit = async (
  context: MutationCtx,
  companyId: Id<'workspaceCompanies'>,
  before: Doc<'workspaceCompanies'> | null,
) => {
  const after = await context.db.get(companyId);
  if (after === null) throw new Error('Account missing after accepted write');
  await context.db.insert('accountAudit', {
    workspaceId: after.workspaceId,
    companyId,
    actorId: after.updatedBy,
    timestamp: after.updatedAt,
    before: before === null ? null : values(before),
    after: values(after),
  });
};
