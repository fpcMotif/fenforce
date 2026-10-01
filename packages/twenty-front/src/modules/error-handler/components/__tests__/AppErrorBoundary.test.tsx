import type * as ReactModule from '@sentry/react';
import type * as ReloadWindowModule from '~/utils/reloadWindow';
import { type MockInstance, vi } from 'vite-plus/test';

import { render, screen, waitFor } from '@testing-library/react';

import { AppErrorBoundary } from '@/error-handler/components/AppErrorBoundary';
import { STALE_CHUNK_RELOAD_TIMESTAMP_KEY } from '@/error-handler/constants/StaleChunkReloadTimestampKey';

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

vi.mock('~/utils/reloadWindow', () => ({
  reloadWindow: vi.fn(),
}));

const { captureException, flush } =
  await vi.importMock<typeof ReactModule>('@sentry/react');
const { reloadWindow } = await vi.importMock<typeof ReloadWindowModule>(
  '~/utils/reloadWindow',
);

const STALE_CHUNK_ERROR_MESSAGE =
  'Failed to fetch dynamically imported module: /assets/Page.js';

type ThrowerProps = {
  error: Error;
};

const Thrower = ({ error }: ThrowerProps): never => {
  throw error;
};

const Fallback = () => <div>fallback content</div>;

const renderWithBoundary = (error: Error) =>
  render(
    <AppErrorBoundary
      FallbackComponent={Fallback}
      resetOnLocationChange={false}
    >
      <Thrower error={error} />
    </AppErrorBoundary>,
  );

describe('AppErrorBoundary', () => {
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    window.sessionStorage.clear();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should capture with Sentry then reload on a stale chunk error when no reload happened recently', async () => {
    renderWithBoundary(new Error(STALE_CHUNK_ERROR_MESSAGE));

    expect(
      window.sessionStorage.getItem(STALE_CHUNK_RELOAD_TIMESTAMP_KEY),
    ).not.toBeNull();

    await waitFor(() => {
      expect(reloadWindow).toHaveBeenCalledTimes(1);
    });

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.invocationCallOrder[0]).toBeLessThan(
      reloadWindow.mock.invocationCallOrder[0],
    );
  });

  it('should still reload after the flush timeout when the Sentry flush hangs', async () => {
    vi.useFakeTimers();
    flush.mockImplementationOnce(() => new Promise(() => {}));

    renderWithBoundary(new Error(STALE_CHUNK_ERROR_MESSAGE));

    await vi.advanceTimersByTimeAsync(0);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(reloadWindow).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);

    expect(reloadWindow).toHaveBeenCalledTimes(1);
  });

  it('should not reload on a stale chunk error within the reload cooldown', async () => {
    window.sessionStorage.setItem(
      STALE_CHUNK_RELOAD_TIMESTAMP_KEY,
      Date.now().toString(),
    );

    renderWithBoundary(new Error(STALE_CHUNK_ERROR_MESSAGE));

    expect(screen.getByText('fallback content')).toBeInTheDocument();

    await waitFor(() => {
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    expect(reloadWindow).not.toHaveBeenCalled();
  });

  it('should not reload on a stale chunk error when the reload timestamp cannot be stored', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sessionStorage access denied');
    });

    renderWithBoundary(new Error(STALE_CHUNK_ERROR_MESSAGE));

    expect(screen.getByText('fallback content')).toBeInTheDocument();

    await waitFor(() => {
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    expect(reloadWindow).not.toHaveBeenCalled();
  });

  it('should not reload on other errors and still capture them', async () => {
    renderWithBoundary(new Error('Some unrelated error'));

    expect(screen.getByText('fallback content')).toBeInTheDocument();

    await waitFor(() => {
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    expect(reloadWindow).not.toHaveBeenCalled();
  });
});
