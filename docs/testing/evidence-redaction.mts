import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export function redactEvidence(value: string, root: string) {
  return value.replaceAll(root + '/', '').replaceAll(root, '<checkout>')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<redacted-token>')
    .replace(/\b(https?|postgres(?:ql)?|redis):\/\/[^:/@\s]+:[^@\s]+@/gi, '$1://<redacted>@')
    .replace(/(["']?[\w-]*(?:authorization|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|Bearer\s+[^\s,;]+|[^\s,;]+)/gi,
      (_, prefix: string, credential: string) => {
        const quote = credential.startsWith('"') ? '"' : credential.startsWith("'") ? "'" : '';
        return `${prefix}${quote}<redacted>${quote}`;
      });
}

export function sanitizeEvidence(value: unknown, root: string): unknown {
  if (typeof value === 'string') return redactEvidence(value, root);
  if (Array.isArray(value)) return value.map((item) => sanitizeEvidence(item, root));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,
      /(?:authorization|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)$/i.test(key)
        ? '<redacted>' : sanitizeEvidence(entry, root)]));
  }
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--self-test')) {
  const controls = [
    JSON.stringify({ password: 'FAKE_JSON_CREDENTIAL', api_key: 'FAKE_JSON_KEY', authorization: 'Bearer FAKE_JSON_BEARER' }),
    'Authorization: Bearer FAKE_OPAQUE_CREDENTIAL',
    "client_secret = 'FAKE_QUOTED_CREDENTIAL WITH SPACES'",
    'postgresql://FAKE_USER:FAKE_PASSWORD@localhost/database',
    'access_token=FAKE_UNQUOTED_CREDENTIAL',
  ];
  for (const control of controls) {
    assert(!redactEvidence(control, '/checkout').includes('FAKE_'), 'Credential value survived redaction');
  }
  assert.deepEqual(JSON.parse(redactEvidence(controls[0], '/checkout')),
    { password: '<redacted>', api_key: '<redacted>', authorization: '<redacted>' });
  assert.equal(redactEvidence('/checkout/test.ts', '/checkout'), 'test.ts');
  assert.deepEqual(sanitizeEvidence({ nested: { apiKey: 'FAKE_NESTED_CREDENTIAL' } }, '/checkout'),
    { nested: { apiKey: '<redacted>' } });
  assert.deepEqual(sanitizeEvidence({ authorization: ['Bearer FAKE_ARRAY_CREDENTIAL'] }, '/checkout'),
    { authorization: '<redacted>' });
  const discovery = sanitizeEvidence([{ name: 'Uses Authorization: Bearer FAKE_DISCOVERY_CREDENTIAL' }], '/checkout');
  assert.deepEqual(JSON.parse(JSON.stringify(discovery)), [{ name: 'Uses Authorization: <redacted>' }]);
  console.log(`PASS: ${controls.length} credential controls and JSON validity.`);
}
