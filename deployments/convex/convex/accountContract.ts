import { ConvexError, v, type Infer } from 'convex/values';

import { ACCOUNT_FIELDS } from './accountFields';

export const industryValidator = v.union(
  v.literal('services'),
  v.literal('manufacturing'),
  v.null(),
);
export const industryInputValidator = v.union(industryValidator, v.literal(''));
export const normalizeIndustry = (
  value: Infer<typeof industryInputValidator> | undefined,
) => (value === '' ? null : (value ?? null));
export const domainNameValidator = v.object({
  primaryLinkUrl: v.string(),
  primaryLinkLabel: v.string(),
  secondaryLinks: v.array(v.object({ url: v.string(), label: v.string() })),
});

export const accountValuesValidator = v.object({
  name: v.string(),
  industry: industryValidator,
  accountOwnerId: v.union(v.id('workspaceMembers'), v.null()),
  domainName: domainNameValidator,
  revision: v.number(),
  deletedAt: v.union(v.number(), v.null()),
});

export const normalizeAccountName = (value: string) => {
  const name = value.trim();
  if (name.length === 0 || name.length > ACCOUNT_FIELDS.name.maxLength) {
    throw new ConvexError('INVALID_COMPANY_NAME');
  }
  return name;
};
