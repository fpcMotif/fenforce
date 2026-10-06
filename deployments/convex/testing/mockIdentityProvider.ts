import { createHash, randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

type AuthorizationCode = {
  subject: string;
  challenge: string;
  redirectUri: string;
  nonce: string;
  expiresAt: number;
};

export const startMockIdentityProvider = async (port = 4011) => {
  const keys = await generateKeyPair('RS256', { extractable: true });
  const publicKey = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'mock-1',
    alg: 'RS256',
    use: 'sig',
  };
  const codes = new Map<string, AuthorizationCode>();
  const issuer = `http://localhost:${port}`;
  const faults = {
    issuer: '',
    audience: '',
    tenant: '',
    expired: false,
    forged: false,
  };
  const forgedKeys = await generateKeyPair('RS256');
  const clientId = 'fenforce-local';
  const clientSecret = 'synthetic-local-client-secret';

  const authorize = (url: URL, response: ServerResponse) => {
    const params = url.searchParams;
    const redirectUri = params.get('redirect_uri') ?? '';
    if (
      params.get('client_id') !== clientId ||
      !isLoopbackCallback(redirectUri) ||
      params.get('code_challenge_method') !== 'S256'
    ) {
      response.writeHead(400).end('Invalid authorization request');
      return;
    }
    const subject = params.get('subject');
    const subjects = [
      'seller-a',
      'seller-b',
      'manager-a',
      'admin-a',
      'unknown',
    ];
    if (!subject) {
      const fields = [...params]
        .map(
          ([name, value]) =>
            `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
        )
        .join('');
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(
        `<html lang="en"><title>Simulated employee identity</title><h1>Simulated employee identity</h1><p>Local synthetic employees only.</p><form>${fields}<label>Employee <select name="subject">${subjects.map((name) => `<option>${name}</option>`).join('')}</select></label><button>Continue</button></form></html>`,
      );
      return;
    }
    if (!subjects.includes(subject)) {
      response.writeHead(400).end('Unknown employee');
      return;
    }
    const code = randomUUID();
    codes.set(code, {
      subject,
      challenge: params.get('code_challenge') ?? '',
      redirectUri,
      nonce: params.get('nonce') ?? '',
      expiresAt: Date.now() + 60_000,
    });
    const destination = new URL(redirectUri);
    destination.searchParams.set('code', code);
    destination.searchParams.set('state', params.get('state') ?? '');
    response.writeHead(302, { Location: destination.href }).end();
  };

  const signIdentity = (authorization: AuthorizationCode) =>
    new SignJWT({
      tenant: faults.tenant || 'tenant-demo',
      nonce: authorization.nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'mock-1' })
      .setIssuer(faults.issuer || issuer)
      .setAudience(faults.audience || clientId)
      .setSubject(authorization.subject)
      .setIssuedAt()
      .setExpirationTime(
        faults.expired ? Math.floor(Date.now() / 1000) - 120 : '5m',
      )
      .sign(faults.forged ? forgedKeys.privateKey : keys.privateKey);

  const exchange = async (
    request: IncomingMessage,
    response: ServerResponse,
  ) => {
    let body = '';
    for await (const chunk of request) body += String(chunk);
    const params = new URLSearchParams(body);
    const code = params.get('code') ?? '';
    const authorization = codes.get(code);
    codes.delete(code);
    const challenge = createHash('sha256')
      .update(params.get('code_verifier') ?? '')
      .digest('base64url');
    const clientValid =
      request.headers.authorization ===
      `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    if (
      !clientValid ||
      !authorization ||
      !validGrant(authorization, challenge, params)
    ) {
      response.writeHead(400).end(JSON.stringify({ error: 'invalid_grant' }));
      return;
    }
    const token = await signIdentity(authorization);
    response.end(
      JSON.stringify({
        access_token: randomUUID(),
        token_type: 'Bearer',
        expires_in: 300,
        id_token: token,
      }),
    );
  };

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', issuer);
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    switch (url.pathname) {
      case '/.well-known/openid-configuration':
        response.end(
          JSON.stringify({
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            jwks_uri: `${issuer}/jwks`,
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            token_endpoint_auth_methods_supported: ['client_secret_basic'],
            code_challenge_methods_supported: ['S256'],
          }),
        );
        break;
      case '/jwks':
        response.end(JSON.stringify({ keys: [publicKey] }));
        break;
      case '/authorize':
        authorize(url, response);
        break;
      case '/token':
        await exchange(request, response);
        break;
      default:
        response.writeHead(404).end();
    }
  };
  const server = createServer((request, response) => {
    void handle(request, response).catch(() =>
      response.writeHead(500).end('Provider error'),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    issuer,
    faults,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
};

const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const validGrant = (
  authorization: AuthorizationCode,
  challenge: string,
  params: URLSearchParams,
) =>
  authorization.expiresAt > Date.now() &&
  challenge === authorization.challenge &&
  params.get('redirect_uri') === authorization.redirectUri &&
  params.get('grant_type') === 'authorization_code';

const isLoopbackCallback = (value: string) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname) &&
      url.port !== '' &&
      url.pathname === '/api/auth/callback/employee-oidc' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
};
