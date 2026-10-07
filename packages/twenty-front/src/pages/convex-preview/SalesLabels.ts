import { useLingui } from '@lingui/react/macro';

export const useSalesLabels = () => {
  const { t } = useLingui();
  const labels = new Map([
    ['qualified', t`Qualified project`],
    ['quoted', t`Quote sent`],
    ['po-received', t`PO received`],
    ['review', t`Order under review`],
    ['confirmed', t`Won · confirmation simulated`],
    ['lost', t`Closed Lost`],
    ['pending', t`Pending`],
    ['approved', t`Approved`],
    ['rejected', t`Rejected`],
    ['requested', t`Sample requested`],
    ['shipped', t`Sample shipped`],
    ['accepted', t`Customer accepted`],
    ['not-required', t`Sampling not required`],
    ['pricing', t`Pricing exception`],
    ['support', t`Co-worker`],
    ['management', t`Branch manager`],
    ['osbo', t`OSBO`],
    ['finance', t`Finance`],
    ['supply', t`Supply`],
    ['prepayment', t`Prepayment`],
    ['net30', t`Net 30`],
    ['net60', t`Net 60`],
    ['standard', t`Standard order`],
    ['blanket', t`Blanket order`],
    ['ready', t`Ready for simulated handoff`],
    ['failed', t`Demo: handoff failed`],
    ['uncertain', t`Demo: reconciliation needed`],
    ['create', t`Project created`],
    ['setNextAction', t`Next action updated`],
    ['recordSample', t`Sample progress recorded`],
    ['reviseQuote', t`Quotation version created`],
    ['submitPricingReview', t`Pricing review requested`],
    ['markQuoteSent', t`Quote communication recorded`],
    ['capturePurchaseOrder', t`Customer PO captured`],
    ['submitOrderReview', t`Order review requested`],
    ['simulateReviewDecision', t`Review decision simulated`],
    ['simulateCustomerConfirmation', t`Customer confirmation simulated`],
    ['createBlanketRelease', t`Blanket release created`],
    ['simulateSapHandoff', t`SAP handoff simulated`],
    ['logActivity', t`Customer activity recorded`],
    ['closeLost', t`Project lost`],
    ['setCloseDate', t`Expected close date updated`],
    ['setPrimaryContact', t`Primary contact updated`],
    ['applyApprovalOutcome', t`Approval decision applied`],
  ]);
  const problems = new Map([
    ['SALES_QUOTE_REQUIRED', t`Prepare a quotation.`],
    [
      'SALES_PO_REQUIRED',
      t`Capture the customer's PO and quality requirements.`,
    ],
    [
      'SALES_ORDER_REVIEW_REQUIRED',
      t`Complete co-worker, manager, OSBO, finance and supply review.`,
    ],
    [
      'SALES_SAMPLE_CLEARANCE_REQUIRED',
      t`Record an accepted sample or explain why sampling is unnecessary.`,
    ],
    [
      'SALES_QUOTE_EXPIRED',
      t`The quotation expired. Prepare a current version and submit fresh reviews.`,
    ],
    [
      'SALES_QUOTE_NOT_SENT',
      t`Record the quote communication before capturing the PO.`,
    ],
    [
      'SALES_PRICING_REVIEW_REQUIRED',
      t`The pricing exception needs approval for this quotation version.`,
    ],
    [
      'SALES_PROJECT_CHANGED',
      t`The project changed while you were working. Close and reopen this action to review the latest version.`,
    ],
    [
      'SALES_REVIEW_GATE_ORDER',
      t`Complete co-worker review before branch manager review, then OSBO review.`,
    ],
    ['SALES_SELF_APPROVAL', t`A different manager must review your request.`],
    [
      'SALES_SIMULATION_MANAGER_REQUIRED',
      t`A manager account is required for simulated reviews.`,
    ],
    [
      'SALES_REVIEW_REQUIRED',
      t`Submit this quotation or order for review first.`,
    ],
    [
      'SALES_REVIEW_CLOSED',
      t`This review is closed. Correct the details and submit a new review.`,
    ],
    ['SALES_REVIEW_ALREADY_PENDING', t`This review is already pending.`],
    [
      'SALES_GATE_ALREADY_DECIDED',
      t`This responsibility already has a recorded decision.`,
    ],
    [
      'SALES_REQUESTER_ACCESS_CHANGED',
      t`The requester no longer has access. An authorized salesperson must submit a new review.`,
    ],
    [
      'SALES_APPROVER_ACCESS_CHANGED',
      t`A reviewer no longer has approval access. Submit a new review.`,
    ],
    [
      'SALES_OWNER_CHANGED',
      t`The customer owner changed. Submit a new review for the current owner.`,
    ],
    [
      'SALES_REVIEW_NOT_CURRENT',
      t`This review does not match the current commercial version.`,
    ],
    [
      'SALES_ORDER_CONFIRMED',
      t`This order is already confirmed. Its commercial terms are frozen.`,
    ],
    ['SALES_PROJECT_LOST', t`This project is closed as lost.`],
    [
      'SALES_OVER_RELEASE',
      t`The release exceeds the remaining order quantity.`,
    ],
    [
      'SALES_RELEASE_REFERENCE_EXISTS',
      t`This release reference already exists. Use its existing handoff record.`,
    ],
    ['SALES_RELEASE_NOT_FOUND', t`Choose an existing release reference.`],
    [
      'SALES_NOT_BLANKET',
      t`This is a standard order. Its release is created automatically on confirmation.`,
    ],
    [
      'SALES_CONFIRMATION_REQUIRED',
      t`Confirm the reviewed order before creating or handing off a release.`,
    ],
    [
      'SALES_SAP_ALREADY_ACCEPTED',
      t`This release already has a simulated SAP acceptance.`,
    ],
    [
      'SALES_PRICING_EXCEPTION_REQUIRED',
      t`Enter the pricing or terms exception in the quotation first.`,
    ],
    [
      'SALES_QUOTE_ALREADY_SENT',
      t`Quote communication is already recorded for this version.`,
    ],
    [
      'SALES_PO_QUOTE_CHANGED',
      t`The PO must match the current quotation version.`,
    ],
    [
      'SALES_TEXT_REQUIRED',
      t`Complete all required fields and evidence references.`,
    ],
    ['SALES_TEXT_TOO_LONG', t`Keep each field within 1,000 characters.`],
    ['SALES_INVALID_DATE', t`Enter a valid calendar date.`],
    [
      'SALES_CLOSE_DATE_REQUIRED',
      t`Set the expected close date before recording the quote as sent or confirming the order.`,
    ],
    ['CONTACT_NOT_FOUND', t`Choose an active contact of this company.`],
    [
      'SALES_INVALID_QUANTITY',
      t`Enter a positive quantity with up to three decimal places.`,
    ],
    ['SALES_FRACTIONAL_PIECE', t`Pieces must be a whole number.`],
    [
      'SALES_INVALID_PRICE',
      t`Enter a positive price with up to two decimal places.`,
    ],
    [
      'SALES_TOTAL_OVERFLOW',
      t`The order total is too large. Reduce its quantity or unit price.`,
    ],
    [
      'SALES_RELEASE_LIMIT',
      t`This demo supports up to 24 releases per project.`,
    ],
    [
      'INVALID_DECIMAL',
      t`Enter a positive decimal number within the supported precision.`,
    ],
  ]);
  return {
    label: (value: string) => labels.get(value) ?? value,
    problem: (code: string) =>
      problems.get(code) ??
      t`Unable to save. Check the current project, your access and the entered details.`,
  };
};
