import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';

import { signedInAs } from '../testing/sessionFixtures';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const createFixture = async () => {
  const test = convexTest(schema, modules);
  const { session } = await signedInAs(test, 'Domain editor');
  const workspaceId = await session.mutation(api.workspaces.create, {
    name: 'Company domains',
  });
  return { test, session, workspaceId };
};

describe('company domain acceptance from Twenty 1bf3ec68 record writes', () => {
  it.each([
    ['example.com', 'example.com'],
    ['https://www.Example.com/careers?x=1#team', 'example.com'],
    ['TWENTY.com', 'twenty.com'],
    ['www.twenty.com', 'twenty.com'],
    ['https://twenty.com', 'twenty.com'],
    ['https://www.twenty.com/', 'twenty.com'],
    ['http://www.Twenty.com/careers?utm=1#team', 'twenty.com'],
    ['  https://twenty.com  ', 'twenty.com'],
    ['twenty.com:8080', 'twenty.com'],
    ['https://example.com:8443', 'example.com'],
    ['https://user:secret@www.twenty.com', 'twenty.com'],
    ['https://blog.twenty.com', 'blog.twenty.com'],
    ['twenty.co.uk', 'twenty.co.uk'],
    ['münchen.de', 'xn--mnchen-3ya.de'],
    ['https://München.de', 'xn--mnchen-3ya.de'],
    ['xn--mnchen-3ya.de', 'xn--mnchen-3ya.de'],
    ['twenty.com\\@evil.com', 'twenty.com'],
    ['https://twenty.com\\evil.com/x', 'twenty.com'],
    ['https://a@b@twenty.com', 'twenty.com'],
    ['www.www.twenty.com', 'twenty.com'],
    ['HTTPS://www.TWENTY.com', 'twenty.com'],
    ['_api.example.com', '_api.example.com'],
    [`https://www.example.com/${'a'.repeat(2050)}`, 'example.com'],
  ])(
    'matches accepted legacy domain vector %# on create and update',
    async (input, host) => {
      const { test, session, workspaceId } = await createFixture();
      const createdId = await session.mutation(api.workspaceCompanies.create, {
        workspaceId,
        name: 'Created company',
        domainName: input,
      });
      const updatedId = await session.mutation(api.workspaceCompanies.create, {
        workspaceId,
        name: 'Updated company',
        domainName: 'previous.example',
      });
      await session.mutation(api.workspaceCompanies.update, {
        workspaceId,
        companyId: updatedId,
        expectedRevision: 1,
        domainName: input,
      });
      const domainName = {
        primaryLinkUrl: `https://${host}`,
        primaryLinkLabel: host,
        secondaryLinks: [],
      };

      for (const companyId of [createdId, updatedId]) {
        expect(
          await session.query(api.workspaceCompanies.get, {
            workspaceId,
            companyId,
          }),
        ).toMatchObject({ domainName });
        expect(
          await test.run((context) => context.db.get(companyId)),
        ).toMatchObject({
          domainName,
        });
      }

      const companies = await session.query(api.workspaceCompanies.list, {
        workspaceId,
        paginationOpts: { numItems: 10, cursor: null },
      });
      expect(companies.page.map((company) => company.domainName)).toEqual([
        domainName,
        domainName,
      ]);
    },
  );

  it.each([
    'twenty.com.',
    'twenty.com..',
    'ftp://twenty.com',
    'not a domain',
    'twenty',
    'javascript:alert(1)',
    '<script>',
    'localhost',
    '127.0.0.1',
    '192.168.1.1',
    'http://[::1]',
    '   ',
    'HtTp://twenty.com',
    'example.123',
  ])(
    'rejects legacy-invalid domain %s without changing the record',
    async (input) => {
      const { session, workspaceId } = await createFixture();
      await expect(
        session.mutation(api.workspaceCompanies.create, {
          workspaceId,
          name: 'Rejected creation',
          domainName: input,
        }),
      ).rejects.toThrow('INVALID_DOMAIN_NAME');
      const companyId = await session.mutation(api.workspaceCompanies.create, {
        workspaceId,
        name: 'Existing company',
        domainName: 'previous.example',
      });
      const before = await session.query(api.workspaceCompanies.get, {
        workspaceId,
        companyId,
      });
      await expect(
        session.mutation(api.workspaceCompanies.update, {
          workspaceId,
          companyId,
          expectedRevision: 1,
          name: 'Rejected edit',
          domainName: input,
        }),
      ).rejects.toThrow('INVALID_DOMAIN_NAME');
      expect(
        await session.query(api.workspaceCompanies.get, {
          workspaceId,
          companyId,
        }),
      ).toEqual(before);
    },
  );

  it('keeps omitted domains unchanged and allows an empty domain to clear the field', async () => {
    const { session, workspaceId } = await createFixture();
    const companyId = await session.mutation(api.workspaceCompanies.create, {
      workspaceId,
      name: 'Company without a domain',
    });
    const emptyDomain = {
      primaryLinkUrl: '',
      primaryLinkLabel: '',
      secondaryLinks: [],
    };
    expect(
      await session.query(api.workspaceCompanies.get, {
        workspaceId,
        companyId,
      }),
    ).toMatchObject({ domainName: emptyDomain });
    await session.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId,
      expectedRevision: 1,
      domainName: 'https://www.example.com/path',
    });
    await session.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId,
      expectedRevision: 2,
      name: 'Unrelated edit',
    });
    expect(
      await session.query(api.workspaceCompanies.get, {
        workspaceId,
        companyId,
      }),
    ).toMatchObject({
      domainName: {
        primaryLinkUrl: 'https://example.com',
        primaryLinkLabel: 'example.com',
        secondaryLinks: [],
      },
    });
    await session.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId,
      expectedRevision: 3,
      domainName: '',
    });
    expect(
      await session.query(api.workspaceCompanies.get, {
        workspaceId,
        companyId,
      }),
    ).toMatchObject({ domainName: emptyDomain });
  });
});
