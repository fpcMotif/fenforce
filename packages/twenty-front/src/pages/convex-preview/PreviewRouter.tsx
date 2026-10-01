import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';

import {
  CompanyDetailPage,
  CompaniesPage,
  WorkspaceGate,
} from './CompaniesWorkspace';
import { PreviewError } from './PreviewError';

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
  defaultErrorComponent: PreviewError,
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

export const PreviewRouter = () => <RouterProvider router={router} />;
