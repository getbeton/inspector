import { defineConfig } from 'tsup'
import type { Plugin } from 'esbuild'

/**
 * Esbuild plugin to stub out react-devtools-core (optional dep of ink)
 */
const stubDevtoolsPlugin: Plugin = {
  name: 'stub-react-devtools',
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-core',
      namespace: 'stub-devtools',
    }))
    build.onLoad({ filter: /.*/, namespace: 'stub-devtools' }, () => ({
      contents: 'export default undefined;',
      loader: 'js',
    }))
  },
}

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist/cli',
  splitting: false,
  clean: true,
  dts: false,
  sourcemap: false,
  // Don't bundle heavy/complex dependencies - let Node resolve them
  // This avoids CJS-in-ESM compatibility issues with Node builtins
  banner: {
    js: '#!/usr/bin/env node',
  },
  platform: 'node',
  esbuildPlugins: [stubDevtoolsPlugin],
  // Ensure JSX is handled
  esbuildOptions(options) {
    options.jsx = 'automatic'
  },
})
