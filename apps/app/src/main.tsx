import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NotFound } from '@/components/NotFound';
import { RouteError } from '@/components/RouteError';
import { queryClient } from '@/lib/api';
import { language } from '@/lib/language/language';
import { languageTag } from '@/lib/language/languages';
import { routeTree } from './routeTree.gen';
import './index.css';

// The browser is told which language the page is in: which typeface Chinese is drawn in and how a screen reader
// reads the page both go by it. index.html says English
document.documentElement.lang = languageTag(language);

// A page that fails to load, whichever it is, shows the same screen with a button to try again; an address with no
// page at it shows the same screen too
const router = createRouter({ routeTree, defaultErrorComponent: RouteError, defaultNotFoundComponent: NotFound });

// The code of each page is a file of its own (autoCodeSplitting in vite.config.ts), and the router asks for it only
// once the routes above the page have let the person in: routes/_app.tsx asks the api who is signed in, and the
// download begins when that answer is there, one after the other. On a line that is slow, that is a wait after a
// wait before a page that is opened for the first time.
// Here the two begin together: at the start of every move to an address, the code of every page on the way to it
// is asked for, whatever the routes above will say. When they send the person elsewhere (not signed in: to the
// sign-in page), what was downloaded is there for later. A download that fails says nothing here: the router asks
// again in its turn, and what fails then is its to report.
router.subscribe('onBeforeLoad', ({ toLocation }) => {
  const [routes] = router.getMatchedRoutes(toLocation.pathname);
  for (const route of routes) void router.loadRouteChunk(route)?.catch(() => undefined);
});

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
    {/* What was read from the api is in this one cache: the pages and the routes that let them in share it */}
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
