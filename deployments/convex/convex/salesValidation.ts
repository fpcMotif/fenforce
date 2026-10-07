import { ConvexError } from 'convex/values';

import type { SalesCommand, SalesProject, SalesQuote } from './salesContract';

export const salesRequire = (condition: boolean, code: string): void => {
  if (!condition) throw new ConvexError(code);
};

export const salesText = (value: string, required = true): string => {
  const text = value.trim();
  salesRequire(value.length <= 1000, 'SALES_TEXT_TOO_LONG');
  if (required) salesRequire(text.length > 0, 'SALES_TEXT_REQUIRED');
  return text;
};

export const salesDate = (value: string): string => {
  salesRequire(/^\d{4}-\d{2}-\d{2}$/.test(value), 'SALES_INVALID_DATE');
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  salesRequire(Number.isFinite(timestamp), 'SALES_INVALID_DATE');
  salesRequire(
    new Date(timestamp).toISOString().slice(0, 10) === value,
    'SALES_INVALID_DATE',
  );
  return value;
};

export const salesQuantity = (
  quantityMilli: number,
  unit: SalesProject['unit'],
): number => {
  salesRequire(
    Number.isSafeInteger(quantityMilli) && quantityMilli > 0,
    'SALES_INVALID_QUANTITY',
  );
  if (unit === 'piece')
    salesRequire(quantityMilli % 1000 === 0, 'SALES_FRACTIONAL_PIECE');
  return quantityMilli;
};

export const salesTotal = (
  quantityMilli: number,
  unitPriceMinor: number,
): number => {
  salesRequire(
    Number.isSafeInteger(unitPriceMinor) && unitPriceMinor > 0,
    'SALES_INVALID_PRICE',
  );
  const total = (BigInt(quantityMilli) * BigInt(unitPriceMinor) + 500n) / 1000n;
  salesRequire(
    total <= BigInt(Number.MAX_SAFE_INTEGER),
    'SALES_TOTAL_OVERFLOW',
  );
  return Number(total);
};

export const salesCurrentQuote = (project: SalesProject): SalesQuote => {
  if (project.quote === null) throw new ConvexError('SALES_QUOTE_REQUIRED');
  return project.quote;
};

export const salesUnexpiredQuote = (project: SalesProject): SalesQuote => {
  const quote = salesCurrentQuote(project);
  salesRequire(
    quote.validUntil >= new Date(Date.now()).toISOString().slice(0, 10),
    'SALES_QUOTE_EXPIRED',
  );
  return quote;
};

export const salesAssertEditable = (project: SalesProject): void => {
  salesRequire(project.stage !== 'confirmed', 'SALES_ORDER_CONFIRMED');
  salesRequire(project.stage !== 'lost', 'SALES_PROJECT_LOST');
};

export const salesValidateCommand = (command: SalesCommand): void => {
  for (const value of Object.values(command)) {
    if (typeof value === 'string') salesText(value, false);
  }
};

export const salesBlockers = (project: SalesProject): string[] => {
  const blockers: string[] = [];
  if (project.quote === null) blockers.push('SALES_QUOTE_REQUIRED');
  if (project.closeDate === null) blockers.push('SALES_CLOSE_DATE_REQUIRED');
  if (project.purchaseOrder === null) blockers.push('SALES_PO_REQUIRED');
  if (project.orderReview?.status !== 'approved')
    blockers.push('SALES_ORDER_REVIEW_REQUIRED');
  if (!['accepted', 'not-required'].includes(project.sample?.status ?? ''))
    blockers.push('SALES_SAMPLE_CLEARANCE_REQUIRED');
  if (project.stage === 'lost') blockers.push('SALES_PROJECT_LOST');
  return [...blockers, ...salesQuoteBlockers(project)];
};

const salesQuoteBlockers = (project: SalesProject): string[] => {
  const blockers: string[] = [];
  const quote = project.quote;
  if (quote === null) return blockers;
  if (quote.validUntil < new Date(Date.now()).toISOString().slice(0, 10))
    blockers.push('SALES_QUOTE_EXPIRED');
  if (quote.simulatedSentEvidence === null)
    blockers.push('SALES_QUOTE_NOT_SENT');
  if (
    quote.exceptionReason.length > 0 &&
    project.pricingReview?.status !== 'approved'
  )
    blockers.push('SALES_PRICING_REVIEW_REQUIRED');
  return blockers;
};
