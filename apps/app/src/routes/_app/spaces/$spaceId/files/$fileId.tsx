import { createFileRoute } from '@tanstack/react-router';
import { FolderGonePage } from '@/features/file/FolderGonePage';
import { FolderPage } from '@/features/file/FolderPage';
import { loadFolder } from '@/features/file/loadFolder';
import { PageError } from '@/features/shell/PageError';

// A folder of the space: what is in it.
export const Route = createFileRoute('/_app/spaces/$spaceId/files/$fileId')({
  loader: ({ params }) => loadFolder(params.spaceId, params.fileId),
  component: Folder,
  notFoundComponent: FolderGonePage,
  errorComponent: PageError
});

function Folder() {
  const { fileId } = Route.useParams();
  return <FolderPage folderId={fileId} />;
}
