import { createFileRoute, redirect } from '@tanstack/react-router';

// The settings have no page of their own: their address leads to the first of them, with the way back it carries.
export const Route = createFileRoute('/_app/settings/')({
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/settings/account', search, replace: true });
  }
});
