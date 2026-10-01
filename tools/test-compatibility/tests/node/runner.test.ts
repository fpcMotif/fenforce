import { afterEach, expect, test, vi } from 'vite-plus/test';
import { greeting } from '#fixtures/greeting';
import { remoteLabel } from '../../fixtures/remote-label';

vi.mock('../../fixtures/remote-label', () => ({
  remoteLabel: () => 'Synthetic workspace',
}));

afterEach(() => vi.useRealTimers());

test('ESM aliases and hoisted factories preserve serialized output', () => {
  expect(greeting(remoteLabel())).toMatchInlineSnapshot(
    `"Hello, Synthetic workspace"`,
  );
});

test('fake timers advance asynchronous work and restore real time', async () => {
  vi.useFakeTimers();
  const result = new Promise<string>((resolve) =>
    setTimeout(() => resolve('ready'), 500),
  );
  await vi.advanceTimersByTimeAsync(500);
  await expect(result).resolves.toBe('ready');
});
