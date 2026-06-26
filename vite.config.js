import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'client',
  build: { outDir: '../dist' },
  plugins: [tailwindcss()],
  server: {
    proxy: { '/api': 'http://localhost:5000' },
    allowedHosts: true
  }
});
