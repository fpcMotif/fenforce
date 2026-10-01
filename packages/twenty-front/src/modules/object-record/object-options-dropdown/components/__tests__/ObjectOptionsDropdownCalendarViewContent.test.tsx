import type * as IconModule from 'twenty-ui/icon';
import type * as RecordIndexCalendarLayoutComponentStateModule from '@/object-record/record-index/states/recordIndexCalendarLayoutComponentState';
import { vi } from 'vite-plus/test';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { ObjectOptionsDropdownCalendarFieldsContent } from '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownCalendarFieldsContent';

import { ObjectOptionsDropdownCalendarViewContent } from '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownCalendarViewContent';
import { ViewCalendarLayout } from '~/generated-metadata/graphql';

const mockCalendarFields = [
  { id: 'date-field', label: 'Due date', type: 'DATE' },
  { id: 'date-time-field', label: 'Created at', type: 'DATE_TIME' },
];
const mockSetCalendarField = vi.fn();

vi.mock('@/views/view-picker/hooks/useGetAvailableFieldsForCalendar', () => ({
  useGetAvailableFieldsForCalendar: () => ({
    availableFieldsForCalendar: mockCalendarFields,
    navigateToDateFieldSettings: vi.fn(),
  }),
}));
vi.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentState', () => ({
  useAtomComponentState: () => ['date-field', mockSetCalendarField],
}));
vi.mock('twenty-ui/icon', async () => ({
  ...(await vi.importActual<typeof IconModule>('twenty-ui/icon')),
  useIcons: () => ({ getIcon: () => () => null }),
}));

const mockCloseDropdown = vi.fn();
const mockResetContent = vi.fn();
const mockSetRecordIndexCalendarLayout = vi.fn();
const mockUpdateCurrentView = vi.fn();
const mockUseCalendarLayoutValue = vi.fn();

vi.mock(
  '@/object-record/object-options-dropdown/hooks/useObjectOptionsDropdown',
  () => ({
    useObjectOptionsDropdown: vi.fn(() => ({
      objectMetadataItem: { fields: mockCalendarFields },
      closeDropdown: mockCloseDropdown,
      resetContent: mockResetContent,
    })),
  }),
);
vi.mock('@/ui/layout/dropdown/components/LegacyDropdownContent', () => ({
  LegacyDropdownContent: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock(
  '@/ui/layout/dropdown/components/DropdownMenuHeader/DropdownMenuHeader',
  () => ({
    DropdownMenuHeader: ({ children }: { children: React.ReactNode }) =>
      children,
  }),
);
vi.mock(
  '@/ui/layout/dropdown/components/DropdownMenuHeader/internal/DropdownMenuHeaderLeftComponent',
  () => ({ DropdownMenuHeaderLeftComponent: () => null }),
);
vi.mock('@/ui/layout/dropdown/components/DropdownMenuItemsContainer', () => ({
  DropdownMenuItemsContainer: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock('@/ui/layout/selectable-list/components/SelectableList', () => ({
  SelectableList: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/ui/layout/selectable-list/components/SelectableListItem', () => ({
  SelectableListItem: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  async () => {
    const { recordIndexCalendarLayoutComponentState } = await vi.importActual<
      typeof RecordIndexCalendarLayoutComponentStateModule
    >(
      '@/object-record/record-index/states/recordIndexCalendarLayoutComponentState',
    );

    return {
      useAtomComponentStateValue: (state: unknown) =>
        state === recordIndexCalendarLayoutComponentState
          ? mockUseCalendarLayoutValue()
          : null,
    };
  },
);
vi.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: vi.fn(() => mockSetRecordIndexCalendarLayout),
}));
vi.mock('@/views/hooks/useUpdateCurrentView', () => ({
  useUpdateCurrentView: vi.fn(() => ({
    updateCurrentView: mockUpdateCurrentView,
  })),
}));
vi.mock('twenty-ui/primitives/data-display', () => ({
  Pill: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('twenty-ui/primitives/navigation', () => ({
  ListItem: ({
    description,
    disabled,
    onClick,
    selected,
    children,
  }: {
    description?: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    selected: boolean;
    children: React.ReactNode;
  }) => (
    <button data-selected={selected} disabled={disabled} onClick={onClick}>
      <span>{children}</span>
      {description}
    </button>
  ),
}));

describe('ObjectOptionsDropdownCalendarViewContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCalendarLayoutValue.mockReturnValue(ViewCalendarLayout.MONTH);
    mockUpdateCurrentView.mockResolvedValue(undefined);
  });

  it('offers Day, Week, and Month while keeping Timeline disabled', () => {
    render(<ObjectOptionsDropdownCalendarViewContent />);

    expect(
      screen
        .getAllByRole('button')
        .map((button) => button.textContent?.replace('Soon', '')),
    ).toEqual(['Day', 'Week', 'Month', 'Timeline']);
    expect(screen.getByText('Day').closest('button')).toBeEnabled();
    expect(screen.getByText('Timeline').closest('button')).toBeDisabled();
  });

  it.each([
    ['Day', ViewCalendarLayout.DAY],
    ['Week', ViewCalendarLayout.WEEK],
  ])('persists %s without a feature flag', async (label, calendarLayout) => {
    const user = userEvent.setup();
    render(<ObjectOptionsDropdownCalendarViewContent />);

    await user.click(screen.getByRole('button', { name: label }));

    expect(mockSetRecordIndexCalendarLayout).toHaveBeenCalledWith(
      calendarLayout,
    );
    expect(mockUpdateCurrentView).toHaveBeenCalledWith({ calendarLayout });
    await waitFor(() => expect(mockCloseDropdown).toHaveBeenCalled());
  });
});

describe('ObjectOptionsDropdownCalendarFieldsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateCurrentView.mockResolvedValue(undefined);
  });

  it.each(mockCalendarFields)(
    'selects $label directly and clears legacy end-field configuration',
    async ({ id, label }) => {
      const user = userEvent.setup();
      render(
        <I18nProvider i18n={i18n}>
          <ObjectOptionsDropdownCalendarFieldsContent />
        </I18nProvider>,
      );

      expect(
        screen.getByRole('button', { name: 'Due date' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Created at' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('End date field')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: label }));

      expect(mockSetCalendarField).toHaveBeenCalledWith(id);
      expect(mockUpdateCurrentView).toHaveBeenCalledWith({
        calendarFieldMetadataId: id,
        calendarEndFieldMetadataId: null,
      });
      expect(mockCloseDropdown).toHaveBeenCalled();
    },
  );

  it('searches Date and DateTime fields in the same picker', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider i18n={i18n}>
        <ObjectOptionsDropdownCalendarFieldsContent />
      </I18nProvider>,
    );

    await user.type(screen.getByPlaceholderText('Search fields'), 'created');

    expect(
      screen.queryByRole('button', { name: 'Due date' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Created at' }),
    ).toBeInTheDocument();
  });
});
