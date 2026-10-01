import { afterEach, expect, test, vi } from 'vite-plus/test';
import { remoteLabel } from '../../fixtures/remote-label';

vi.mock('../../fixtures/remote-label');

afterEach(() => {
  vi.doUnmock('../../fixtures/remote-label');
  vi.resetModules();
  vi.restoreAllMocks();
});

test('manual mock discovery preserves the explicit fixture', () => {
  expect(remoteLabel()).toBe('Manual mock workspace');
});

test('resetModules and doUnmock restore the real ESM module', async () => {
  vi.doUnmock('../../fixtures/remote-label');
  vi.resetModules();
  const restored = await import('../../fixtures/remote-label');
  expect(restored.remoteLabel()).toBe('Unmocked workspace');
});

test('restored spies expose the original implementation', () => {
  const original = Date.now;
  vi.spyOn(Date, 'now').mockReturnValue(123);
  expect(Date.now()).toBe(123);
  vi.restoreAllMocks();
  expect(Date.now).toBe(original);
});
