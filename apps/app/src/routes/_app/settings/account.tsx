import { createFileRoute } from '@tanstack/react-router';
import { AccountPage } from '@/features/profile/AccountPage';

// The person's account. Who is signed in is there already: every page behind the sign-in has it.
export const Route = createFileRoute('/_app/settings/account')({ component: AccountPage });
