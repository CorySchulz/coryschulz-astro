// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import { fileURLToPath } from 'url';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@magic-spells/tarot': fileURLToPath(new URL('./src/scripts/tarot.esm.js', import.meta.url))
      }
    }
  },
  build: {
    format: 'file'
  },
});
