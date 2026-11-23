import { createFileRoute, type ErrorComponentProps } from '@tanstack/react-router';
import { TrashPage } from '@/features/file/TrashPage';
import { trashQuery } from '@/features/file/trash';
import { PageError } from '@/features/shell/PageError';
import { shellText } from '@/features/shell/text';
import { queryClient } from '@/lib/api';

// The trash of the space: what was deleted from it.
export const Route = createFileRoute('/_app/spaces/$spaceId/trash')({
  loader: ({ params }) => queryClient.ensureInfiniteQueryData(trashQuery(params.spaceId)),
  component: TrashPage,
  errorComponent: (props: ErrorComponentProps) => <PageError {...props} title={shellText.trash} />
});
