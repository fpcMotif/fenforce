import { cleanup, render } from '@testing-library/react';
import { page } from 'vite-plus/test/browser/context';
import { afterEach, expect, test } from 'vite-plus/test';
import { Counter } from '../../fixtures/Counter';

afterEach(cleanup);

test('Chromium renders extracted CSS and translated interactive content', async () => {
  render(<Counter />);
  const button = page.getByRole('button', { name: 'Count: 0' });
  await button.click();
  await expect
    .element(page.getByRole('button', { name: 'Count: 1' }))
    .toHaveStyle({ color: 'rgb(12, 34, 56)' });
  await page.screenshot({ path: '../../artifacts/browser-counter.png' });
});
