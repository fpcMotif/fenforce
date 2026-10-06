import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { useState } from 'react';

import {
  CompanyDetailPage,
  CompaniesPage,
  WorkspaceGate,
} from './CompaniesWorkspace';
import { PreviewError } from './PreviewError';

const rootRoute = createRootRoute({
  validateSearch: (
    search: Record<string, unknown>,
  ): { workspace?: string } => ({
    workspace:
      typeof search.workspace === 'string' ? search.workspace : undefined,
  }),
  component: () => (
    <WorkspaceGate>
      <Outlet />
    </WorkspaceGate>
  ),
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <Navigate to="/objects/companies" search={(search) => search} />
  ),
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
const createPreviewRouter = () =>
  createRouter({
    defaultErrorComponent: PreviewError,
    routeTree: rootRoute.addChildren([
      indexRoute,
      companiesRoute,
      companyDetailRoute,
    ]),
  });

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createPreviewRouter>;
  }
}

export const PreviewRouter = () => {
  const [router] = useState(createPreviewRouter);
  return <RouterProvider router={router} />;
};
