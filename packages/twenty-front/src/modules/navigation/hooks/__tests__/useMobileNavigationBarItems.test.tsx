import { vi } from 'vite-plus/test';

import { useSwitchToNewAiChat } from '@/ai/hooks/useSwitchToNewAiChat';
import { useMobileNavigationBarItems } from '@/navigation/hooks/useMobileNavigationBarItems';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { type ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

vi.mock('@/ai/hooks/useSwitchToNewAiChat');
vi.mock('@/settings/roles/hooks/useHasPermissionFlag');

vi.mock('@/object-metadata/hooks/useFilteredObjectMetadataItems', () => ({
  useFilteredObjectMetadataItems: () => ({
    alphaSortedActiveNonSystemObjectMetadataItems: [],
  }),
}));

vi.mock('@/side-panel/hooks/useOpenRecordsSearchPageInSidePanel', () => ({
  useOpenRecordsSearchPageInSidePanel: () => ({
    openRecordsSearchPage: vi.fn(),
  }),
}));

vi.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({ closeSidePanelMenu: vi.fn() }),
}));

const mockSwitchToNewChat = vi.fn();

const renderMobileNavigationBarItems = (
  pathname: string,
  previousPathnames: string[] = [],
) => {
  const store = createStore();

  const { result } = renderHook(
    () => ({
      ...useMobileNavigationBarItems(),
      location: useLocation(),
      navigate: useNavigate(),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <I18nProvider i18n={i18n}>
          <Provider store={store}>
            <MemoryRouter initialEntries={[...previousPathnames, pathname]}>
              {children}
            </MemoryRouter>
          </Provider>
        </I18nProvider>
      ),
    },
  );

  return { result, store };
};

const tapItem = (
  result: { current: { items: { name: string; onClick: () => void }[] } },
  name: string,
) => result.current.items.find((item) => item.name === name)?.onClick();

describe('useMobileNavigationBarItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    vi.mocked(useHasPermissionFlag).mockReturnValue(true);
    vi.mocked(useSwitchToNewAiChat).mockReturnValue({
      switchToNewChat: mockSwitchToNewChat,
    });
  });

  it('offers home, search and a new chat', () => {
    const { result } = renderMobileNavigationBarItems('/objects/people');

    expect(result.current.items.map(({ name }) => name)).toEqual([
      'home',
      'search',
      'newAiChat',
    ]);
  });

  it('drops the new chat when the workspace has no AI permission', () => {
    vi.mocked(useHasPermissionFlag).mockReturnValue(false);

    const { result } = renderMobileNavigationBarItems('/objects/people');

    expect(result.current.items.map(({ name }) => name)).toEqual([
      'home',
      'search',
    ]);
  });

  it('marks home as active on the home page only', () => {
    expect(
      renderMobileNavigationBarItems('/home').result.current.activeItemName,
    ).toBe('home');
    expect(
      renderMobileNavigationBarItems('/objects/people').result.current
        .activeItemName,
    ).toBe('');
  });

  it('starts a new chat from the chat item', () => {
    const { result } = renderMobileNavigationBarItems('/objects/people');

    act(() => tapItem(result, 'newAiChat'));

    expect(mockSwitchToNewChat).toHaveBeenCalledTimes(1);
  });

  it('replaces the settings entry it leaves so back does not return to it', () => {
    const { result } = renderMobileNavigationBarItems('/settings/profile', [
      '/objects/people',
    ]);

    act(() => tapItem(result, 'home'));

    expect(result.current.location.pathname).toBe('/home');

    act(() => result.current.navigate(-1));

    expect(result.current.location.pathname).toBe('/objects/people');
  });

  it('keeps the page it leaves in history outside of settings', () => {
    const { result } = renderMobileNavigationBarItems('/objects/people');

    act(() => tapItem(result, 'home'));

    expect(result.current.location.pathname).toBe('/home');

    act(() => result.current.navigate(-1));

    expect(result.current.location.pathname).toBe('/objects/people');
  });
});
