import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({ rollupTypes: true })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'GoogleGenAILive',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format) => {
        switch (format) {
          case 'es':
            return 'index.esm.js';
          case 'cjs':
            return 'index.cjs.js';
          case 'umd':
            return 'index.umd.js';
          default:
            return 'index.js';
        }
      }
    },
    rollupOptions: {
      external: [
        '@google/genai',
        'eventemitter3',
        'lodash'
      ],
      output: {
        globals: {
          '@google/genai': 'GoogleGenerativeAI',
          'eventemitter3': 'EventEmitter',
          'lodash': '_'
        }
      }
    },
    sourcemap: true,
    minify: 'terser'
  }
});