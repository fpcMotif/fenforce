import { useConvexConnectionState, useMutation } from 'convex/react';
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from 'convex/server';
import { useState } from 'react';

type AccountOperationReference = FunctionReference<
  'mutation',
  'public',
  { operationId?: string }
>;

export const useAccountOperation = <
  TMutation extends AccountOperationReference,
>(
  reference: TMutation,
) => {
  const mutate = useMutation(reference);
  const { isWebSocketConnected } = useConvexConnectionState();
  const [isPending, setIsPending] = useState(false);

  const submit = async (
    args: Omit<FunctionArgs<TMutation>, 'operationId'>,
  ): Promise<FunctionReturnType<TMutation>> => {
    setIsPending(true);
    try {
      return await mutate(
        ...([
          { ...args, operationId: crypto.randomUUID() },
        ] as OptionalRestArgs<TMutation>),
      );
    } finally {
      setIsPending(false);
    }
  };

  return {
    submit,
    isPending,
    isReconnecting: isPending && !isWebSocketConnected,
  };
};
