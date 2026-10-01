const path = require('node:path');
const compilerOptionsByRoot = new Map();
const compilerByRoot = new Map();

const getCompiler = (rootDir) => {
  const cached = compilerByRoot.get(rootDir);

  if (cached) {
    return cached;
  }

  const compiler = require(require.resolve('typescript', { paths: [rootDir] }));
  compilerByRoot.set(rootDir, compiler);
  return compiler;
};

const getCompilerOptions = (rootDir) => {
  const ts = getCompiler(rootDir);
  const cached = compilerOptionsByRoot.get(rootDir);

  if (cached) {
    return cached;
  }

  const configPath =
    ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.spec.json') ??
    ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.test.json') ??
    ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json');

  if (!configPath) {
    return undefined;
  }

  const config = ts.readConfigFile(configPath, ts.sys.readFile);

  if (config.error) {
    return undefined;
  }

  const options = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
  ).options;
  compilerOptionsByRoot.set(rootDir, options);
  return options;
};

module.exports = (request, options) => {
  if (/\.(?:css|scss|sass|less)$/.test(request)) {
    return path.join(__dirname, 'jest.style-mock.cjs');
  }

  if (request === 'transliteration') {
    return options.defaultResolver(request, {
      ...options,
      conditions: ['node', 'require', 'default'],
    });
  }

  try {
    return options.defaultResolver(request, options);
  } catch (originalError) {
    const ts = getCompiler(options.rootDir);
    const compilerOptions = getCompilerOptions(options.rootDir);

    if (!compilerOptions) {
      throw originalError;
    }

    const importer = path.join(options.basedir, '__jest_resolve__.ts');
    const resolved = ts.resolveModuleName(
      request,
      importer,
      compilerOptions,
      ts.sys,
    ).resolvedModule?.resolvedFileName;

    if (!resolved) {
      throw originalError;
    }

    return options.defaultResolver(resolved, options);
  }
};
