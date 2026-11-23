import { createFileRoute } from '@tanstack/react-router';
import { SpaceFilesPage } from '@/features/file/FolderPage';
import { folderQuery } from '@/features/file/files';
import { PageError } from '@/features/shell/PageError';
import { queryClient } from '@/lib/api';

// What is directly in the space.
export const Route = createFileRoute('/_app/spaces/$spaceId/')({
  loader: ({ params }) => queryClient.ensureQueryData(folderQuery(params.spaceId, null)),
  component: SpaceFilesPage,
  errorComponent: PageError
});
