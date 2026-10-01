import { ApiPath } from '../../../packages/twenty-shared/src/types/ApiPath';

type FrontendEnvironment = {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
};

const API_PREFIXES = new Set<string>(Object.values(ApiPath));

export const handleRequest = async (
  request: Request,
  environment: FrontendEnvironment,
): Promise<Response> => {
  const prefix = new URL(request.url).pathname.split('/')[1];

  if (API_PREFIXES.has(prefix)) {
    return Response.json(
      {
        error: 'BACKEND_NOT_CONFIGURED',
        message: 'The Fenforce backend is not connected yet.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const response = await environment.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export default { fetch: handleRequest };
