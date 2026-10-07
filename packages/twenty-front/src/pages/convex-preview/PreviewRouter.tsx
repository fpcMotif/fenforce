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
  CompanyTrashPage,
  CompaniesPage,
  WorkspaceGate,
  WorkspaceAdministrationPage,
} from './CompaniesWorkspace';
import { parseCompanyListSearch } from './companyListQuery';
import {
  PeoplePage,
  PeopleTrashPage,
  PersonDetailPage,
} from './ContactsWorkspace';
import { parseContactListSearch } from './contactListQuery';
import { PreviewError } from './PreviewError';
import { SalesProjectsPage } from './SalesProjectsPage';
import { SalesProjectDetailPage } from './SalesProjectDetail';

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
  validateSearch: parseCompanyListSearch,
  component: CompaniesPage,
});
const companyDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/object/company/$companyId',
  component: CompanyDetailPage,
});
const membersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/members',
  component: WorkspaceAdministrationPage,
});
const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/objects/companies/trash',
  component: CompanyTrashPage,
});
const peopleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/objects/people',
  validateSearch: parseContactListSearch,
  component: PeoplePage,
});
const personDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/object/person/$personId',
  component: PersonDetailPage,
});
const peopleTrashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/objects/people/trash',
  component: PeopleTrashPage,
});
const salesProjectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/objects/sales-projects',
  component: SalesProjectsPage,
});
const salesProjectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/object/sales-project/$projectId',
  component: SalesProjectDetailPage,
});
const createPreviewRouter = () =>
  createRouter({
    defaultErrorComponent: PreviewError,
    routeTree: rootRoute.addChildren([
      indexRoute,
      companiesRoute,
      companyDetailRoute,
      membersRoute,
      trashRoute,
      peopleRoute,
      personDetailRoute,
      peopleTrashRoute,
      salesProjectsRoute,
      salesProjectDetailRoute,
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
