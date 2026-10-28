import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.KEEPS_API_URL || 'http://127.0.0.1:8000', changeOrigin: false },
      '/media': { target: process.env.KEEPS_API_URL || 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
  },
});
