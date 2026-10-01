import { vi } from 'vite-plus/test';

import { createDictationEventEmitter } from '@/ai/dictation/utils/createDictationEventEmitter';

describe('createDictationEventEmitter', () => {
  it('delivers events to every subscriber', () => {
    const emitter = createDictationEventEmitter();
    const first = vi.fn();
    const second = vi.fn();

    emitter.subscribe(first);
    emitter.subscribe(second);
    emitter.emit({ type: 'final', text: 'hello' });

    expect(first).toHaveBeenCalledWith({ type: 'final', text: 'hello' });
    expect(second).toHaveBeenCalledWith({ type: 'final', text: 'hello' });
  });

  it('stops delivering after unsubscribe', () => {
    const emitter = createDictationEventEmitter();
    const listener = vi.fn();

    const unsubscribe = emitter.subscribe(listener);

    unsubscribe();
    emitter.emit({ type: 'state', state: 'idle' });

    expect(listener).not.toHaveBeenCalled();
  });

  // A listener that tears itself down on its own event must not stop the ones
  // registered after it from being called for that same event.
  it('still reaches later listeners when an earlier one unsubscribes mid-emit', () => {
    const emitter = createDictationEventEmitter();
    const later = vi.fn();

    const unsubscribeFirst = emitter.subscribe(() => {
      unsubscribeFirst();
    });

    emitter.subscribe(later);
    emitter.emit({ type: 'state', state: 'recording' });

    expect(later).toHaveBeenCalledTimes(1);
  });

  it('drops every listener on clear', () => {
    const emitter = createDictationEventEmitter();
    const listener = vi.fn();

    emitter.subscribe(listener);
    emitter.clear();
    emitter.emit({ type: 'state', state: 'idle' });

    expect(listener).not.toHaveBeenCalled();
  });
});
