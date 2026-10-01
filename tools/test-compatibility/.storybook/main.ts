import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../fixtures/*.stories.tsx'],
  framework: '@storybook/react-vite',
  addons: [],
};

export default config;
