import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConvexError } from 'convex/values';

import type { Id } from '../../../../../../deployments/convex/convex/_generated/dataModel';
import { CompanyForm } from '~/pages/convex-preview/CompanyForm';

vi.mock('@convex-dev/react-query', () => ({
  useConvexPaginatedQuery: () => ({
    status: 'Exhausted',
    results: [{ memberId: 'manager', displayName: 'Sales Manager' }],
  }),
}));

it('creates an account with a code-defined industry and the default actor owner', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <CompanyForm
        workspaceId={'workspace' as Id<'workspaces'>}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    </I18nProvider>,
  );
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Acme');
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Industry' }),
    'services',
  );
  await user.click(screen.getByRole('button', { name: 'Create company' }));
  expect(onSave).toHaveBeenCalledWith({
    name: 'Acme',
    industry: 'services',
    domainName: '',
  });
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute(
    'maxlength',
    '200',
  );
});

it('keeps ownership read-only when the server denies reassignment', () => {
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <CompanyForm
        workspaceId={'workspace' as Id<'workspaces'>}
        canReassignOwner={false}
        ownerName="Seller A"
        initialValues={{
          name: 'Acme',
          industry: null,
          accountOwnerId: 'seller-a' as Id<'workspaceMembers'>,
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    </I18nProvider>,
  );
  expect(screen.queryByRole('combobox', { name: 'Account Owner' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Account Owner' })).toHaveValue(
    'Seller A',
  );
  expect(
    screen.getByRole('textbox', { name: 'Account Owner' }),
  ).toHaveAttribute('readonly');
});

it('keeps entered values and explains a rejected stale edit without reporting success', async () => {
  const onSave = vi.fn().mockRejectedValue(new ConvexError('COMPANY_CHANGED'));
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <CompanyForm
        workspaceId={'workspace' as Id<'workspaces'>}
        initialValues={{ name: 'Acme', industry: null, domainName: '' }}
        onSave={onSave}
        onCancel={onCancel}
      />
    </I18nProvider>,
  );
  await user.type(screen.getByRole('textbox', { name: 'Name' }), ' revised');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This company changed while you were editing',
  );
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
    'Acme revised',
  );
  expect(onCancel).not.toHaveBeenCalled();
});

it('omits unchanged compound domain and owner values on an ordinary edit', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <CompanyForm
        workspaceId={'workspace' as Id<'workspaces'>}
        initialValues={{
          name: 'Acme',
          industry: 'manufacturing',
          domainName: 'example.com',
          accountOwnerId: 'manager' as Id<'workspaceMembers'>,
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    </I18nProvider>,
  );
  await user.clear(screen.getByRole('textbox', { name: 'Name' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Name' }),
    'Acme revised',
  );
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(onSave).toHaveBeenCalledWith({
    name: 'Acme revised',
    industry: 'manufacturing',
  });
});

it.each([
  { locale: 'zh', name: '公司名称', industry: '行业', create: '创建公司' },
  { locale: 'en', name: '[Ñååmëë — expanded]', industry: '[Ïñdüstrÿ — expanded]', create: '[Çrëåtë çømpåñÿ — expanded]' },
])('keeps stable values with $locale translated labels in an RTL container', async ({ locale, name, industry, create }) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  const messages = {
    [msg`Name`.id]: name,
    [msg`Industry`.id]: industry,
    [msg`Create company`.id]: create,
  };
  render(<div dir="rtl"><I18nProvider i18n={setupI18n({ locale, messages: { [locale]: messages } })}><CompanyForm workspaceId={'workspace' as Id<'workspaces'>} onSave={onSave} onCancel={vi.fn()} /></I18nProvider></div>);
  await user.type(screen.getByRole('textbox', { name }), '上海 شركة');
  await user.selectOptions(screen.getByRole('combobox', { name: industry }), 'manufacturing');
  await user.click(screen.getByRole('button', { name: create }));
  expect(onSave).toHaveBeenCalledWith({ name: '上海 شركة', industry: 'manufacturing', domainName: '' });
});
