import type * as LocaleModule from 'date-fns/locale';
import type * as UseAtomComponentStateValueModule from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { vi } from 'vite-plus/test';

import { render, screen } from '@testing-library/react';
import { Temporal } from 'temporal-polyfill';
import { recordCalendarSelectedDateComponentState } from '@/object-record/record-calendar/states/recordCalendarSelectedDateComponentState';

import { RecordCalendar } from '@/object-record/record-calendar/components/RecordCalendar';
import { ViewCalendarLayout } from '~/generated-metadata/graphql';

vi.mock(
  '@/object-record/record-calendar/components/RecordCalendarTopBar',
  () => ({
    RecordCalendarTopBar: () => <div data-testid="calendar-top-bar" />,
  }),
);
vi.mock(
  '@/object-record/record-calendar/components/RecordCalendarDragDropContext',
  () => ({
    RecordCalendarDragDropContext: ({
      children,
    }: {
      children: React.ReactNode;
    }) => children,
  }),
);
vi.mock(
  '@/object-record/record-calendar/components/RecordCalendarEscapeHotkeyEffect',
  () => ({ RecordCalendarEscapeHotkeyEffect: () => null }),
);
vi.mock(
  '@/object-record/record-calendar/components/RecordCalendarAddNew',
  () => ({
    RecordCalendarAddNew: () => null,
  }),
);
vi.mock(
  '@/object-record/record-calendar/record-calendar-card/components/RecordCalendarCard',
  () => ({
    RecordCalendarCard: ({ recordId }: { recordId: string }) => (
      <article>{recordId}</article>
    ),
  }),
);
vi.mock(
  '@/object-record/record-calendar/record-calendar-card/hooks/useIsRecordCalendarCardDragDisabled',
  () => ({
    useIsRecordCalendarCardDragDisabled: () => false,
  }),
);
vi.mock(
  '@/ui/utilities/drag-and-drop/components/DragDropItemSortableCell',
  () => ({
    DragDropItemSortableCell: ({ children }: { children: React.ReactNode }) =>
      children,
  }),
);
vi.mock(
  '@/ui/utilities/drag-and-drop/components/DragDropItemDropTarget',
  () => ({
    DragDropItemDropTarget: () => null,
  }),
);
vi.mock('@dnd-kit/react', () => ({
  useDroppable: () => ({ isDropTarget: false, ref: vi.fn() }),
}));
vi.mock('@/ui/input/components/internal/date/hooks/useUserTimezone', () => ({
  useUserTimezone: () => ({ userTimezone: 'Europe/Paris' }),
}));
vi.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentFamilySelectorValue',
  () => ({
    useAtomComponentFamilySelectorValue: (
      _state: unknown,
      { day }: { day: Temporal.PlainDate },
    ) => [day.toString()],
  }),
);
vi.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', async () => {
  const { enUS } =
    await vi.importActual<typeof LocaleModule>('date-fns/locale');
  return {
    useAtomStateValue: () => ({ calendarStartDay: 1, localeCatalog: enUS }),
  };
});
vi.mock('@/ui/utilities/scroll/components/ScrollWrapper', () => ({
  ScrollWrapper: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock(
  '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow',
  () => ({
    useAvailableComponentInstanceIdOrThrow: vi.fn(() => 'calendar-id'),
  }),
);
vi.mock(
  '@/object-record/record-calendar/states/selectors/useRecordCalendarSelection',
  () => ({
    useRecordCalendarSelection: vi.fn(() => ({
      resetRecordCalendarSelection: vi.fn(),
    })),
  }),
);
vi.mock('@/ui/utilities/pointer-event/hooks/useListenClickOutside', () => ({
  useListenClickOutside: vi.fn(),
}));
vi.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue', () => ({
  useAtomComponentStateValue: vi.fn(),
}));

const useAtomComponentStateValueMock = (
  await vi.importMock<typeof UseAtomComponentStateValueModule>(
    '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  )
).useAtomComponentStateValue;

describe('RecordCalendar', () => {
  const renderCalendar = (calendarLayout: ViewCalendarLayout) => {
    useAtomComponentStateValueMock.mockImplementation((state: unknown) =>
      state === recordCalendarSelectedDateComponentState
        ? Temporal.PlainDate.from('2026-07-15')
        : calendarLayout,
    );
    return render(<RecordCalendar />);
  };

  beforeEach(() => vi.clearAllMocks());

  it.each([
    [ViewCalendarLayout.DAY, 1, '2026-07-15', '2026-07-15'],
    [ViewCalendarLayout.WEEK, 7, '2026-07-13', '2026-07-19'],
    [ViewCalendarLayout.MONTH, 35, '2026-06-29', '2026-08-02'],
  ])(
    'renders %s with the same record cards for each visible day',
    (layout, count, firstDay, lastDay) => {
      renderCalendar(layout);

      const cards = screen.getAllByRole('article');
      expect(cards).toHaveLength(count);
      expect(cards[0]).toHaveTextContent(firstDay);
      expect(cards[cards.length - 1]).toHaveTextContent(lastDay);
      expect(screen.getByText('Wed')).toBeInTheDocument();
      expect(screen.queryByText('All day')).not.toBeInTheDocument();
      expect(screen.queryByText(/\d{1,2}:00/)).not.toBeInTheDocument();
    },
  );
});
