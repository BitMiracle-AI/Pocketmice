import { createFileRoute } from '@tanstack/react-router';
import { authSearch, leaveIfSignedIn } from '@/features/auth/enterAuthPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { serverInfoQuery } from '@/features/auth/serverInfo';
import { queryClient } from '@/lib/api';

export const Route = createFileRoute('/login')({
  validateSearch: authSearch,
  beforeLoad: ({ search }) => leaveIfSignedIn(search),
  // How this server signs people in decides which form the page shows
  loader: () => queryClient.ensureQueryData(serverInfoQuery),
  component: LoginPage
});
