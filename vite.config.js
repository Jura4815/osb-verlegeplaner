import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In Production (GitHub Pages) liegt die App unter /osb-verlegeplaner/
// damit die Asset-Pfade korrekt aufgelöst werden.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/osb-verlegeplaner/' : '/',
  server: {
    port: 5173,
    strictPort: false,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
}));
