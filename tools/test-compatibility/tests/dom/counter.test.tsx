import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vite-plus/test';
import { Counter } from '../../fixtures/Counter';

afterEach(cleanup);

test('translated controls retain React interaction in jsdom', async () => {
  render(<Counter />);
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Count: 0' }));
  expect(screen.getByRole('button', { name: 'Count: 1' }).textContent).toBe(
    'Count: 1',
  );
});
