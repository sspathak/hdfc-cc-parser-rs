import { defineConfig } from 'vite';

export default defineConfig({
  // Set base to './' so it works on any subdirectory (like GitHub Pages)
  base: './',
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  worker: {
    format: 'es',
  },
  // Ensure wasm files are handled correctly
  optimizeDeps: {
    exclude: ['@wasm-tool/rollup-plugin-rust']
  }
});
