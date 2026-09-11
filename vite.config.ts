import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { compactThreeShaders } from './scripts/lib/compact-shader-source.mjs';

export default defineConfig(({ command }) => ({
  plugins: [react(), compactThreeShaders()],
  // Firebase Hosting and clean deep links use root-relative assets. The retained
  // Pages rollback workflow opts into a relative repository-subpath bundle.
  base:
    command === 'build' && process.env.LEGACY_GITHUB_PAGES === 'true'
      ? './'
      : '/',
  build: {
    target: 'es2020',
    // Minify for the existing browser target; keep all rendering features and
    // avoid unsafe arithmetic/property transformations.
    minify: 'terser',
    terserOptions: {
      ecma: 2020,
      safari10: false,
      compress: { passes: 4 },
    },
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep the SDK and its account adapter together for compression.
          groups: [{
            // Keep Three and its decoders in a dependency-only chunk. Otherwise
            // the shared scene and its lazy wrapper can form an evaluation cycle
            // and read MeshoptDecoder before it has initialized.
            name: 'three',
            test: /node_modules[\\/]three[\\/]/,
            includeDependenciesRecursively: false,
          }, {
            name: 'firebase',
            test: /node_modules[\\/](?:@firebase|firebase)[\\/]|src[\\/]services[\\/](?:firebase|accountService)\.ts$/,
          }],
        },
      },
    },
    // Public source maps add several megabytes to every Pages deployment and
    // expose implementation details without helping the production visitor.
    sourcemap: false,
    chunkSizeWarningLimit: 750
  }
}));
