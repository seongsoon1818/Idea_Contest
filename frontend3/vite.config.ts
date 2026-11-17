import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The API shares the page origin in production (Caddy proxies /api to the backend).
// In development, /api is proxied to VITE_API_PROXY (default: local NestJS on :3000).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    plugins: [react()],
    build: { outDir: 'dist', emptyOutDir: true },
    server: {
      proxy: { '/api': { target: env.VITE_API_PROXY || 'http://localhost:3000', changeOrigin: true } },
    },
  };
});
