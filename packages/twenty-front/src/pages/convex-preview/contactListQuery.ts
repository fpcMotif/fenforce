import { ConvexError } from 'convex/values';

import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';
import { CONTACT_FIELDS } from '../../../../../deployments/convex/convex/contactFields';

export type ContactListSearch = {
  q?: string;
  company?: string;
};

export type ContactListQuery = {
  search: string;
  accountId: Id<'workspaceCompanies'> | undefined;
};

const readNonEmptyString = (value: unknown) =>
  typeof value === 'string' && value !== '' ? value : undefined;

export const parseContactListSearch = (
  search: Record<string, unknown>,
): ContactListSearch => ({
  q: readNonEmptyString(search.q),
  company: readNonEmptyString(search.company),
});

export const readContactListQuery = (
  search: ContactListSearch,
): ContactListQuery => ({
  search: (search.q ?? '').slice(0, CONTACT_FIELDS.lastName.maxLength),
  accountId: search.company as Id<'workspaceCompanies'> | undefined,
});

export const toContactListSearch = (
  query: ContactListQuery,
): ContactListSearch => ({
  q: query.search === '' ? undefined : query.search,
  company: query.accountId,
});

export const toContactListArgs = (query: ContactListQuery) => ({
  ...(query.search === '' ? {} : { search: query.search }),
  ...(query.accountId === undefined ? {} : { accountId: query.accountId }),
});

const isInvalidArgumentError = (error: unknown, argumentName: string) =>
  !(error instanceof ConvexError) &&
  error instanceof Error &&
  error.message.includes('ArgumentValidationError') &&
  error.message.includes(argumentName);

export const isCompanyFilterError = (error: unknown) =>
  error instanceof ConvexError
    ? error.data === 'COMPANY_NOT_FOUND'
    : isInvalidArgumentError(error, 'accountId');

export const isMalformedPersonIdError = (error: unknown) =>
  isInvalidArgumentError(error, 'contactId');

export const isFilteredContactListQuery = (query: ContactListQuery) =>
  query.search !== '' || query.accountId !== undefined;
