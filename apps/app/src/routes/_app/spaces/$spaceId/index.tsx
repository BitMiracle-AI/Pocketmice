import { createFileRoute } from '@tanstack/react-router';
import { Page, PageHead } from '@/components/Page';
import { MainBar } from '@/features/shell/MainBar';
import { shellText } from '@/features/shell/text';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';

// What is directly in the space. Until the files are listed, the page says which space this is.
export const Route = createFileRoute('/_app/spaces/$spaceId/')({ component: SpaceStart });

function SpaceStart() {
  const space = useCurrentSpace();
  return (
    <>
      <MainBar trail={[]} title={shellText.files} />
      <Page wide>
        <PageHead title={space.name} />
      </Page>
    </>
  );
}
