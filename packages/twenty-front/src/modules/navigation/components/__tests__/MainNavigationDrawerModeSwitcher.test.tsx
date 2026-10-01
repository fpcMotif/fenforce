import type * as UtilitiesModule from 'twenty-ui/utilities';
import { vi } from 'vite-plus/test';

import { createStore, Provider as JotaiProvider } from 'jotai';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconComment, IconHome, IconSettings } from 'twenty-ui/icon';

import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { MainNavigationDrawerModeSwitcher } from '@/navigation/components/MainNavigationDrawerModeSwitcher';
import { useActiveNavigationDrawerMode } from '@/navigation/hooks/useActiveNavigationDrawerMode';
import { useIsNavigationDrawerContentExpanded } from '@/navigation/hooks/useIsNavigationDrawerContentExpanded';
import { useNavigationDrawerModes } from '@/navigation/hooks/useNavigationDrawerModes';
import { useSwitchNavigationDrawerMode } from '@/navigation/hooks/useSwitchNavigationDrawerMode';
import { NAVIGATION_DRAWER_TABS } from '@/ui/navigation/states/navigationDrawerTabs';

vi.mock('@/navigation/hooks/useActiveNavigationDrawerMode');
vi.mock('@/navigation/hooks/useIsNavigationDrawerContentExpanded');
vi.mock('@/navigation/hooks/useNavigationDrawerModes');
vi.mock('@/navigation/hooks/useSwitchNavigationDrawerMode');

vi.mock('twenty-ui/utilities', async () => ({
  ...(await vi.importActual<typeof UtilitiesModule>('twenty-ui/utilities')),
  useIsMobile: () => false,
}));

const mockSwitchNavigationDrawerMode = vi.fn();

const renderModeSwitcher = (isLayoutCustomizationModeEnabled = false) => {
  const store = createStore();

  store.set(
    isLayoutCustomizationModeEnabledState.atom,
    isLayoutCustomizationModeEnabled,
  );

  render(
    <I18nProvider i18n={i18n}>
      <JotaiProvider store={store}>
        <MainNavigationDrawerModeSwitcher />
      </JotaiProvider>
    </I18nProvider>,
  );

  return { store };
};

describe('MainNavigationDrawerModeSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useNavigationDrawerModes).mockReturnValue([
      {
        Icon: IconHome,
        label: 'Home',
        mode: NAVIGATION_DRAWER_TABS.NAVIGATION_MENU,
      },
      {
        Icon: IconComment,
        label: 'AI',
        mode: NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY,
      },
      {
        Icon: IconSettings,
        label: 'Settings',
        mode: NAVIGATION_DRAWER_TABS.SETTINGS,
      },
    ]);
    vi.mocked(useActiveNavigationDrawerMode).mockReturnValue(
      NAVIGATION_DRAWER_TABS.NAVIGATION_MENU,
    );
    vi.mocked(useSwitchNavigationDrawerMode).mockReturnValue({
      switchNavigationDrawerMode: mockSwitchNavigationDrawerMode,
    });
    vi.mocked(useIsNavigationDrawerContentExpanded).mockReturnValue(true);
  });

  it('switches mode from the collapsed icon rail', async () => {
    vi.mocked(useIsNavigationDrawerContentExpanded).mockReturnValue(false);

    renderModeSwitcher();

    await userEvent.click(screen.getByRole('button', { name: 'AI' }));

    expect(mockSwitchNavigationDrawerMode).toHaveBeenCalledTimes(1);
    expect(mockSwitchNavigationDrawerMode).toHaveBeenCalledWith(
      NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY,
    );
  });

  it('switches mode from the expanded row', async () => {
    renderModeSwitcher();

    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(mockSwitchNavigationDrawerMode).toHaveBeenCalledTimes(1);
    expect(mockSwitchNavigationDrawerMode).toHaveBeenCalledWith(
      NAVIGATION_DRAWER_TABS.SETTINGS,
    );
  });

  it.each([
    [true, 'Settings', NAVIGATION_DRAWER_TABS.SETTINGS],
    [false, 'Settings', NAVIGATION_DRAWER_TABS.SETTINGS],
    [true, 'AI', NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY],
    [false, 'AI', NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY],
  ] as const)(
    'disables navigation while editing layout with expanded=%s and mode=%s and restores it afterward',
    async (isExpanded, label, mode) => {
      vi.mocked(useIsNavigationDrawerContentExpanded).mockReturnValue(
        isExpanded,
      );
      const { store } = renderModeSwitcher(true);
      const settingsButton = screen.getByRole('button', { name: label });

      expect(settingsButton).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('button', { name: 'Home' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute(
        'aria-disabled',
        'false',
      );

      await userEvent.click(settingsButton);
      expect(settingsButton).toHaveFocus();
      await userEvent.keyboard('{Enter} ');

      expect(mockSwitchNavigationDrawerMode).not.toHaveBeenCalled();

      act(() => {
        store.set(isLayoutCustomizationModeEnabledState.atom, false);
      });

      expect(settingsButton).toHaveAttribute('aria-disabled', 'false');
      await userEvent.click(settingsButton);

      expect(mockSwitchNavigationDrawerMode).toHaveBeenCalledTimes(1);
      expect(mockSwitchNavigationDrawerMode).toHaveBeenCalledWith(mode);
    },
  );

  it('renders nothing when no mode is available', () => {
    vi.mocked(useNavigationDrawerModes).mockReturnValue([]);

    renderModeSwitcher();

    expect(
      screen.queryByRole('group', { name: 'Navigation modes' }),
    ).not.toBeInTheDocument();
  });
});
