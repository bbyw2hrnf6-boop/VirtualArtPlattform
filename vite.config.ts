import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 750,
    rolldownOptions: { output: { manualChunks: (id) => id.includes('/firebase/') || id.includes('/@firebase/') ? 'firebase' : undefined } }
  }
});
