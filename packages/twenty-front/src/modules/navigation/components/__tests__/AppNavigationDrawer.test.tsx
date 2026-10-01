import type * as UtilitiesModule from 'twenty-ui/utilities';
import { vi } from 'vite-plus/test';

import { AppNavigationDrawer } from '@/navigation/components/AppNavigationDrawer';
import { useIsSettingsDrawer } from '@/navigation/hooks/useIsSettingsDrawer';
import { useIsMobile } from 'twenty-ui/utilities';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';

vi.mock('@/navigation/hooks/useIsSettingsDrawer');
vi.mock('twenty-ui/utilities', async () => ({
  ...(await vi.importActual<typeof UtilitiesModule>('twenty-ui/utilities')),
  useIsMobile: vi.fn(),
}));

vi.mock('@/navigation/components/MainNavigationDrawerContent', () => ({
  MainNavigationDrawerContent: () => <div>Main content</div>,
}));

vi.mock('@/navigation/components/MainNavigationDrawerModeSwitcher', () => ({
  MainNavigationDrawerModeSwitcher: () => (
    <button type="button">Navigation modes</button>
  ),
}));

vi.mock('@/navigation/components/SettingsNavigationDrawerContent', () => ({
  SettingsNavigationDrawerContent: () => <div>Settings content</div>,
}));

vi.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawer',
  () => ({
    NavigationDrawer: ({ children }: { children: ReactNode }) => (
      <aside>{children}</aside>
    ),
  }),
);

vi.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerFixedContent',
  () => ({
    NavigationDrawerFixedContent: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
  }),
);

describe('AppNavigationDrawer', () => {
  beforeEach(() => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    vi.mocked(useIsSettingsDrawer).mockReturnValue(false);
  });

  it('keeps the mode switcher mounted when the drawer content changes', () => {
    const { rerender } = render(<AppNavigationDrawer />);
    const modeSwitcher = screen.getByRole('button', {
      name: 'Navigation modes',
    });

    expect(screen.getByText('Main content')).toBeInTheDocument();

    vi.mocked(useIsSettingsDrawer).mockReturnValue(true);
    rerender(<AppNavigationDrawer />);

    expect(screen.getByText('Settings content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Navigation modes' })).toBe(
      modeSwitcher,
    );
  });

  it('leaves mode switching to the navigation bar on mobile', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    vi.mocked(useIsSettingsDrawer).mockReturnValue(true);

    render(<AppNavigationDrawer />);

    expect(screen.getByText('Settings content')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Navigation modes' }),
    ).not.toBeInTheDocument();
  });
});
