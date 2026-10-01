import type * as ReactRouterDomModule from 'react-router-dom';
import { vi } from 'vite-plus/test';

import { useApolloFactory } from '@/apollo/hooks/useApolloFactory';
import { clearSessionGeneration } from '@/auth/utils/clearSessionGeneration';
import { getSessionGeneration } from '@/auth/utils/getSessionGeneration';
import { rotateSessionGeneration } from '@/auth/utils/rotateSessionGeneration';
import { gql } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from 'twenty-ui/components';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
afterAll(() => vi.unstubAllGlobals());

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const initialRouter =
    await vi.importActual<typeof ReactRouterDomModule>('react-router-dom');

  return {
    ...initialRouter,
    useNavigate: () => mockNavigate,
  };
});

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter
    initialEntries={['/welcome', '/verify', '/opportunities']}
    initialIndex={2}
  >
    <ToastProvider>{children}</ToastProvider>
  </MemoryRouter>
);

describe('useApolloFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    clearSessionGeneration();
  });

  it('should work as expected', () => {
    const { result } = renderHook(() => useApolloFactory(), {
      wrapper: Wrapper,
    });

    const res = result.current;

    expect(res).toBeDefined();
    expect(res).toHaveProperty('link');
    expect(res).toHaveProperty('cache');
    expect(res).toHaveProperty('query');
  });

  it('should navigate to /welcome on unauthenticated error', async () => {
    expect.assertions(6);

    rotateSessionGeneration();

    expect(getSessionGeneration()).not.toBeNull();

    const errors = [
      {
        extensions: {
          code: 'UNAUTHENTICATED',
        },
      },
    ];
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: {},
            errors,
          }),
        ),
    );

    const { result } = renderHook(
      () => {
        const location = useLocation();
        return {
          factory: useApolloFactory(),
          location,
        };
      },
      {
        wrapper: Wrapper,
      },
    );

    expect(result.current.location.pathname).toBe('/opportunities');

    let mutationError: unknown;

    try {
      await act(async () => {
        await result.current.factory.mutate({
          mutation: gql`
            mutation Track($type: String!, $sessionId: String!, $data: JSON!) {
              track(type: $type, sessionId: $sessionId, data: $data) {
                success
              }
            }
          `,
        });
      });
    } catch (error) {
      mutationError = error;
    }

    expect(mutationError).toBeInstanceOf(CombinedGraphQLErrors);
    expect(getSessionGeneration()).toBeNull();
    expect(mockNavigate).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/welcome');
  });
});
