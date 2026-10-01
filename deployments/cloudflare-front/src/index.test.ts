import { describe, expect, test } from 'bun:test';
import { ApiPath } from '../../../packages/twenty-shared/src/types/ApiPath';
import { handleRequest } from './index';

describe('frontend preview routing', () => {
  test('every declared API prefix fails explicitly without serving the SPA', async () => {
    for (const prefix of Object.values(ApiPath)) {
      for (const suffix of ['', '/nested', '?probe=true']) {
        const response = await handleRequest(
          new Request(`https://preview.example/${prefix}${suffix}`),
          {
            ASSETS: {
              fetch: async () => {
                throw new Error('API reached assets');
              },
            },
          },
        );
        expect(response.status).toBe(503);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect((await response.json()).error).toBe('BACKEND_NOT_CONFIGURED');
      }
    }
  });

  test('frontend deep links and similar names reach the static asset binding', async () => {
    for (const path of [
      '/',
      '/welcome',
      '/objects/companies',
      '/settings/profile',
      '/graphql-example',
      '/assets/index.js',
    ]) {
      const request = new Request(`https://preview.example${path}`);
      const response = await handleRequest(request, {
        ASSETS: {
          fetch: async (received) => {
            expect(received).toBe(request);
            return new Response('asset', {
              headers: { 'Content-Type': 'text/plain' },
            });
          },
        },
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('asset');
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    }
  });
});
