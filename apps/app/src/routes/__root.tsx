import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';

// What every page is inside of: it shows the page of the address, and the short messages that come up over any
// page (a toast). Tooltips share one timing: once one has shown, the next shows without a wait.
export const Route = createRootRoute({
  component: () => (
    <TooltipProvider>
      <Outlet />
      <Toaster />
    </TooltipProvider>
  )
});
