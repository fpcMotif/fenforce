/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as approvalContract from "../approvalContract.js";
import type * as approvalEffects from "../approvalEffects.js";
import type * as approvalLedger from "../approvalLedger.js";
import type * as approvalWorkflow from "../approvalWorkflow.js";
import type * as auth from "../auth.js";
import type * as authorization from "../authorization.js";
import type * as companies from "../companies.js";
import type * as companyDomain from "../companyDomain.js";
import type * as http from "../http.js";
import type * as employeeIdentity from "../employeeIdentity.js";
import type * as employeeEnrollment from "../employeeEnrollment.js";
import type * as workflowRuntime from "../workflowRuntime.js";
import type * as workspaceCompanies from "../workspaceCompanies.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  approvalContract: typeof approvalContract;
  approvalEffects: typeof approvalEffects;
  approvalLedger: typeof approvalLedger;
  approvalWorkflow: typeof approvalWorkflow;
  auth: typeof auth;
  authorization: typeof authorization;
  companies: typeof companies;
  companyDomain: typeof companyDomain;
  http: typeof http;
  employeeIdentity: typeof employeeIdentity;
  employeeEnrollment: typeof employeeEnrollment;
  workflowRuntime: typeof workflowRuntime;
  workspaceCompanies: typeof workspaceCompanies;
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
