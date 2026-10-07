import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import type { Value } from 'convex/values';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { DataModel } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { enrollEmployee, requireActiveEmployee } from './employeeEnrollment';
import { revokeSession } from './employeeIdentity';

export const validatePreviewPassword = (password: string) => {
  if (password.length < 12) {
    throw new Error('PASSWORD_TOO_SHORT');
  }
};

const validatePreviewEnrollment = (
  normalizedEmail: string,
  inviteCode: Value | undefined,
) => {
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

  if (typeof inviteCode !== 'string' || inviteCode !== configuredInviteCode) {
    throw new Error('INVALID_INVITE_CODE');
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
    validatePreviewEnrollment(normalizedEmail, params.inviteCode);
  }

  return { email: normalizedEmail };
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  session: { totalDurationMs: 3_600_000 },
  callbacks: {
    createOrUpdateUser: async (context, args) => {
      if (args.provider.id === 'employee-oidc') {
        return enrollEmployee(
          context as MutationCtx,
          args.profile,
          args.existingUserId,
        );
      }
      return (
        args.existingUserId ??
        context.db.insert('users', { email: args.profile.email })
      );
    },
    beforeSessionCreation: async (context, { userId }) => {
      const typedContext = context as MutationCtx;
      const expiredSessions = await typedContext.db
        .query('authSessions')
        .withIndex('by_userId_and_expirationTime', (index) =>
          index.eq('userId', userId).lte('expirationTime', Date.now()),
        )
        .take(100);
      for (const session of expiredSessions)
        await revokeSession(typedContext, session._id);
      const sessions = await typedContext.db
        .query('authSessions')
        .withIndex('by_userId_and_expirationTime', (index) =>
          index.eq('userId', userId).gt('expirationTime', Date.now()),
        )
        .take(100);
      if (sessions.length >= 100) throw new Error('SESSION_LIMIT_EXCEEDED');
      const identity = await typedContext.db
        .query('employeeIdentities')
        .withIndex('by_userId', (index) => index.eq('userId', userId))
        .unique();
      if (identity) await requireActiveEmployee(typedContext, userId);
    },
  },
  providers: [
    {
      id: 'employee-oidc',
      name: 'Employee identity',
      type: 'oidc',
      issuer: process.env.FENFORCE_OIDC_ISSUER,
      clientId: process.env.FENFORCE_OIDC_CLIENT_ID,
      clientSecret: process.env.FENFORCE_OIDC_CLIENT_SECRET,
      checks: ['pkce', 'state', 'nonce'],
      authorization: { params: { scope: 'openid profile' } },
      profile: async (_profile, tokens) => {
        const issuer = process.env.FENFORCE_OIDC_ISSUER;
        const audience = process.env.FENFORCE_OIDC_CLIENT_ID;
        const tenant = process.env.FENFORCE_OIDC_TENANT;
        if (!issuer || !audience || !tenant || !tokens.id_token)
          throw new Error('IDENTITY_NOT_CONFIGURED');
        const discovery = await fetch(
          `${issuer}/.well-known/openid-configuration`,
        );
        const metadata: { issuer?: string; jwks_uri?: string } =
          await discovery.json();
        if (metadata.issuer !== issuer || !metadata.jwks_uri)
          throw new Error('INVALID_IDENTITY_ISSUER');
        const { payload } = await jwtVerify(
          tokens.id_token,
          createRemoteJWKSet(new URL(metadata.jwks_uri)),
          {
            issuer,
            audience,
            algorithms: ['RS256'],
            requiredClaims: ['exp', 'iat', 'sub'],
          },
        );
        if (payload.tenant !== tenant || !payload.sub)
          throw new Error('INVALID_EMPLOYEE_IDENTITY');
        return {
          id: JSON.stringify([issuer, tenant, payload.sub]),
          issuer,
          tenant,
          subject: payload.sub,
        };
      },
    },
    Password<DataModel>({
      id: 'preview-password',
      profile: previewPasswordProfile,
      validatePasswordRequirements: validatePreviewPassword,
    }),
  ],
});
