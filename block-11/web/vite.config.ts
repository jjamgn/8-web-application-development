import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  server: {
    // Playwright rewrites these files during live runs; watching them can reload the app
    // or crash Windows fs.watch with EBUSY while the report is being replaced.
    watch: { ignored: ['**/playwright-report/**', '**/test-results/**'] },
    fs: { allow: [
      fileURLToPath(new URL('.', import.meta.url)),
      fileURLToPath(new URL('../contracts', import.meta.url)),
    ] },
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false },
      '/media': { target: 'http://127.0.0.1:3000', changeOrigin: false },
    },
  },
});
