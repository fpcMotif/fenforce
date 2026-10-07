/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountAudit from "../accountAudit.js";
import type * as accountContract from "../accountContract.js";
import type * as accountFields from "../accountFields.js";
import type * as accountLifecycle from "../accountLifecycle.js";
import type * as accountLifecycleCommands from "../accountLifecycleCommands.js";
import type * as accountOperationContract from "../accountOperationContract.js";
import type * as accountOperations from "../accountOperations.js";
import type * as accountPolicy from "../accountPolicy.js";
import type * as accountQueries from "../accountQueries.js";
import type * as accountQueryContract from "../accountQueryContract.js";
import type * as accountQueryCursor from "../accountQueryCursor.js";
import type * as accountQueryMigration from "../accountQueryMigration.js";
import type * as accountViewContract from "../accountViewContract.js";
import type * as accountViews from "../accountViews.js";
import type * as approvalContract from "../approvalContract.js";
import type * as approvalEffects from "../approvalEffects.js";
import type * as approvalLedger from "../approvalLedger.js";
import type * as approvalWorkflow from "../approvalWorkflow.js";
import type * as auth from "../auth.js";
import type * as authorization from "../authorization.js";
import type * as companies from "../companies.js";
import type * as companyDomain from "../companyDomain.js";
import type * as contactAudit from "../contactAudit.js";
import type * as contactContract from "../contactContract.js";
import type * as contactFields from "../contactFields.js";
import type * as contactLifecycle from "../contactLifecycle.js";
import type * as contactOperations from "../contactOperations.js";
import type * as contactPolicy from "../contactPolicy.js";
import type * as contactQueries from "../contactQueries.js";
import type * as contactQueryContract from "../contactQueryContract.js";
import type * as contactSource from "../contactSource.js";
import type * as employeeEnrollment from "../employeeEnrollment.js";
import type * as employeeIdentity from "../employeeIdentity.js";
import type * as fingerprintCursor from "../fingerprintCursor.js";
import type * as http from "../http.js";
import type * as memberDisplayName from "../memberDisplayName.js";
import type * as membershipRole from "../membershipRole.js";
import type * as mockAccountBenchmark from "../mockAccountBenchmark.js";
import type * as mockBrowserReplay from "../mockBrowserReplay.js";
import type * as operationReceipt from "../operationReceipt.js";
import type * as salesApprovals from "../salesApprovals.js";
import type * as salesCommands from "../salesCommands.js";
import type * as salesCommercial from "../salesCommercial.js";
import type * as salesContract from "../salesContract.js";
import type * as salesOperations from "../salesOperations.js";
import type * as salesPipeline from "../salesPipeline.js";
import type * as salesPolicy from "../salesPolicy.js";
import type * as salesProjects from "../salesProjects.js";
import type * as salesReviews from "../salesReviews.js";
import type * as salesValidation from "../salesValidation.js";
import type * as singleAccountStream from "../singleAccountStream.js";
import type * as workflowRuntime from "../workflowRuntime.js";
import type * as workspaceCompanies from "../workspaceCompanies.js";
import type * as workspaceContacts from "../workspaceContacts.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountAudit: typeof accountAudit;
  accountContract: typeof accountContract;
  accountFields: typeof accountFields;
  accountLifecycle: typeof accountLifecycle;
  accountLifecycleCommands: typeof accountLifecycleCommands;
  accountOperationContract: typeof accountOperationContract;
  accountOperations: typeof accountOperations;
  accountPolicy: typeof accountPolicy;
  accountQueries: typeof accountQueries;
  accountQueryContract: typeof accountQueryContract;
  accountQueryCursor: typeof accountQueryCursor;
  accountQueryMigration: typeof accountQueryMigration;
  accountViewContract: typeof accountViewContract;
  accountViews: typeof accountViews;
  approvalContract: typeof approvalContract;
  approvalEffects: typeof approvalEffects;
  approvalLedger: typeof approvalLedger;
  approvalWorkflow: typeof approvalWorkflow;
  auth: typeof auth;
  authorization: typeof authorization;
  companies: typeof companies;
  companyDomain: typeof companyDomain;
  contactAudit: typeof contactAudit;
  contactContract: typeof contactContract;
  contactFields: typeof contactFields;
  contactLifecycle: typeof contactLifecycle;
  contactOperations: typeof contactOperations;
  contactPolicy: typeof contactPolicy;
  contactQueries: typeof contactQueries;
  contactQueryContract: typeof contactQueryContract;
  contactSource: typeof contactSource;
  employeeEnrollment: typeof employeeEnrollment;
  employeeIdentity: typeof employeeIdentity;
  fingerprintCursor: typeof fingerprintCursor;
  http: typeof http;
  memberDisplayName: typeof memberDisplayName;
  membershipRole: typeof membershipRole;
  mockAccountBenchmark: typeof mockAccountBenchmark;
  mockBrowserReplay: typeof mockBrowserReplay;
  operationReceipt: typeof operationReceipt;
  salesApprovals: typeof salesApprovals;
  salesCommands: typeof salesCommands;
  salesCommercial: typeof salesCommercial;
  salesContract: typeof salesContract;
  salesOperations: typeof salesOperations;
  salesPipeline: typeof salesPipeline;
  salesPolicy: typeof salesPolicy;
  salesProjects: typeof salesProjects;
  salesReviews: typeof salesReviews;
  salesValidation: typeof salesValidation;
  singleAccountStream: typeof singleAccountStream;
  workflowRuntime: typeof workflowRuntime;
  workspaceCompanies: typeof workspaceCompanies;
  workspaceContacts: typeof workspaceContacts;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
