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

export const isFilteredContactListQuery = (query: ContactListQuery) =>
  query.search !== '' || query.accountId !== undefined;
