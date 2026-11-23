import { getServerInfo } from '@pocketmice/contract/domains/server';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Alone, AloneHeading } from '@/components/Alone';
import { queryClient, readQuery } from '@/lib/api';
import { commonText } from '@/lib/text';

const serverInfo = readQuery(getServerInfo, {});

// The first page there is, until people can sign in: it asks the api which server it is, and says so. When the
// api cannot be asked, it is the page that failed to load.
export const Route = createFileRoute('/')({
  loader: () => queryClient.ensureQueryData(serverInfo),
  component: StartPage
});

function StartPage() {
  const { data } = useSuspenseQuery(serverInfo);
  return (
    <Alone>
      <AloneHeading title="Pocketmice">{commonText.serverReached(data.version)}</AloneHeading>
    </Alone>
  );
}
