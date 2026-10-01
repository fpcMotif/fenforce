module.exports = [
  'babel-jest',
  {
    babelrc: false,
    configFile: false,
    presets: [['@babel/preset-typescript', { allExtensions: true }]],
    plugins: [
      '@lingui/babel-plugin-lingui-macro',
      'babel-plugin-transform-typescript-metadata',
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      ['@babel/plugin-transform-class-properties', { loose: true }],
      '@babel/plugin-transform-modules-commonjs',
    ],
  },
];
