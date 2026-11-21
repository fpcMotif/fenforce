import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexQueryClient } from '@convex-dev/react-query';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { useLingui } from '@lingui/react/macro';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AuthLoading,
  Authenticated,
  ConvexReactClient,
  Unauthenticated,
} from 'convex/react';
import { ErrorBoundary } from 'react-error-boundary';
import { ThemeProvider } from 'twenty-ui/theme';

import { SessionGate } from './SessionGate';
import { PreviewRouter } from './PreviewRouter';
import { PreviewSignIn } from './PreviewSignIn';
import { PreviewError } from './PreviewError';
import { messages } from './locales/en';

import './ConvexCompaniesPreview.css';

const convexClient = new ConvexReactClient(
  import.meta.env.REACT_APP_FENFORCE_CONVEX_URL,
);
const convexQueryClient = new ConvexQueryClient(convexClient);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn(),
    },
  },
});

convexQueryClient.connect(queryClient);

const i18n = setupI18n({ locale: 'en', messages: { en: messages } });

const AuthLoadingPage = () => {
  const { t } = useLingui();

  return (
    <div className="fenforce-gate" role="status">
      <div className="fenforce-gate-card">{t`Connecting to Fenforce…`}</div>
    </div>
  );
};

export const ConvexCompaniesPreview = () => (
  <I18nProvider i18n={i18n}>
    <ThemeProvider colorScheme="light">
      <ConvexAuthProvider client={convexClient}>
        <QueryClientProvider client={queryClient}>
          <AuthLoading>
            <AuthLoadingPage />
          </AuthLoading>
          <Unauthenticated>
            <PreviewSignIn />
          </Unauthenticated>
          <Authenticated>
            <ErrorBoundary
              fallbackRender={({ error }) => <PreviewError error={error} />}
            >
              <SessionGate>
                <PreviewRouter />
              </SessionGate>
            </ErrorBoundary>
          </Authenticated>
        </QueryClientProvider>
      </ConvexAuthProvider>
    </ThemeProvider>
  </I18nProvider>
);
