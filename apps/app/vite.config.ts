import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // The app has one setting: the address of the api, VITE_API_URL, from apps/app/.env or the environment. Vite
  // writes it into the pages when they are built, and only variables that start with VITE_ get into a page.
  // Without it nothing is built: a page must not go out with no address to send its requests to.
  if (!loadEnv(mode, import.meta.dirname).VITE_API_URL) {
    throw new Error('Missing environment variable VITE_API_URL. See apps/app/.env.example.');
  }

  return {
    // The router's plugin comes first: it writes the list of routes, src/routeTree.gen.ts, from the files in
    // src/routes.
    // autoCodeSplitting: the code of each page is a file of its own, downloaded when the page is opened, so the
    // first page does not carry all the others.
    plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
    resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
    // A port that is taken is an error and Vite exits: it never picks another one. On another port the page would
    // not be on the api's list of web origins, and every request it sent would be refused
    server: { port: 11211, strictPort: true },
    preview: { port: 11211, strictPort: true }
  };
});
