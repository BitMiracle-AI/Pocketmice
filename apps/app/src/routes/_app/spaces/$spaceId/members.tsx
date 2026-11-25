import { createFileRoute, type ErrorComponentProps } from '@tanstack/react-router';
import { PageError } from '@/features/shell/PageError';
import { shellText } from '@/features/shell/text';
import { MembersPage } from '@/features/space/MembersPage';

// Who is in the space, and for its owner the invite links to it.
export const Route = createFileRoute('/_app/spaces/$spaceId/members')({
  component: MembersPage,
  errorComponent: (props: ErrorComponentProps) => <PageError {...props} title={shellText.members} />
});
