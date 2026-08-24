import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Firebase Hosting and clean deep links use root-relative assets. The retained
  // Pages rollback workflow opts into a relative repository-subpath bundle.
  base:
    command === 'build' && process.env.LEGACY_GITHUB_PAGES === 'true'
      ? './'
      : '/',
  build: {
    target: 'es2020',
    // Public source maps add several megabytes to every Pages deployment and
    // expose implementation details without helping the production visitor.
    sourcemap: false,
    chunkSizeWarningLimit: 750
  }
}));
