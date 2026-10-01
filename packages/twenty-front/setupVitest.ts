import * as matchers from '@testing-library/jest-dom/matchers';
import { expect, vi } from 'vite-plus/test';
import {
  ReadableStream as NodeReadableStream,
  TransformStream as NodeTransformStream,
  WritableStream as NodeWritableStream,
} from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';

import { i18n } from '@lingui/core';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { messages as enMessages } from '~/locales/generated/en';

expect.extend(matchers);
vi.mock('hex-rgb');
i18n.load({ [SOURCE_LOCALE]: enMessages });
i18n.activate(SOURCE_LOCALE);

// jsdom has no TextEncoder/TextDecoder, and @ai-sdk/provider-utils builds one
// while being imported.
if (globalThis.TextDecoder === undefined) {
  Object.assign(globalThis, { TextDecoder, TextEncoder });
}

const globalWithWebStreams = globalThis as Record<string, unknown>;

if (globalWithWebStreams.TransformStream === undefined) {
  globalWithWebStreams.TransformStream = NodeTransformStream;
}

if (globalWithWebStreams.ReadableStream === undefined) {
  globalWithWebStreams.ReadableStream = NodeReadableStream;
}

if (globalWithWebStreams.WritableStream === undefined) {
  globalWithWebStreams.WritableStream = NodeWritableStream;
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    value: () => {},
    writable: true,
  });
}

// jsdom does not implement ResizeObserver; @dnd-kit/dom expects it at import
// time.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
}

global.structuredClone = (value) => JSON.parse(JSON.stringify(value));
