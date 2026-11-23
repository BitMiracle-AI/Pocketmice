import { createFileRoute, redirect } from '@tanstack/react-router';
import { authSearch, leaveIfSignedIn } from '@/features/auth/enterAuthPage';
import { SignUpPage } from '@/features/auth/SignUpPage';
import { serverInfoQuery } from '@/features/auth/serverInfo';
import { queryClient } from '@/lib/api';

export const Route = createFileRoute('/signup')({
  validateSearch: authSearch,
  beforeLoad: async ({ search }) => {
    await leaveIfSignedIn(search);
    // A server that signs people in with a code has no page to sign up on: signing in there is signing up
    const { signInMethod } = await queryClient.ensureQueryData(serverInfoQuery);
    if (signInMethod !== 'password') throw redirect({ to: '/login', search });
  },
  component: SignUpPage
});
