import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Toaster } from '@/components/ui/toast';

// What every page is inside of: it shows the page of the address, and the short messages that come up over any
// page (a toast).
export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  )
});
