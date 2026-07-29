import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Root-relative URLs keep imported fonts/assets valid in the dev server, while
  // the relative production base keeps the bundle portable on GitHub Pages.
  base: command === 'build' ? './' : '/',
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 750,
    rolldownOptions: { output: { manualChunks: (id) => id.includes('/firebase/') || id.includes('/@firebase/') ? 'firebase' : undefined } }
  }
}));
