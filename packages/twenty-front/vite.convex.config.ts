import babel from '@rolldown/plugin-babel';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite-plus';

export default defineConfig(() => {
  const convexUrl = process.env.REACT_APP_FENFORCE_CONVEX_URL;

  if (
    !convexUrl ||
    !['http:', 'https:'].includes(new URL(convexUrl).protocol)
  ) {
    throw new Error('REACT_APP_FENFORCE_CONVEX_URL must be an HTTP(S) URL');
  }

  return {
    root: path.resolve(import.meta.dirname, 'convex'),
    publicDir: false,
    envDir: false,
    envPrefix: [],
    define: {
      'import.meta.env.REACT_APP_FENFORCE_CONVEX_URL':
        JSON.stringify(convexUrl),
    },
    plugins: [
      react(),
      babel({
        presets: [
          {
            preset: { plugins: ['@lingui/babel-plugin-lingui-macro'] },
            rolldown: {
              filter: { code: /@lingui\/(?:core\/macro|react\/macro|macro)/ },
            },
          },
        ],
      }),
    ],
    build: {
      outDir: path.resolve(import.meta.dirname, 'build-convex'),
      emptyOutDir: true,
      manifest: true,
    },
    server: {
      host: '127.0.0.1',
      fs: { allow: [path.resolve(import.meta.dirname, '../..')] },
    },
    resolve: { dedupe: ['react', 'react-dom'] },
  };
});
