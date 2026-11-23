import { createFileRoute } from '@tanstack/react-router';
import { SignedInPage } from '@/features/auth/SignedInPage';

export const Route = createFileRoute('/_app/')({ component: SignedInPage });
