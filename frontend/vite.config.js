import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build output goes into the Flask static folder so the Python server can serve
// the SPA directly. During `npm run dev`, /api is proxied to the Flask server.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../server/static',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
