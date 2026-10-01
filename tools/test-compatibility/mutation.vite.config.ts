import config from './vite.config';

export default {
  ...config,
  test: {
    ...config.test,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/node/runner.test.ts'],
        },
      },
    ],
  },
};
