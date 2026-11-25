import { createFileRoute, type ErrorComponentProps } from '@tanstack/react-router';
import { TrashPage } from '@/features/file/TrashPage';
import { PageError } from '@/features/shell/PageError';
import { shellText } from '@/features/shell/text';

// The trash of the space: what was deleted from it.
export const Route = createFileRoute('/_app/spaces/$spaceId/trash')({
  component: TrashPage,
  errorComponent: (props: ErrorComponentProps) => <PageError {...props} title={shellText.trash} />
});
