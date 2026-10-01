import { vi } from 'vite-plus/test';

import { useLogicFunctionUpdateFormState } from '@/logic-functions/hooks/useLogicFunctionUpdateFormState';
import { renderHook } from '@testing-library/react';

vi.mock('@/logic-functions/hooks/useGetOneLogicFunction', () => ({
  useGetOneLogicFunction: vi.fn(),
}));

vi.mock('@/logic-functions/hooks/useGetLogicFunctionSourceCode', () => ({
  useGetLogicFunctionSourceCode: vi.fn(),
}));

const mockCode = 'export const main = async (): Promise<void> => { return; }';

describe('useLogicFunctionUpdateFormState', () => {
  test('should return a form', async () => {
    const logicFunctionId = 'logicFunctionId';
    const useGetOneLogicFunctionMock = await vi.importMock<{
      useGetOneLogicFunction: ReturnType<typeof vi.fn>;
    }>('@/logic-functions/hooks/useGetOneLogicFunction');
    const useGetLogicFunctionSourceCodeMock = await vi.importMock<{
      useGetLogicFunctionSourceCode: ReturnType<typeof vi.fn>;
    }>('@/logic-functions/hooks/useGetLogicFunctionSourceCode');
    useGetOneLogicFunctionMock.useGetOneLogicFunction.mockReturnValue({
      logicFunction: { name: 'name' },
      loading: false,
    });
    useGetLogicFunctionSourceCodeMock.useGetLogicFunctionSourceCode.mockReturnValue(
      {
        code: mockCode,
        loading: false,
      },
    );
    const { result } = renderHook(() =>
      useLogicFunctionUpdateFormState({ logicFunctionId }),
    );

    const { formValues } = result.current;

    expect(formValues).toEqual({
      name: 'name',
      description: '',
      sourceHandlerCode: '',
      timeoutSeconds: 300,
      cronTriggerSettings: null,
      databaseEventTriggerSettings: null,
      httpRouteTriggerSettings: null,
      toolTriggerSettings: null,
      workflowActionTriggerSettings: null,
    });
  });
});
