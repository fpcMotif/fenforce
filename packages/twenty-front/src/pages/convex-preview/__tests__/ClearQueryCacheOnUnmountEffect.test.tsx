import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

import { ClearQueryCacheOnUnmountEffect } from '~/pages/convex-preview/ClearQueryCacheOnUnmountEffect';

describe('ClearQueryCacheOnUnmountEffect', () => {
  it('keeps cached data while mounted and drops it once unmounted', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['workspaces'], ['Previous user workspace']);

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <ClearQueryCacheOnUnmountEffect />
      </QueryClientProvider>,
    );

    expect(queryClient.getQueryData(['workspaces'])).toEqual([
      'Previous user workspace',
    ]);

    unmount();

    expect(queryClient.getQueryData(['workspaces'])).toBeUndefined();
  });
});
