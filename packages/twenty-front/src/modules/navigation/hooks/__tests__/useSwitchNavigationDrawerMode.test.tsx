import type * as UtilitiesModule from 'twenty-ui/utilities';
import { vi } from 'vite-plus/test';

import { useReturnFromExpandedAiChat } from '@/ai/hooks/useReturnFromExpandedAiChat';
import { useSwitchToNewAiChat } from '@/ai/hooks/useSwitchToNewAiChat';
import { useDefaultHomePagePath } from '@/navigation/hooks/useDefaultHomePagePath';
import { useSwitchNavigationDrawerMode } from '@/navigation/hooks/useSwitchNavigationDrawerMode';
import { currentMobileNavigationDrawerState } from '@/navigation/states/currentMobileNavigationDrawerState';
import { isNavigationDrawerExpandedState } from '@/ui/navigation/states/isNavigationDrawerExpanded';
import { navigationDrawerActiveTabState } from '@/ui/navigation/states/navigationDrawerActiveTabState';
import { navigationDrawerExpandedMemorizedState } from '@/ui/navigation/states/navigationDrawerExpandedMemorizedState';
import { NAVIGATION_DRAWER_TABS } from '@/ui/navigation/states/navigationDrawerTabs';
import { navigationMemorizedUrlState } from '@/ui/navigation/states/navigationMemorizedUrlState';
import { useIsMobile } from 'twenty-ui/utilities';
import { act, renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('@/ai/hooks/useReturnFromExpandedAiChat');
vi.mock('@/ai/hooks/useSwitchToNewAiChat');
vi.mock('@/navigation/hooks/useDefaultHomePagePath');
vi.mock('twenty-ui/utilities', async () => ({
  ...(await vi.importActual<typeof UtilitiesModule>('twenty-ui/utilities')),
  useIsMobile: vi.fn(),
}));

vi.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({ closeSidePanelMenu: vi.fn() }),
}));
vi.mock('@/ai/hooks/useSelectAiChatThread', () => ({
  useSelectAiChatThread: () => ({ selectAiChatThread: vi.fn() }),
}));
vi.mock('@/side-panel/hooks/useOpenAskAiPageInSidePanel', () => ({
  useOpenAskAiPageInSidePanel: () => ({ openAskAiPage: vi.fn() }),
}));

const DEFAULT_HOME_PAGE_PATH = '/objects/companies';
const AI_CHAT_PATH = '/chat/20202020-0687-4c41-b707-ed1bfca972a7';

const mockSwitchToNewChat = vi.fn();
const mockReturnFromExpandedAiChat = vi.fn();

const renderSwitchNavigationDrawerMode = ({
  pathname,
  memorizedUrl = '/objects/people',
  expandedMemorized = true,
  mobileNavigationDrawer = 'main',
}: {
  pathname: string;
  memorizedUrl?: string;
  expandedMemorized?: boolean;
  mobileNavigationDrawer?: 'main' | 'settings';
}) => {
  const store = createStore();

  store.set(navigationMemorizedUrlState.atom, memorizedUrl);
  store.set(navigationDrawerExpandedMemorizedState.atom, expandedMemorized);
  store.set(isNavigationDrawerExpandedState.atom, true);
  store.set(currentMobileNavigationDrawerState.atom, mobileNavigationDrawer);

  const { result } = renderHook(
    () => ({
      ...useSwitchNavigationDrawerMode(),
      location: useLocation(),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider store={store}>
          <MemoryRouter initialEntries={[pathname]}>{children}</MemoryRouter>
        </Provider>
      ),
    },
  );

  return { result, store };
};

describe('useSwitchNavigationDrawerMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    vi.mocked(useSwitchToNewAiChat).mockReturnValue({
      switchToNewChat: mockSwitchToNewChat,
    });
    vi.mocked(useReturnFromExpandedAiChat).mockReturnValue(
      mockReturnFromExpandedAiChat,
    );
    vi.mocked(useDefaultHomePagePath).mockReturnValue({
      defaultHomePagePath: DEFAULT_HOME_PAGE_PATH,
    });
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it('leaves settings for the memorized location and restores the mobile drawer', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const { result, store } = renderSwitchNavigationDrawerMode({
      pathname: '/settings/profile',
      expandedMemorized: false,
    });

    act(() =>
      result.current.switchNavigationDrawerMode(
        NAVIGATION_DRAWER_TABS.NAVIGATION_MENU,
      ),
    );

    expect(result.current.location.pathname).toBe('/objects/people');
    expect(store.get(isNavigationDrawerExpandedState.atom)).toBe(false);
    expect(store.get(navigationDrawerActiveTabState.atom)).toBe(
      NAVIGATION_DRAWER_TABS.NAVIGATION_MENU,
    );
  });

  it('leaves settings for the default home page when it was opened from the chat', () => {
    const { result } = renderSwitchNavigationDrawerMode({
      pathname: '/settings/profile',
      memorizedUrl: AI_CHAT_PATH,
    });

    act(() =>
      result.current.switchNavigationDrawerMode(
        NAVIGATION_DRAWER_TABS.NAVIGATION_MENU,
      ),
    );

    expect(result.current.location.pathname).toBe(DEFAULT_HOME_PAGE_PATH);
  });

  it('returns from the chat page without navigating itself', () => {
    const { result, store } = renderSwitchNavigationDrawerMode({
      pathname: AI_CHAT_PATH,
    });

    act(() =>
      result.current.switchNavigationDrawerMode(
        NAVIGATION_DRAWER_TABS.NAVIGATION_MENU,
      ),
    );

    expect(mockReturnFromExpandedAiChat).toHaveBeenCalled();
    expect(store.get(navigationDrawerActiveTabState.atom)).toBe(
      NAVIGATION_DRAWER_TABS.NAVIGATION_MENU,
    );
  });

  it('opens the chat page from the settings mode', () => {
    const { result, store } = renderSwitchNavigationDrawerMode({
      pathname: '/settings/profile',
    });

    act(() =>
      result.current.switchNavigationDrawerMode(
        NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY,
      ),
    );

    expect(mockSwitchToNewChat).toHaveBeenCalled();
    expect(store.get(navigationDrawerActiveTabState.atom)).toBe(
      NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY,
    );
  });

  it('opens the chat page when the chat history is listed on another page', () => {
    const { result } = renderSwitchNavigationDrawerMode({
      pathname: '/objects/people',
    });

    act(() =>
      result.current.switchNavigationDrawerMode(
        NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY,
      ),
    );
    act(() =>
      result.current.switchNavigationDrawerMode(
        NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY,
      ),
    );

    expect(mockSwitchToNewChat).toHaveBeenCalledTimes(2);
  });

  it('does not start a new chat when the chat page is already open', () => {
    const { result } = renderSwitchNavigationDrawerMode({
      pathname: AI_CHAT_PATH,
    });

    act(() =>
      result.current.switchNavigationDrawerMode(
        NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY,
      ),
    );

    expect(mockSwitchToNewChat).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'preserves desktop sidebar expansion (%s) when opening settings and returning home',
    (isExpanded) => {
      const { result, store } = renderSwitchNavigationDrawerMode({
        pathname: '/objects/people',
      });
      act(() => store.set(isNavigationDrawerExpandedState.atom, isExpanded));

      act(() =>
        result.current.switchNavigationDrawerMode(
          NAVIGATION_DRAWER_TABS.SETTINGS,
        ),
      );

      expect(result.current.location.pathname).toBe('/settings/profile');
      expect(store.get(isNavigationDrawerExpandedState.atom)).toBe(isExpanded);

      act(() =>
        result.current.switchNavigationDrawerMode(
          NAVIGATION_DRAWER_TABS.NAVIGATION_MENU,
        ),
      );

      expect(result.current.location.pathname).toBe('/objects/people');
      expect(store.get(isNavigationDrawerExpandedState.atom)).toBe(isExpanded);
    },
  );

  it.each([false, true])(
    'keeps the latest desktop sidebar choice (%s) when leaving settings',
    (isExpanded) => {
      const { result, store } = renderSwitchNavigationDrawerMode({
        pathname: DEFAULT_HOME_PAGE_PATH,
      });
      act(() => store.set(isNavigationDrawerExpandedState.atom, !isExpanded));
      act(() =>
        result.current.switchNavigationDrawerMode(
          NAVIGATION_DRAWER_TABS.SETTINGS,
        ),
      );
      expect(result.current.location.pathname).toBe('/settings/profile');

      act(() => store.set(isNavigationDrawerExpandedState.atom, isExpanded));
      act(() =>
        result.current.switchNavigationDrawerMode(
          NAVIGATION_DRAWER_TABS.NAVIGATION_MENU,
        ),
      );

      expect(result.current.location.pathname).toBe(DEFAULT_HOME_PAGE_PATH);
      expect(store.get(isNavigationDrawerExpandedState.atom)).toBe(isExpanded);
    },
  );

  it('stays collapsed through Home → Settings → AI → Home', async () => {
    vi.mocked(useSwitchToNewAiChat).mockImplementation(
      (
        await vi.importActual<{
          useSwitchToNewAiChat: typeof useSwitchToNewAiChat;
        }>('@/ai/hooks/useSwitchToNewAiChat')
      ).useSwitchToNewAiChat,
    );
    vi.mocked(useReturnFromExpandedAiChat).mockImplementation(
      (
        await vi.importActual<{
          useReturnFromExpandedAiChat: typeof useReturnFromExpandedAiChat;
        }>('@/ai/hooks/useReturnFromExpandedAiChat')
      ).useReturnFromExpandedAiChat,
    );
    const { result, store } = renderSwitchNavigationDrawerMode({
      pathname: DEFAULT_HOME_PAGE_PATH,
    });
    act(() => store.set(isNavigationDrawerExpandedState.atom, false));

    expect(result.current.location.pathname).toBe(DEFAULT_HOME_PAGE_PATH);
    expect(store.get(isNavigationDrawerExpandedState.atom)).toBe(false);

    for (const [mode, pathname] of [
      [NAVIGATION_DRAWER_TABS.SETTINGS, '/settings/profile'],
      [NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY, '/chat'],
      [NAVIGATION_DRAWER_TABS.NAVIGATION_MENU, DEFAULT_HOME_PAGE_PATH],
    ] as const) {
      window.history.replaceState(null, '', result.current.location.pathname);
      act(() => result.current.switchNavigationDrawerMode(mode));

      expect(result.current.location.pathname).toBe(pathname);
      expect(store.get(isNavigationDrawerExpandedState.atom)).toBe(false);
    }
    window.history.replaceState(null, '', '/');
  });

  it('opens the settings drawer on mobile even when it was closed', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const { result, store } = renderSwitchNavigationDrawerMode({
      pathname: '/objects/people',
    });
    act(() => store.set(isNavigationDrawerExpandedState.atom, false));

    act(() =>
      result.current.switchNavigationDrawerMode(
        NAVIGATION_DRAWER_TABS.SETTINGS,
      ),
    );

    expect(result.current.location.pathname).toBe('/settings/profile');
    expect(store.get(isNavigationDrawerExpandedState.atom)).toBe(true);
  });

  it('opens settings and memorizes where it came from', () => {
    const { result, store } = renderSwitchNavigationDrawerMode({
      pathname: '/objects/people',
    });

    act(() =>
      result.current.switchNavigationDrawerMode(
        NAVIGATION_DRAWER_TABS.SETTINGS,
      ),
    );

    expect(result.current.location.pathname).toBe('/settings/profile');
    expect(store.get(navigationMemorizedUrlState.atom)).toBe('/objects/people');
    expect(store.get(navigationDrawerActiveTabState.atom)).toBe(
      NAVIGATION_DRAWER_TABS.NAVIGATION_MENU,
    );
  });

  it('opens settings from a page the mobile drawer only thinks is settings', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);

    const { result } = renderSwitchNavigationDrawerMode({
      pathname: '/objects/people',
      mobileNavigationDrawer: 'settings',
    });

    act(() =>
      result.current.switchNavigationDrawerMode(
        NAVIGATION_DRAWER_TABS.SETTINGS,
      ),
    );

    expect(result.current.location.pathname).toBe('/settings/profile');
  });

  it('stays put when settings is already open', () => {
    const { result } = renderSwitchNavigationDrawerMode({
      pathname: '/settings/experience',
    });

    act(() =>
      result.current.switchNavigationDrawerMode(
        NAVIGATION_DRAWER_TABS.SETTINGS,
      ),
    );

    expect(result.current.location.pathname).toBe('/settings/experience');
  });
});
