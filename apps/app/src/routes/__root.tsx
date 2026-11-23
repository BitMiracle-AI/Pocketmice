import { createRootRoute, Outlet } from '@tanstack/react-router';

// What every page is inside of: it shows the page of the address.
export const Route = createRootRoute({ component: Outlet });
