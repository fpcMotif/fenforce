import { expect, test, type Locator, type Page } from '@playwright/test';

import { createAccount } from './contact-helpers';
import { chooseEmployee, employeeClient, prepareReplay } from './helpers';

const openAction = async (page: Page, title: string) => {
  const section = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: title }) });
  if ((await section.getAttribute('open')) === null)
    await section.locator('summary').click();
  return section;
};

const saveAction = async (section: Locator, title: string) => {
  await section.getByRole('button', { name: title, exact: true }).click();
  await expect(section.getByRole('status')).toHaveText('Saved.');
};

test('product sales preserves review gates, confirms a blanket order and reconciles its release', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const fixture = await prepareReplay();
  await page.goto(`/objects/companies?workspace=${fixture.workspaceId}`);
  await chooseEmployee(page, 'seller-a');
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  const client = await employeeClient(page);
  const companyName = `Sales journey ${Date.now()}`;
  const accountId = await client.mutation(createAccount, {
    workspaceId: fixture.workspaceId,
    name: companyName,
  });
  await page.getByRole('link', { name: 'Sales projects', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Search companies', exact: true })
    .fill(companyName);
  const companyOption = page.getByRole('option', {
    name: companyName,
    exact: true,
  });
  const moreCompanies = page.getByRole('button', {
    name: 'Load more companies',
    exact: true,
  });
  for (
    let scan = 0;
    scan < 20 && (await companyOption.count()) === 0;
    scan += 1
  ) {
    await expect(moreCompanies).toBeEnabled();
    await moreCompanies.click();
    await expect
      .poll(
        async () =>
          (await companyOption.count()) > 0 ||
          (await moreCompanies.isEnabled()),
      )
      .toBe(true);
  }
  await expect(companyOption).toBeAttached();
  await page
    .getByRole('combobox', { name: 'Company', exact: true })
    .selectOption(accountId);
  await page
    .getByRole('button', { name: 'New sales project', exact: true })
    .click();
  const creator = page.getByRole('region', {
    name: 'New sales project',
    exact: true,
  });
  for (const [label, value] of [
    ['Project name', 'Demo ingredient supply'],
    ['Material code', 'DEMO-100'],
    ['Product name', 'Demo food ingredient'],
    ['Specification or grade', 'Food grade, customer specification A'],
    ['Customer application', 'Bakery pilot production'],
    ['Expected order quantity', '1000'],
    ['Next action', 'Confirm customer sample feedback'],
    ['Follow-up date', '2099-10-08'],
  ])
    await creator.getByLabel(label, { exact: true }).fill(value);
  await creator
    .getByRole('combobox', { name: 'Currency', exact: true })
    .selectOption('EUR');
  await creator
    .getByRole('button', { name: 'Create sales project', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Demo ingredient supply', exact: true }),
  ).toBeVisible();
  const projectUrl = page.url();

  const sample = await openAction(page, 'Record sample progress');
  await sample
    .getByRole('combobox', { name: 'Sample status', exact: true })
    .selectOption('accepted');
  await sample
    .getByLabel('Sample batch reference', { exact: true })
    .fill('DEMO-BATCH-A');
  await sample.getByLabel('COA reference', { exact: true }).fill('DEMO-COA-A');
  await sample
    .getByLabel('Tracking reference', { exact: true })
    .fill('DEMO-TRACK-A');
  await sample
    .getByLabel('Feedback or reason', { exact: true })
    .fill('Customer confirmed the trial meets the specification.');
  await saveAction(sample, 'Record sample progress');

  const quote = await openAction(page, 'Prepare or revise quotation');
  for (const [label, value] of [
    ['Price per unit', '12.50'],
    ['Named port or place', 'Demo warehouse'],
    ['Packaging', '25 kg bags'],
    ['Quote valid until', '2099-12-31'],
    ['Delivery date', '2099-11-01'],
    [
      'Pricing or terms exception reason',
      'Customer requests an introductory price for the first blanket order.',
    ],
  ])
    await quote.getByLabel(label, { exact: true }).fill(value);
  await quote
    .getByRole('combobox', { name: 'Payment terms', exact: true })
    .selectOption('net30');
  await saveAction(quote, 'Prepare or revise quotation');
  await saveAction(
    await openAction(page, 'Request pricing review'),
    'Request pricing review',
  );
  const sent = await openAction(page, 'Record quote sent');
  await sent.getByLabel('Evidence reference').fill('DEMO-QUOTE-COMMUNICATION');
  await sent
    .getByRole('button', { name: 'Record quote sent', exact: true })
    .click();
  await expect(sent.getByRole('alert')).toHaveText(
    'Set the expected close date before recording the quote as sent or confirming the order.',
  );
  await expect(sent.getByLabel('Evidence reference')).toHaveValue(
    'DEMO-QUOTE-COMMUNICATION',
  );
  const closeDate = await openAction(page, 'Set expected close date');
  await closeDate
    .getByLabel('Expected close date', { exact: true })
    .fill('2099-12-15');
  await saveAction(closeDate, 'Set expected close date');
  await sent.locator('summary').click();
  await openAction(page, 'Record quote sent');
  await sent.getByLabel('Evidence reference').fill('DEMO-QUOTE-COMMUNICATION');
  await sent
    .getByRole('button', { name: 'Record quote sent', exact: true })
    .click();
  await expect(sent.getByRole('alert')).toHaveText(
    'The pricing exception needs approval for this quotation version.',
  );
  const pricingManagerContext = await browser.newContext();
  try {
    const manager = await pricingManagerContext.newPage();
    await manager.goto(projectUrl);
    await chooseEmployee(manager, 'manager-a');
    const review = await openAction(manager, 'Simulate review decision');
    await review
      .getByRole('combobox', { name: 'Review responsibility', exact: true })
      .selectOption('pricing');
    await review.getByLabel('Evidence reference').fill('DEMO-PRICING-APPROVAL');
    await saveAction(review, 'Simulate review decision');
  } finally {
    await pricingManagerContext.close();
  }
  await sent.locator('summary').click();
  await openAction(page, 'Record quote sent');
  await saveAction(sent, 'Record quote sent');
  await expect(
    page.getByText('Qualified project to Quote sent', { exact: true }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Sales pipeline', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Stage', exact: true })
    .selectOption('quoted');
  const pipelineRow = page
    .getByRole('row')
    .filter({ hasText: 'Demo ingredient supply' })
    .filter({ hasText: companyName });
  const moreOpportunities = page.getByRole('button', {
    name: 'Load more opportunities',
    exact: true,
  });
  for (
    let scan = 0;
    scan < 40 && (await pipelineRow.count()) === 0;
    scan += 1
  ) {
    await expect(moreOpportunities).toBeEnabled();
    await moreOpportunities.click();
    await expect
      .poll(
        async () =>
          (await pipelineRow.count()) > 0 ||
          (await moreOpportunities.isEnabled()),
      )
      .toBe(true);
  }
  await expect(pipelineRow).toContainText('Quote sent');
  await expect(pipelineRow).toContainText('€12,500.00');
  await expect(pipelineRow).toContainText('2099-12-15');
  await expect(
    page
      .getByRole('region', { name: 'Pipeline totals by stage', exact: true })
      .getByRole('row', { name: /Quote sent EUR/ }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('sales-pipeline.png'),
    fullPage: true,
  });
  await pipelineRow
    .getByRole('link', { name: 'Demo ingredient supply' })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Demo ingredient supply', exact: true }),
  ).toBeVisible();

  const purchaseOrder = await openAction(page, 'Capture customer PO');
  await purchaseOrder.getByLabel('Customer PO number').fill('DEMO-PO-100');
  await purchaseOrder
    .getByLabel('PO document reference')
    .fill('DEMO-PO-DOCUMENT');
  await purchaseOrder
    .getByLabel('Product quality requirements reference')
    .fill('DEMO-QUALITY-A');
  await purchaseOrder
    .getByRole('combobox', { name: 'Order type', exact: true })
    .selectOption('blanket');
  await saveAction(purchaseOrder, 'Capture customer PO');
  await saveAction(
    await openAction(page, 'Submit order for review'),
    'Submit order for review',
  );

  const confirmation = await openAction(page, 'Simulate customer confirmation');
  await confirmation.getByLabel('Evidence reference').fill('DEMO-CONFIRMATION');
  await confirmation
    .getByRole('button', {
      name: 'Simulate customer confirmation',
      exact: true,
    })
    .click();
  await expect(confirmation.getByRole('alert')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Order review', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('sales-review-pending.png'),
    fullPage: true,
  });

  const managerContext = await browser.newContext();
  try {
    const manager = await managerContext.newPage();
    await manager.goto(projectUrl);
    await chooseEmployee(manager, 'manager-a');
    await expect(
      manager.getByRole('heading', {
        name: 'Demo ingredient supply',
        exact: true,
      }),
    ).toBeVisible();
    for (const gate of ['support', 'management', 'osbo', 'finance', 'supply']) {
      const review = await openAction(manager, 'Simulate review decision');
      await review
        .getByRole('combobox', { name: 'Review responsibility', exact: true })
        .selectOption(gate);
      await review
        .getByRole('combobox', { name: 'Decision', exact: true })
        .selectOption('approved');
      await review.getByLabel('Evidence reference').fill(`DEMO-${gate}-REVIEW`);
      await saveAction(review, 'Simulate review decision');
      await review.locator('summary').click();
    }
    await manager.screenshot({
      path: testInfo.outputPath('sales-review-approved.png'),
      fullPage: true,
    });
  } finally {
    await managerContext.close();
  }

  await confirmation.locator('summary').click();
  await openAction(page, 'Simulate customer confirmation');
  await confirmation
    .getByRole('button', {
      name: 'Simulate customer confirmation',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Won · confirmation simulated', { exact: true }),
  ).toBeVisible();
  const release = await openAction(page, 'Create blanket release');
  await release.getByLabel('Customer release reference').fill('DEMO-RELEASE-1');
  await release.getByLabel('Quantity', { exact: true }).fill('400');
  await release.getByLabel('Delivery date').fill('2099-11-01');
  await saveAction(release, 'Create blanket release');
  const handoff = await openAction(page, 'Simulate SAP handoff');
  await handoff.getByLabel('Release reference').fill('DEMO-RELEASE-1');
  await handoff
    .getByRole('combobox', { name: 'Simulated SAP outcome', exact: true })
    .selectOption('uncertain');
  await handoff.getByLabel('Evidence reference').fill('DEMO-UNCERTAIN-RECEIPT');
  await saveAction(handoff, 'Simulate SAP handoff');
  await handoff
    .getByRole('combobox', { name: 'Simulated SAP outcome', exact: true })
    .selectOption('accepted');
  await handoff
    .getByLabel('Evidence reference')
    .fill('DEMO-RECONCILED-RECEIPT');
  await saveAction(handoff, 'Simulate SAP handoff');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Demo ingredient supply', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('DEMO-RELEASE-1', { exact: true })).toBeVisible();
  await expect(page.getByText('Demo: accepted', { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('sales-confirmed-release.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('sales-mobile.png'),
    fullPage: true,
  });
});
