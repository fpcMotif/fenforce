import { vi } from 'vite-plus/test';

import { render } from '@testing-library/react';
import { type ReactNode } from 'react';

import { AiChatTabMessageList } from '@/ai/components/AiChatTabMessageList';
import { AI_CHAT_SURFACE } from '@/ai/constants/AiChatSurface';
import { AiChatMessageListPreambleContext } from '@/ai/contexts/AiChatMessageListPreambleContext';
import { AiChatSurfaceContext } from '@/ai/contexts/AiChatSurfaceContext';
import { type AiChatSurface } from '@/ai/types/AiChatSurface';

const renderWithPreamble = (preamble: ReactNode) =>
  render(
    <AiChatMessageListPreambleContext.Provider value={preamble}>
      <AiChatTabMessageList />
    </AiChatMessageListPreambleContext.Provider>,
  );

const mockUseAtomComponentSelectorValue = vi.fn();

vi.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue',
  () => ({
    useAtomComponentSelectorValue: () => mockUseAtomComponentSelectorValue(),
  }),
);

vi.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => false,
}));

vi.mock('@/ui/utilities/scroll/components/ScrollWrapper', () => ({
  ScrollWrapper: ({
    children,
    componentInstanceId,
  }: {
    children: React.ReactNode;
    componentInstanceId: string;
  }) => (
    <div
      data-testid="scroll-wrapper"
      data-component-instance-id={componentInstanceId}
    >
      {children}
    </div>
  ),
}));

vi.mock('@/ai/components/AiChatNonLastMessageIdsList', () => ({
  AiChatNonLastMessageIdsList: () => null,
}));
vi.mock('@/ai/components/AiChatLastMessageWithStreamingState', () => ({
  AiChatLastMessageWithStreamingState: () => null,
}));
vi.mock('@/ai/components/AiChatPendingResponseIndicator', () => ({
  AiChatPendingResponseIndicator: () => null,
}));
vi.mock('@/ai/components/AiChatErrorUnderMessageList', () => ({
  AiChatErrorUnderMessageList: () => null,
}));
vi.mock('@/ai/components/AiChatScrollToBottomButton', () => ({
  AiChatScrollToBottomButton: () => null,
}));
vi.mock(
  '@/ai/components/AgentChatScrollToBottomOnDisplayedThreadChangeLayoutEffect',
  () => ({
    AgentChatScrollToBottomOnDisplayedThreadChangeLayoutEffect: () => null,
  }),
);
vi.mock('@/ai/components/AgentChatStreamingAutoScrollEffect', () => ({
  AgentChatStreamingAutoScrollEffect: () => null,
}));

describe('AiChatTabMessageList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render nothing with no messages and no preamble', () => {
    mockUseAtomComponentSelectorValue.mockReturnValue(false);

    const { container } = render(<AiChatTabMessageList />);

    expect(container).toBeEmptyDOMElement();
  });

  it('should render the preamble outside the scroll container with no messages', () => {
    mockUseAtomComponentSelectorValue.mockReturnValue(false);

    const { getByTestId, queryByTestId } = renderWithPreamble(
      <div data-testid="preamble" />,
    );

    expect(getByTestId('preamble')).toBeInTheDocument();
    expect(queryByTestId('scroll-wrapper')).not.toBeInTheDocument();
  });

  it('should render the preamble inside the message list once messages exist', () => {
    mockUseAtomComponentSelectorValue.mockReturnValue(true);

    const { getByTestId } = renderWithPreamble(<div data-testid="preamble" />);

    expect(getByTestId('scroll-wrapper')).toContainElement(
      getByTestId('preamble'),
    );
  });

  it('should give each surface its own scroll wrapper instance id', () => {
    mockUseAtomComponentSelectorValue.mockReturnValue(true);

    const renderForSurface = (surface: AiChatSurface) =>
      render(
        <AiChatSurfaceContext.Provider value={surface}>
          <AiChatTabMessageList />
        </AiChatSurfaceContext.Provider>,
      )
        .container.querySelector('[data-testid="scroll-wrapper"]')
        ?.getAttribute('data-component-instance-id');

    const pageInstanceId = renderForSurface(AI_CHAT_SURFACE.PAGE);
    const sidePanelInstanceId = renderForSurface(AI_CHAT_SURFACE.SIDE_PANEL);

    expect(pageInstanceId).not.toBe(sidePanelInstanceId);
  });
});
