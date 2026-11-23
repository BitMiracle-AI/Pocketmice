import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  // A port that is taken is an error and Vite exits: it never picks another one. On another port the page would not
  // be on the api's list of web origins, and every request it sent would be refused
  server: { port: 11211, strictPort: true },
  preview: { port: 11211, strictPort: true }
});
