import { afterEach, describe, expect, it, vi } from 'vitest';

import { previewPasswordProfile, validatePreviewPassword } from './auth';

const EMAIL = 'test@example.com';
const INVITE_CODE = 'an-example-preview-invite-code-at-least-32-characters';

const configurePreview = () => {
  vi.stubEnv('FENFORCE_PREVIEW_AUTH_ENABLED', 'true');
  vi.stubEnv('FENFORCE_PREVIEW_AUTH_EMAIL', EMAIL);
  vi.stubEnv('FENFORCE_PREVIEW_INVITE_CODE', INVITE_CODE);
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('preview password enrollment', () => {
  it('keeps signup disabled without all server-side configuration', () => {
    const params = {
      flow: 'signUp',
      email: EMAIL,
      inviteCode: INVITE_CODE,
    };

    expect(() => previewPasswordProfile(params)).toThrow('SIGN_UP_DISABLED');

    vi.stubEnv('FENFORCE_PREVIEW_AUTH_ENABLED', 'true');
    expect(() => previewPasswordProfile(params)).toThrow('SIGN_UP_DISABLED');

    vi.stubEnv('FENFORCE_PREVIEW_AUTH_EMAIL', EMAIL);
    expect(() => previewPasswordProfile(params)).toThrow('SIGN_UP_DISABLED');
  });

  it('rejects another email or an incorrect invite code', () => {
    configurePreview();

    expect(() =>
      previewPasswordProfile({
        flow: 'signUp',
        email: 'other@example.com',
        inviteCode: INVITE_CODE,
      }),
    ).toThrow('SIGN_UP_NOT_ALLOWED');

    expect(() =>
      previewPasswordProfile({
        flow: 'signUp',
        email: EMAIL,
        inviteCode: 'incorrect',
      }),
    ).toThrow('INVALID_INVITE_CODE');
  });

  it('normalizes the allowlisted email and requires a strong password', () => {
    configurePreview();

    expect(
      previewPasswordProfile({
        flow: 'signUp',
        email: '  TEST@example.COM  ',
        inviteCode: INVITE_CODE,
      }),
    ).toEqual({ email: EMAIL });

    expect(() => validatePreviewPassword('short')).toThrow(
      'PASSWORD_TOO_SHORT',
    );
    expect(() => validatePreviewPassword('a'.repeat(12))).not.toThrow();
  });

  it('does not treat the static preview code as a one-time invite', () => {
    configurePreview();
    const params = {
      flow: 'signUp',
      email: EMAIL,
      inviteCode: INVITE_CODE,
    };

    expect(previewPasswordProfile(params)).toEqual({ email: EMAIL });
    expect(previewPasswordProfile(params)).toEqual({ email: EMAIL });
  });

  it('permits sign-in for an existing account without an invite', () => {
    expect(
      previewPasswordProfile({ flow: 'signIn', email: ' TEST@example.COM ' }),
    ).toEqual({
      email: EMAIL,
    });
  });
});
