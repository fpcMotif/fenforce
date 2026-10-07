import { expect, it } from 'vitest';

import { insertImportedContact } from './contactSource';
import { salesFixture, SALES_QUOTE } from '../testing/salesFixtures';
import { api } from './_generated/api';
import type { SalesCommand } from './salesContract';

it('keeps the close date date-only and requires it before quoting or confirmation', async () => {
  const fixture = await salesFixture();
  const { seller, workspaceId } = fixture;
  const { closeDate: _closeDate, ...withoutCloseDate } = fixture.createArgs;
  const projectId = await seller.session.mutation(api.salesProjects.create, {
    ...withoutCloseDate,
    operationId: 'create-without-close-date',
  });
  const read = () =>
    seller.session.query(api.salesProjects.get, { workspaceId, projectId });
  const run = async (command: SalesCommand, operationId: string) => {
    const project = await read();
    return seller.session.mutation(api.salesProjects.execute, {
      workspaceId,
      projectId,
      expectedRevision: project?.revision ?? 0,
      operationId,
      command,
    });
  };
  expect(await read()).toMatchObject({ closeDate: null });
  expect((await fixture.get())?.closeDate).toBe('2099-11-01');
  await run(SALES_QUOTE, 'quote');
  await expect(
    run({ type: 'markQuoteSent', evidenceReference: 'DEMO-email' }, 'sent'),
  ).rejects.toThrow('SALES_CLOSE_DATE_REQUIRED');
  for (const closeDate of ['2099-02-30', '2099-1-01', ' 2099-01-01'])
    await expect(
      run({ type: 'setCloseDate', closeDate }, `bad-${closeDate}`),
    ).rejects.toThrow('SALES_INVALID_DATE');
  await run({ type: 'setCloseDate', closeDate: '2099-12-31' }, 'close-date');
  await run(
    { type: 'markQuoteSent', evidenceReference: 'DEMO-email' },
    'sent-again',
  );
  expect(await read()).toMatchObject({
    closeDate: '2099-12-31',
    stage: 'quoted',
  });
  await expect(
    run({ type: 'setCloseDate', closeDate: null }, 'clear'),
  ).rejects.toThrow('SALES_CLOSE_DATE_REQUIRED');
});

it('links a primary Contact only from the same active Account', async () => {
  const fixture = await salesFixture();
  const { test, workspaceId, accountB, contactA, other, seller, outsider } =
    fixture;
  const contactB = await test.run((context) =>
    insertImportedContact(context, {
      workspaceId,
      accountId: accountB,
      actorId: other.memberId,
      sourceId: 'contact-b',
      lastName: 'Foreign',
      email: null,
    }),
  );
  const contactX = await test.run((context) =>
    insertImportedContact(context, {
      workspaceId: fixture.otherWorkspaceId,
      accountId: fixture.accountX,
      actorId: outsider.memberId,
      sourceId: 'contact-x',
      lastName: 'Outsider',
      email: null,
    }),
  );
  for (const contactId of [contactB, contactX])
    await expect(
      fixture.command({ type: 'setPrimaryContact', contactId }),
    ).rejects.toThrow('CONTACT_NOT_FOUND');
  await expect(
    seller.session.mutation(api.salesProjects.create, {
      ...fixture.createArgs,
      operationId: 'create-foreign-contact',
      primaryContactId: contactB,
    }),
  ).rejects.toThrow('CONTACT_NOT_FOUND');
  expect(await fixture.get()).toMatchObject({
    revision: 1,
    primaryContactId: null,
  });
  await fixture.command({ type: 'setPrimaryContact', contactId: contactA });
  expect(await fixture.get()).toMatchObject({
    revision: 2,
    primaryContactId: contactA,
  });
  await test.run((context) =>
    context.db.patch(contactA, { deletedAt: Date.now() }),
  );
  await expect(
    seller.session.mutation(api.salesProjects.create, {
      ...fixture.createArgs,
      operationId: 'create-trashed-contact',
      primaryContactId: contactA,
    }),
  ).rejects.toThrow('CONTACT_NOT_FOUND');
  await fixture.command({ type: 'setPrimaryContact', contactId: null });
  expect(await fixture.get()).toMatchObject({
    revision: 3,
    primaryContactId: null,
  });
});
