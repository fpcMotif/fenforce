import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Counter } from './Counter';

const meta = {
  title: 'Compatibility/Counter',
  component: Counter,
} satisfies Meta<typeof Counter>;
export default meta;

export const Interactive: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Count: 0' }));
    await expect(canvas.getByRole('button', { name: 'Count: 1' })).toHaveStyle({
      color: 'rgb(12, 34, 56)',
    });
  },
};
