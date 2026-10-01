import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexQueryClient } from '@convex-dev/react-query';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { useLingui } from '@lingui/react/macro';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  AuthLoading,
  Authenticated,
  ConvexReactClient,
  Unauthenticated,
} from 'convex/react';
import { ErrorBoundary } from 'react-error-boundary';
import { ThemeProvider } from 'twenty-ui/theme';

import { ClearQueryCacheOnUnmountEffect } from './ClearQueryCacheOnUnmountEffect';
import {
  CompanyDetailPage,
  CompaniesPage,
  WorkspaceGate,
} from './CompaniesWorkspace';
import { PreviewSignIn } from './PreviewSignIn';

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

const i18n = setupI18n({ locale: 'en', messages: { en: {} } });

const rootRoute = createRootRoute({
  component: () => (
    <WorkspaceGate>
      <Outlet />
    </WorkspaceGate>
  ),
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <Navigate to="/objects/companies" />,
});
const companiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/objects/companies',
  component: CompaniesPage,
});
const companyDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/object/company/$companyId',
  component: CompanyDetailPage,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    companiesRoute,
    companyDetailRoute,
  ]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const AuthLoadingPage = () => {
  const { t } = useLingui();

  return (
    <div className="fenforce-gate" role="status">
      <div className="fenforce-gate-card">{t`Connecting to Fenforce…`}</div>
    </div>
  );
};

const PreviewError = () => {
  const { t } = useLingui();

  return (
    <div className="fenforce-gate">
      <div className="fenforce-gate-card" role="alert">
        <h1>{t`Unable to load Fenforce`}</h1>
        <p>{t`Check your connection and try again.`}</p>
        <button type="button" onClick={() => window.location.reload()}>
          {t`Reload`}
        </button>
      </div>
    </div>
  );
};

export const ConvexCompaniesPreview = () => (
  <I18nProvider i18n={i18n}>
    <ThemeProvider colorScheme="light">
      <ConvexAuthProvider client={convexClient}>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary fallback={<PreviewError />}>
            <AuthLoading>
              <AuthLoadingPage />
            </AuthLoading>
            <Unauthenticated>
              <PreviewSignIn />
            </Unauthenticated>
            <Authenticated>
              <ClearQueryCacheOnUnmountEffect />
              <RouterProvider router={router} />
            </Authenticated>
          </ErrorBoundary>
        </QueryClientProvider>
      </ConvexAuthProvider>
    </ThemeProvider>
  </I18nProvider>
);
