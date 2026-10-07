import { expect, it } from 'vitest';

import { m1Fixture } from '../testing/contactFixtures';
import { findContactBySourceId, insertImportedContact } from './contactSource';

it('maps a source ID to one contact per workspace and rejects a second import of it', async () => {
  const { test, workspaceId, seller, accountA, contactA, otherWorkspaceId } =
    await m1Fixture();
  expect(
    await test.run(
      async (context) =>
        (await findContactBySourceId(context, workspaceId, 'contact-a'))?._id,
    ),
  ).toBe(contactA);
  expect(
    await test.run((context) =>
      findContactBySourceId(context, otherWorkspaceId, 'contact-a'),
    ),
  ).toBeNull();
  await expect(
    test.run((context) =>
      insertImportedContact(context, {
        workspaceId,
        accountId: accountA,
        actorId: seller.memberId,
        sourceId: 'contact-a',
        lastName: 'Duplicate',
        email: null,
      }),
    ),
  ).rejects.toThrow('DUPLICATE_CONTACT_SOURCE_ID');
  expect(
    await test.run(async (context) => ({
      contact: await context.db.get(contactA),
      audits: await context.db
        .query('contactAudit')
        .withIndex('by_contactId', (index) => index.eq('contactId', contactA))
        .collect(),
    })),
  ).toMatchObject({
    contact: { revision: 1, lastName: 'Synthetic', email: null },
    audits: [{ actorId: seller.memberId, before: null }],
  });
});
