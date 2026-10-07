import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useSalesLabels } from '~/pages/convex-preview/SalesLabels';

const renderLabels = () =>
  renderHook(() => useSalesLabels(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
        {children}
      </I18nProvider>
    ),
  }).result.current;

it('keeps sample outcomes distinct from review decisions that share a value', () => {
  const labels = renderLabels();
  expect(labels.sampleStatus('rejected')).toBe('Customer rejected');
  expect(labels.decision('rejected')).toBe('Rejected');
  expect(labels.sampleStatus('accepted')).toBe('Customer accepted');
  expect(labels.erpState('accepted')).toBe('Demo: accepted');
  expect(labels.reviewStatus('approved')).toBe('Approved');
});

it('labels stages and history events from their own domains', () => {
  const labels = renderLabels();
  expect(labels.stage('quoted')).toBe('Quote sent');
  expect(labels.event('setCloseDate')).toBe('Expected close date updated');
  expect(labels.gate('osbo')).toBe('OSBO');
  expect(labels.problem('SALES_SIMULATED_APPROVAL')).toBe(
    'A simulated decision cannot approve this change. Apply a verified approval.',
  );
});
