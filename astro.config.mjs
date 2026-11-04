import { defineConfig } from 'astro/config';

export default defineConfig({
  build: { inlineStylesheets: 'auto' },
  vite: { build: { chunkSizeWarningLimit: 900 } },
});
