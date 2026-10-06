import { vi } from 'vite-plus/test';
import { act, renderHook } from '@testing-library/react';
import { ConvexError } from 'convex/values';

import { useAccountOperation } from '~/pages/convex-preview/useAccountOperation';
import { api } from '../../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../../deployments/convex/convex/_generated/dataModel';

const mutation = vi.fn();
let mockIsWebSocketConnected = true;
vi.mock('convex/react', () => ({
  useMutation: () => mutation,
  useConvexConnectionState: () => ({
    isWebSocketConnected: mockIsWebSocketConnected,
  }),
}));

const trashArguments = {
  workspaceId: 'workspace' as Id<'workspaces'>,
  companyId: 'company' as Id<'workspaceCompanies'>,
  expectedRevision: 2,
};

const operationIds = () =>
  mutation.mock.calls.map(
    ([args]) => (args as { operationId: string }).operationId,
  );

beforeEach(() => {
  mutation.mockReset();
  mockIsWebSocketConnected = true;
});

it('reports reconnecting while the client holds a submit through an outage and confirms it once', async () => {
  let acknowledge: ((value: unknown) => void) | undefined;
  mutation.mockReturnValue(
    new Promise((resolve) => {
      acknowledge = resolve;
    }),
  );
  const { result, rerender } = renderHook(() =>
    useAccountOperation(api.accountLifecycle.trash),
  );
  let submitted: Promise<unknown> = Promise.resolve();
  act(() => {
    submitted = result.current.submit(trashArguments);
  });
  expect(result.current.isPending).toBe(true);
  expect(result.current.isReconnecting).toBe(false);

  mockIsWebSocketConnected = false;
  rerender();
  expect(result.current.isReconnecting).toBe(true);

  mockIsWebSocketConnected = true;
  rerender();
  expect(result.current.isReconnecting).toBe(false);
  expect(result.current.isPending).toBe(true);

  await act(async () => {
    acknowledge?.({ revision: 3, changed: true });
    await expect(submitted).resolves.toEqual({ revision: 3, changed: true });
  });
  expect(result.current.isPending).toBe(false);
  expect(mutation).toHaveBeenCalledTimes(1);
  expect(mutation).toHaveBeenCalledWith({
    ...trashArguments,
    operationId: operationIds()[0],
  });
});

it('rejects a stale revision with the server conflict', async () => {
  mutation.mockRejectedValue(new ConvexError('COMPANY_CHANGED'));
  const { result } = renderHook(() =>
    useAccountOperation(api.accountLifecycle.trash),
  );
  await act(async () => {
    await expect(result.current.submit(trashArguments)).rejects.toEqual(
      new ConvexError('COMPANY_CHANGED'),
    );
  });
  expect(result.current.isPending).toBe(false);
  expect(mutation).toHaveBeenCalledTimes(1);
});

it('surfaces a server failure once without retrying', async () => {
  const failure = new Error('Server Error');
  mutation.mockRejectedValue(failure);
  const { result } = renderHook(() =>
    useAccountOperation(api.accountLifecycle.trash),
  );
  await act(async () => {
    await expect(result.current.submit(trashArguments)).rejects.toBe(failure);
  });
  expect(result.current.isPending).toBe(false);
  expect(result.current.isReconnecting).toBe(false);
  expect(mutation).toHaveBeenCalledTimes(1);
});

it('starts a new operation for each submit', async () => {
  mutation
    .mockRejectedValueOnce(new ConvexError('COMPANY_CHANGED'))
    .mockResolvedValue({ revision: 3, changed: true });
  const { result } = renderHook(() =>
    useAccountOperation(api.accountLifecycle.trash),
  );
  await act(async () => {
    await expect(result.current.submit(trashArguments)).rejects.toEqual(
      new ConvexError('COMPANY_CHANGED'),
    );
  });
  await act(async () => {
    await result.current.submit(trashArguments);
  });
  await act(async () => {
    await result.current.submit(trashArguments);
  });
  expect(mutation).toHaveBeenCalledTimes(3);
  expect(new Set(operationIds()).size).toBe(3);
});
