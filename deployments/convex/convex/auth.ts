import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import type { Value } from 'convex/values';

import type { DataModel } from './_generated/dataModel';

export const validatePreviewPassword = (password: string) => {
  if (password.length < 12) {
    throw new Error('PASSWORD_TOO_SHORT');
  }
};

export const previewPasswordProfile = (
  params: Record<string, Value | undefined>,
) => {
  const email = params.email;

  if (typeof email !== 'string' || email.trim().length === 0) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (params.flow === 'signUp') {
    const allowedEmail =
      process.env.FENFORCE_PREVIEW_AUTH_EMAIL?.trim().toLowerCase();
    const configuredInviteCode = process.env.FENFORCE_PREVIEW_INVITE_CODE;

    if (
      process.env.FENFORCE_PREVIEW_AUTH_ENABLED !== 'true' ||
      !allowedEmail ||
      !configuredInviteCode ||
      configuredInviteCode.length < 32
    ) {
      throw new Error('SIGN_UP_DISABLED');
    }

    if (normalizedEmail !== allowedEmail) {
      throw new Error('SIGN_UP_NOT_ALLOWED');
    }

    if (
      typeof params.inviteCode !== 'string' ||
      params.inviteCode !== configuredInviteCode
    ) {
      throw new Error('INVALID_INVITE_CODE');
    }
  }

  return { email: normalizedEmail };
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      id: 'preview-password',
      profile: previewPasswordProfile,
      validatePasswordRequirements: validatePreviewPassword,
    }),
  ],
});
