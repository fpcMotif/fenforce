module.exports = {
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  resolver: '<rootDir>/../../jest.resolver.cjs',
  moduleFileExtensions: ['ts', 'js', 'mjs', 'html'],
  coverageReporters: ['html'],
  transform: {
    '^.+\\.(ts|js)$': [
      '@swc/jest',
      { jsc: { parser: { syntax: 'typescript' } } },
    ],
  },
  testEnvironment: 'jsdom',
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/out-tsc/'],
  testEnvironmentOptions: {},
};
