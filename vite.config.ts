import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs work both at horgsz.github.io/GIITB/ and at a future
  // custom domain without needing separate builds.
  base: './',
  server: {
    port: 5173,
    open: true
  },
  build: {
    target: 'es2022'
  }
});
