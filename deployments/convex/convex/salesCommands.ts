import {
  salesCapturePurchaseOrder,
  salesCloseLost,
  salesCreateBlanketRelease,
  salesRecordSample,
  salesReviseQuote,
  salesSetNextAction,
  salesSimulateSap,
} from './salesCommercial';
import type { SalesCommand } from './salesContract';
import {
  salesMarkQuoteSent,
  salesSimulateConfirmation,
  salesSimulateDecision,
  salesSubmitReview,
  type SalesCommandContext,
} from './salesReviews';
import { salesRequire, salesText } from './salesValidation';

type SalesCommandHandlers = {
  [TType in SalesCommand['type']]: (
    environment: SalesCommandContext,
    command: Extract<SalesCommand, { type: TType }>,
  ) => void | Promise<void>;
};

const SALES_COMMAND_HANDLERS: SalesCommandHandlers = {
  setNextAction: ({ project }, command) => salesSetNextAction(project, command),
  recordSample: ({ project }, command) => salesRecordSample(project, command),
  reviseQuote: ({ project }, command) => salesReviseQuote(project, command),
  submitPricingReview: (environment) =>
    salesSubmitReview(environment, 'pricing'),
  simulateReviewDecision: salesSimulateDecision,
  markQuoteSent: (environment, command) =>
    salesMarkQuoteSent(environment, command.evidenceReference),
  capturePurchaseOrder: ({ project }, command) =>
    salesCapturePurchaseOrder(project, command),
  submitOrderReview: (environment) => salesSubmitReview(environment, 'order'),
  simulateCustomerConfirmation: (environment, command) =>
    salesSimulateConfirmation(environment, command.evidenceReference),
  createBlanketRelease: ({ project }, command) =>
    salesCreateBlanketRelease(project, command),
  simulateSapHandoff: ({ project }, command) =>
    salesSimulateSap(project, command),
  logActivity: ({ project }, command) => {
    salesRequire(project.stage !== 'lost', 'SALES_PROJECT_LOST');
    salesText(command.text);
  },
  closeLost: ({ project }, command) => salesCloseLost(project, command),
};

export const salesApplyCommand = <TType extends SalesCommand['type']>(
  environment: SalesCommandContext,
  command: Extract<SalesCommand, { type: TType }>,
) => {
  const handler: (
    environment: SalesCommandContext,
    command: Extract<SalesCommand, { type: TType }>,
  ) => void | Promise<void> = SALES_COMMAND_HANDLERS[command.type];
  return handler(environment, command);
};
