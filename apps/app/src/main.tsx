import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NotFound } from '@/components/NotFound';
import { RouteError } from '@/components/RouteError';
import { queryClient } from '@/lib/api';
import { language } from '@/lib/language/language';
import { languageTag } from '@/lib/language/languages';
import { followTheme } from '@/lib/theme';
import { routeTree } from './routeTree.gen';
import './index.css';

// The browser is told which language the page is in: which typeface Chinese is drawn in and how a screen reader
// reads the page both go by it. index.html says English
document.documentElement.lang = languageTag(language);

// Dark or light: index.html has seen to how the page opens. From here on it follows the system and what the
// person chooses
followTheme();

// A page that fails to load, whichever it is, shows the same screen with a button to try again; an address with no
// page at it shows the same screen too
const router = createRouter({ routeTree, defaultErrorComponent: RouteError, defaultNotFoundComponent: NotFound });

// Tells the types of the router which pages there are: a link to an address that does not exist fails the type check
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no element with id "root".');

createRoot(root).render(
  <StrictMode>
    {/* What was read from the api is in this one cache: the pages and the loaders of the routes share it */}
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
