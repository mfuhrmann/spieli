import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    sourcemap: true,
  },
  server: {
    host: true, // bind to 0.0.0.0 so the app is reachable on the local network
  },
});
