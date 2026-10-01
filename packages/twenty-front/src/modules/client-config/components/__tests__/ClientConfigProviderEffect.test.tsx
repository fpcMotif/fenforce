import { vi } from 'vite-plus/test';

import { StrictMode } from 'react';
import { render } from '@testing-library/react';

import { ClientConfigProviderEffect } from '@/client-config/components/ClientConfigProviderEffect';

const initializeClientConfig = vi.fn();

vi.mock('@/client-config/hooks/useClientConfig', () => ({
  useClientConfig: () => ({ initializeClientConfig }),
}));

vi.mock('@/ui/utilities/state/jotai/hooks/useAtomState', () => ({
  useAtomState: () => [{ isLoadedOnce: false, isLoading: false }, vi.fn()],
}));

it('initializes once when StrictMode replays startup effects', () => {
  render(
    <StrictMode>
      <ClientConfigProviderEffect />
    </StrictMode>,
  );

  expect(initializeClientConfig).toHaveBeenCalledTimes(1);
});
