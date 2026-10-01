import { vi } from 'vite-plus/test';

import { scheduleIdleCallback } from '~/utils/scheduleIdleCallback';

type RequestIdleCallback = typeof window.requestIdleCallback;
type CancelIdleCallback = typeof window.cancelIdleCallback;

const setIdleCallbackApi = (
  requestIdleCallback: RequestIdleCallback | undefined,
  cancelIdleCallback: CancelIdleCallback | undefined,
) => {
  Object.defineProperty(window, 'requestIdleCallback', {
    configurable: true,
    writable: true,
    value: requestIdleCallback,
  });
  Object.defineProperty(window, 'cancelIdleCallback', {
    configurable: true,
    writable: true,
    value: cancelIdleCallback,
  });
};

describe('scheduleIdleCallback', () => {
  const originalRequestIdleCallback = window.requestIdleCallback;
  const originalCancelIdleCallback = window.cancelIdleCallback;

  afterEach(() => {
    setIdleCallbackApi(originalRequestIdleCallback, originalCancelIdleCallback);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('when requestIdleCallback is available', () => {
    it('schedules the callback through requestIdleCallback with the timeout', () => {
      const requestIdleCallbackMock = vi.fn(() => 42);
      setIdleCallbackApi(requestIdleCallbackMock, vi.fn());

      const callback = vi.fn();
      scheduleIdleCallback(callback, { timeout: 2000 });

      expect(requestIdleCallbackMock).toHaveBeenCalledWith(callback, {
        timeout: 2000,
      });
    });

    it('cancels the scheduled callback through cancelIdleCallback', () => {
      const cancelIdleCallbackMock = vi.fn();
      setIdleCallbackApi(
        vi.fn(() => 42),
        cancelIdleCallbackMock,
      );

      const cancel = scheduleIdleCallback(vi.fn(), { timeout: 2000 });
      cancel();

      expect(cancelIdleCallbackMock).toHaveBeenCalledWith(42);
    });
  });

  describe('when requestIdleCallback is not available (e.g. Safari/iOS)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      setIdleCallbackApi(undefined, undefined);
    });

    it('falls back to running the callback after the timeout', () => {
      const callback = vi.fn();
      scheduleIdleCallback(callback, { timeout: 2000 });

      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2000);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('cancels the fallback timeout before it runs', () => {
      const callback = vi.fn();
      const cancel = scheduleIdleCallback(callback, { timeout: 2000 });

      cancel();
      vi.advanceTimersByTime(2000);

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
