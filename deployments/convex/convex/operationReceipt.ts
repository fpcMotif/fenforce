import { ConvexError } from 'convex/values';

export const validateOperationId = (operationId: string) => {
  if (
    operationId.trim() !== operationId ||
    operationId.length === 0 ||
    operationId.length > 200
  )
    throw new ConvexError('INVALID_OPERATION_ID');
};

export const operationPayload = (args: Record<string, unknown>) =>
  JSON.stringify(
    Object.entries(args)
      .filter(([key, value]) => key !== 'operationId' && value !== undefined)
      .sort(([first], [second]) => first.localeCompare(second)),
  );
