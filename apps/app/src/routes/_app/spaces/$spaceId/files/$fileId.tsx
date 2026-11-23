import { createFileRoute } from '@tanstack/react-router';
import { FileGonePage } from '@/features/file/FileGonePage';
import { FileOrFolderPage } from '@/features/file/FileOrFolderPage';
import { loadFile } from '@/features/file/loadFile';
import { PageError } from '@/features/shell/PageError';

// A folder of the space, or a file of it: what is in the folder, or what the file is and has been.
export const Route = createFileRoute('/_app/spaces/$spaceId/files/$fileId')({
  loader: ({ params }) => loadFile(params.spaceId, params.fileId),
  component: FileOrFolder,
  notFoundComponent: FileGonePage,
  errorComponent: PageError
});

function FileOrFolder() {
  const { fileId } = Route.useParams();
  return <FileOrFolderPage fileId={fileId} />;
}
