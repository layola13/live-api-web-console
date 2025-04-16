import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname),
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'proxy-client.html'),
      },
    },
  },
  server: {
    port: 3001
  },
  // Allow importing directly from src
  resolve: {
    alias: {
      '@src': resolve(__dirname, '../src')
    },
  }
});