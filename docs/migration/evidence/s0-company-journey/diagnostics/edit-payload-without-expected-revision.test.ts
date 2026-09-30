import { convexTest } from 'convex-test';
import { expect, it } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

it('rejects the preview edit payload that lacks expectedRevision', async () => {
  const test = convexTest(schema, modules);
  const alice = test.withIdentity({ tokenIdentifier: 'issuer|alice' });
  const workspaceId = await alice.mutation(api.workspaces.create, {
    name: 'Acme',
  });
  const companyId = await alice.mutation(api.workspaceCompanies.create, {
    workspaceId,
    name: 'Before',
  });
  const previewPayload = {
    workspaceId,
    companyId,
    name: 'After',
    domainName: '',
    accountOwnerId: null,
  };

  const outcome = await alice
    .mutation(api.workspaceCompanies.update, previewPayload as never)
    .then(
      () => 'accepted',
      (error: unknown) =>
        `rejected: ${String(error instanceof Error ? error.message : error).split('\n')[0]}`,
    );
  const stored = await alice.query(api.workspaceCompanies.get, {
    workspaceId,
    companyId,
  });

  console.log(`EDIT_PROBE ${outcome}`);
  console.log(
    `EDIT_PROBE_STORED name=${stored?.name} revision=${stored?.revision}`,
  );
  expect(outcome).toContain('expectedRevision');
  expect(stored?.name).toBe('Before');
});
