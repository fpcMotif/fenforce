import { ConvexError, v, type Infer } from 'convex/values';

import { CONTACT_FIELDS } from './contactFields';

export const contactValuesValidator = v.object({
  accountId: v.id('workspaceCompanies'),
  lastName: v.string(),
  email: v.union(v.string(), v.null()),
  revision: v.number(),
  deletedAt: v.union(v.number(), v.null()),
});

export const contactOperationValidator = v.union(
  v.literal('create'),
  v.literal('update'),
  v.literal('trash'),
  v.literal('restore'),
);
export type ContactOperation = Infer<typeof contactOperationValidator>;

export const normalizeContactLastName = (value: string) => {
  const lastName = value.trim();
  if (
    lastName.length === 0 ||
    lastName.length > CONTACT_FIELDS.lastName.maxLength
  )
    throw new ConvexError('INVALID_CONTACT_LAST_NAME');
  return lastName;
};

const isEmailDomain = (domain: string) => {
  const dot = domain.indexOf('.');
  return dot > 0 && domain.lastIndexOf('.') < domain.length - 1;
};

const isEmailAddress = (email: string) => {
  const parts = email.split('@');
  return (
    email.length <= CONTACT_FIELDS.email.maxLength &&
    !/\s/.test(email) &&
    parts.length === 2 &&
    parts[0].length > 0 &&
    isEmailDomain(parts[1])
  );
};

export const normalizeContactEmail = (value: string | null) => {
  if (value === null) return null;
  const email = value.trim();
  if (email.length === 0) return null;
  if (!isEmailAddress(email)) throw new ConvexError('INVALID_CONTACT_EMAIL');
  return email;
};
