import type { SalesCommand, SalesProject, SalesRelease } from './salesContract';
import {
  salesAssertEditable,
  salesCurrentQuote,
  salesDate,
  salesQuantity,
  salesRequire,
  salesText,
  salesTotal,
  salesUnexpiredQuote,
} from './salesValidation';

type CommercialCommand<TType extends SalesCommand['type']> = Extract<
  SalesCommand,
  { type: TType }
>;

export const salesSetNextAction = (
  project: SalesProject,
  command: CommercialCommand<'setNextAction'>,
) => {
  salesRequire(project.stage !== 'lost', 'SALES_PROJECT_LOST');
  project.nextAction = salesText(command.text);
  project.nextActionDate = salesDate(command.dueDate);
};

export const salesSetCloseDate = (
  project: SalesProject,
  command: CommercialCommand<'setCloseDate'>,
) => {
  salesAssertEditable(project);
  if (command.closeDate === null)
    salesRequire(project.stage === 'qualified', 'SALES_CLOSE_DATE_REQUIRED');
  project.closeDate =
    command.closeDate === null ? null : salesDate(command.closeDate);
};

export const salesRecordSample = (
  project: SalesProject,
  command: CommercialCommand<'recordSample'>,
) => {
  salesAssertEditable(project);
  if (command.status === 'shipped' || command.status === 'accepted') {
    salesText(command.batchReference);
    salesText(command.coaReference);
    salesText(command.trackingReference);
  }
  if (command.status === 'not-required') salesText(command.notes);
  const { type: _type, ...sample } = command;
  project.sample = sample;
};

export const salesReviseQuote = (
  project: SalesProject,
  command: CommercialCommand<'reviseQuote'>,
) => {
  salesAssertEditable(project);
  salesRequire(
    [
      'EXW',
      'FCA',
      'CPT',
      'CIP',
      'DAP',
      'DPU',
      'DDP',
      'FAS',
      'FOB',
      'CFR',
      'CIF',
    ].includes(command.incoterm),
    'SALES_INVALID_INCOTERM',
  );
  salesText(command.namedPlace);
  salesText(command.packaging);
  salesDate(command.validUntil);
  salesDate(command.deliveryDate);
  const { type: _type, ...terms } = command;
  project.quoteVersion += 1;
  project.quote = {
    ...terms,
    exceptionReason: command.exceptionReason.trim(),
    version: project.quoteVersion,
    totalMinor: salesTotal(project.quantityMilli, command.unitPriceMinor),
    indicative: true,
    rounding: 'half-up-minor-unit',
    simulatedSentEvidence: null,
  };
  project.pricingReview = null;
  project.orderReview = null;
  project.purchaseOrder = null;
  project.stage = 'qualified';
};

export const salesCapturePurchaseOrder = (
  project: SalesProject,
  command: CommercialCommand<'capturePurchaseOrder'>,
) => {
  salesAssertEditable(project);
  const quote = salesUnexpiredQuote(project);
  salesRequire(quote.simulatedSentEvidence !== null, 'SALES_QUOTE_NOT_SENT');
  salesText(command.reference);
  salesText(command.documentReference);
  salesText(command.qualityReference);
  const { type: _type, ...purchaseOrder } = command;
  project.purchaseOrder = { ...purchaseOrder, quoteVersion: quote.version };
  project.orderReview = null;
  project.stage = 'po-received';
};

export const salesNewRelease = (
  reference: string,
  quantityMilli: number,
  deliveryDate: string,
): SalesRelease => ({
  reference,
  quantityMilli,
  deliveryDate,
  erpState: 'ready',
  simulatedSapReference: null,
  evidenceReference: null,
  simulation: true,
});

export const salesCreateBlanketRelease = (
  project: SalesProject,
  command: CommercialCommand<'createBlanketRelease'>,
) => {
  salesRequire(project.stage === 'confirmed', 'SALES_CONFIRMATION_REQUIRED');
  salesRequire(
    project.purchaseOrder?.orderType === 'blanket',
    'SALES_NOT_BLANKET',
  );
  salesRequire(project.releases.length < 24, 'SALES_RELEASE_LIMIT');
  const reference = salesText(command.reference);
  salesRequire(
    !project.releases.some((release) => release.reference === reference),
    'SALES_RELEASE_REFERENCE_EXISTS',
  );
  salesQuantity(command.quantityMilli, project.unit);
  const allocated = project.releases.reduce(
    (sum, release) => sum + BigInt(release.quantityMilli),
    0n,
  );
  salesRequire(
    allocated + BigInt(command.quantityMilli) <= BigInt(project.quantityMilli),
    'SALES_OVER_RELEASE',
  );
  project.releases.push(
    salesNewRelease(
      reference,
      command.quantityMilli,
      salesDate(command.deliveryDate),
    ),
  );
};

export const salesSimulateSap = (
  project: SalesProject,
  command: CommercialCommand<'simulateSapHandoff'>,
) => {
  salesRequire(project.stage === 'confirmed', 'SALES_CONFIRMATION_REQUIRED');
  const release = project.releases.find(
    (candidate) => candidate.reference === command.releaseReference,
  );
  salesRequire(release !== undefined, 'SALES_RELEASE_NOT_FOUND');
  if (release === undefined) return;
  salesRequire(release.erpState !== 'accepted', 'SALES_SAP_ALREADY_ACCEPTED');
  release.evidenceReference = salesText(command.evidenceReference);
  release.erpState = command.outcome;
  release.simulatedSapReference = `DEMO-${project._id}-${release.reference}`;
};

export const salesCloseLost = (
  project: SalesProject,
  command: CommercialCommand<'closeLost'>,
) => {
  salesAssertEditable(project);
  project.lostReason = salesText(command.reason);
  project.stage = 'lost';
  project.outcome = 'lost';
};

export const salesConfirmStandardRelease = (project: SalesProject) => {
  if (project.purchaseOrder?.orderType === 'standard') {
    project.releases = [
      salesNewRelease(
        'STANDARD',
        project.quantityMilli,
        salesCurrentQuote(project).deliveryDate,
      ),
    ];
  }
};
