import { Page } from '@/components/Page';
import { Empty, EmptyHeader } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { PageBar } from './PageBar';
import { WentWrong } from './PageError';

/** A read of the cache, as far as waiting for it goes: what it has, what went wrong, and how it is asked again */
export interface Read {
  data: unknown;
  error: unknown;
  refetch: () => unknown;
}

/**
 * What a page inside the frame shows in its place while what it reads is on its way: its bar, and under it what
 * Waiting shows. A page is gone to at once and reads what it shows then (see lib/api.ts): this is the page until
 * the answers are there. title is what the bar at the top calls the page; reads is what the page waits for.
 * It is for a page of cards, and stands on the ground they will stand on: the ground does not change under the
 * person when the answers come.
 */
export function PageWaiting({ title, reads }: { title: string; reads: readonly Read[] }) {
  return (
    <>
      <PageBar title={title} />
      <Page>
        <Waiting reads={reads} />
      </Page>
    </>
  );
}

/**
 * What stands where something will be once it was read: a spinner; or, when a read failed, what happened and a
 * button that asks again. reads is what is waited for: whoever shows this has seen that one of them has no answer.
 */
export function Waiting({ reads }: { reads: readonly Read[] }) {
  // A read that failed with an earlier answer in hand still has that answer, and is not waited for
  const failed = reads.filter((read) => read.data === undefined && read.error !== null);
  const first = failed[0];
  if (first === undefined) {
    return (
      <Empty>
        <EmptyHeader>
          <Spinner />
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <WentWrong
      error={first.error}
      onRetry={() => {
        for (const read of failed) void read.refetch();
      }}
    />
  );
}
