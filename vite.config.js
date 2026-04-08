import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  build: { outDir: '../dist' },
  server: {
    proxy: { '/api': 'http://localhost:3000' },
    allowedHosts: true
  }
});
