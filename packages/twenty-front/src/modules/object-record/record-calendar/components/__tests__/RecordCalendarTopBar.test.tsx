import { vi } from 'vite-plus/test';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { enUS } from 'date-fns/locale';
import { Temporal } from 'temporal-polyfill';
import { type ButtonProps } from 'twenty-ui/primitives/input';

import { RecordCalendarTopBar } from '@/object-record/record-calendar/components/RecordCalendarTopBar';
import { recordCalendarSelectedDateComponentState } from '@/object-record/record-calendar/states/recordCalendarSelectedDateComponentState';
import { recordIndexCalendarLayoutComponentState } from '@/object-record/record-index/states/recordIndexCalendarLayoutComponentState';
import { ViewCalendarLayout } from '~/generated-metadata/graphql';

const mockSetRecordCalendarSelectedDate = vi.fn();
const mockSetRecordIndexCalendarLayout = vi.fn();
const mockUpdateCurrentView = vi.fn();
const mockUseAtomComponentState = vi.fn();
const mockUseAtomStateValue = vi.fn();
const mockUseRecordCalendarDaysRange = vi.fn();

vi.mock('@/localization/hooks/useDateTimeFormat', () => ({
  useDateTimeFormat: vi.fn(() => ({ timeZone: 'UTC' })),
}));
vi.mock(
  '@/object-record/record-calendar/hooks/useRecordCalendarDaysRange',
  () => ({
    useRecordCalendarDaysRange: (...args: unknown[]) =>
      mockUseRecordCalendarDaysRange(...args),
  }),
);
vi.mock(
  '@/ui/input/components/internal/date/components/DatePickerWithoutCalendar',
  () => ({ DatePickerWithoutCalendar: () => null }),
);
vi.mock(
  '@/ui/input/components/internal/date/components/TimeZoneAbbreviation',
  () => ({
    TimeZoneAbbreviation: () => <span data-testid="time-zone" />,
  }),
);
vi.mock('@/ui/input/components/Select', () => ({
  Select: ({
    options,
    value,
    onChange,
  }: {
    options: { label: string; value: ViewCalendarLayout }[];
    value: ViewCalendarLayout;
    onChange: (value: ViewCalendarLayout) => void;
  }) => (
    <select
      data-testid="layout-select"
      value={value}
      onChange={(event) => onChange(event.target.value as ViewCalendarLayout)}
    >
      {options.map(({ label, value }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('@/ui/input/components/SelectControl', () => ({
  SelectControl: ({
    selectedOption,
  }: {
    selectedOption: { label: string };
  }) => <span data-testid="selected-date">{selectedOption.label}</span>,
}));
vi.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: ({ clickableComponent }: { clickableComponent: React.ReactNode }) =>
    clickableComponent,
}));
vi.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: vi.fn(() => ({ closeDropdown: vi.fn() })),
}));
vi.mock(
  '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow',
  () => ({
    useAvailableComponentInstanceIdOrThrow: vi.fn(() => 'calendar-id'),
  }),
);
vi.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentState', () => ({
  useAtomComponentState: (...args: unknown[]) =>
    mockUseAtomComponentState(...args),
}));
vi.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: (...args: unknown[]) => mockUseAtomStateValue(...args),
}));
vi.mock('@/views/hooks/useUpdateCurrentView', () => ({
  useUpdateCurrentView: vi.fn(() => ({
    updateCurrentView: mockUpdateCurrentView,
  })),
}));
vi.mock('twenty-ui/primitives/input', () => ({
  Button: ({
    'aria-label': ariaLabel,
    children,
    onClick,
  }: Pick<ButtonProps, 'aria-label' | 'children' | 'onClick'>) => (
    <button aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  ),
}));

describe('RecordCalendarTopBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAtomComponentState.mockImplementation((state: unknown) => {
      if (state === recordIndexCalendarLayoutComponentState) {
        return [ViewCalendarLayout.DAY, mockSetRecordIndexCalendarLayout];
      }

      if (state === recordCalendarSelectedDateComponentState) {
        return [
          Temporal.PlainDate.from('2026-07-15'),
          mockSetRecordCalendarSelectedDate,
        ];
      }

      return [undefined, vi.fn()];
    });
    mockUseAtomStateValue.mockReturnValue({
      locale: 'en-US',
      localeCatalog: enUS,
    });
    mockUseRecordCalendarDaysRange.mockReturnValue({
      firstDay: Temporal.PlainDate.from('2026-07-13'),
      lastDay: Temporal.PlainDate.from('2026-07-19'),
    });
  });

  it('shows Day, Week, and Month with the selected full date', () => {
    render(<RecordCalendarTopBar />);

    expect(screen.getByTestId('selected-date')).toHaveTextContent(
      'Wednesday, July 15, 2026',
    );
    expect(
      Array.from(
        screen.getByTestId('layout-select').querySelectorAll('option'),
      ).map((option) => option.textContent),
    ).toEqual(['Day', 'Week', 'Month']);
    expect(screen.getByTestId('time-zone')).toBeInTheDocument();
  });

  it('navigates the Day layout one day at a time', () => {
    render(<RecordCalendarTopBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));

    expect(mockSetRecordCalendarSelectedDate).toHaveBeenNthCalledWith(
      1,
      Temporal.PlainDate.from('2026-07-14'),
    );
    expect(mockSetRecordCalendarSelectedDate).toHaveBeenNthCalledWith(
      2,
      Temporal.PlainDate.from('2026-07-16'),
    );
  });

  it('persists a week selection from the top bar', async () => {
    const user = userEvent.setup();
    render(<RecordCalendarTopBar />);

    await user.selectOptions(screen.getByRole('combobox'), 'WEEK');

    expect(mockSetRecordIndexCalendarLayout).toHaveBeenCalledWith(
      ViewCalendarLayout.WEEK,
    );
    expect(mockUpdateCurrentView).toHaveBeenCalledWith({
      calendarLayout: ViewCalendarLayout.WEEK,
    });
  });
});
