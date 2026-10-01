import type * as ComponentsModule from 'twenty-ui/components';
import { vi } from 'vite-plus/test';

import { act, renderHook } from '@testing-library/react';

import { usePersistedCampaignDraft } from '@/activities/emails/hooks/usePersistedCampaignDraft';

const mockUpdateOneRecord = vi.fn().mockResolvedValue({});

vi.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: mockUpdateOneRecord }),
}));

const mockEnqueueToast = vi.fn();

vi.mock('twenty-ui/components', async () => ({
  ...(await vi.importActual<typeof ComponentsModule>('twenty-ui/components')),
  useToast: () => ({ enqueueToast: mockEnqueueToast }),
}));

const campaignId = '20202020-0000-4000-8000-000000000001';

const renderDraftHook = (initialSubject: string) =>
  renderHook(
    ({ subject }: { subject: string }) =>
      usePersistedCampaignDraft({
        campaignId,
        initialDraft: () => ({ subject }),
        toUpdateOneRecordInput: (draft) => draft,
      }),
    { initialProps: { subject: initialSubject } },
  );

describe('usePersistedCampaignDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should adopt a remote change when the draft is pristine', () => {
    const { result, rerender } = renderDraftHook('');

    const initialResyncKey = result.current.draftResyncKey;

    rerender({ subject: 'Written by the AI' });

    expect(result.current.draft.subject).toBe('Written by the AI');
    expect(result.current.draftResyncKey).not.toBe(initialResyncKey);
  });

  it('should keep the local draft when its own persist echoes back', () => {
    const { result, rerender } = renderDraftHook('');

    act(() => {
      result.current.updateDraft({ subject: 'Typed locally' });
    });

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(mockUpdateOneRecord).toHaveBeenCalledWith({
      objectNameSingular: 'messageCampaign',
      idToUpdate: campaignId,
      updateOneRecordInput: { subject: 'Typed locally' },
    });

    const resyncKeyBeforeEcho = result.current.draftResyncKey;

    rerender({ subject: 'Typed locally' });

    expect(result.current.draft.subject).toBe('Typed locally');
    expect(result.current.draftResyncKey).toBe(resyncKeyBeforeEcho);
  });

  it('should let unsaved local edits win over a concurrent remote change', () => {
    const { result, rerender } = renderDraftHook('');

    act(() => {
      result.current.updateDraft({ subject: 'Typed locally' });
    });

    const resyncKeyBeforeRemoteChange = result.current.draftResyncKey;

    rerender({ subject: 'Concurrent remote change' });

    expect(result.current.draft.subject).toBe('Typed locally');
    expect(result.current.draftResyncKey).toBe(resyncKeyBeforeRemoteChange);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(mockUpdateOneRecord).toHaveBeenCalledWith({
      objectNameSingular: 'messageCampaign',
      idToUpdate: campaignId,
      updateOneRecordInput: { subject: 'Typed locally' },
    });
  });

  it('should adopt a remote change arriving after local edits were persisted and echoed', () => {
    const { result, rerender } = renderDraftHook('');

    act(() => {
      result.current.updateDraft({ subject: 'Typed locally' });
    });

    act(() => {
      vi.runOnlyPendingTimers();
    });

    rerender({ subject: 'Typed locally' });

    const resyncKeyAfterEcho = result.current.draftResyncKey;

    rerender({ subject: 'Updated by the AI afterwards' });

    expect(result.current.draft.subject).toBe('Updated by the AI afterwards');
    expect(result.current.draftResyncKey).not.toBe(resyncKeyAfterEcho);
  });
});
