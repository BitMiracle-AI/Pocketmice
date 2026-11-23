import { Alert02Icon, Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { SEARCH_QUERY_MAX_LENGTH } from '@pocketmice/contract/domains/file';
import { roleCovers } from '@pocketmice/contract/spaceRole';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Page, PageHead } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { MainBar } from '@/features/shell/MainBar';
import { shellText } from '@/features/shell/text';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { thrownText } from '@/lib/api';
import { commonText } from '@/lib/text';
import { FileDialogs, useFileActions } from './FileDialogs';
import { FileRow } from './FileRow';
import { placeOf } from './fileOrder';
import { COLUMNS, HEAD, MEDIUM, SIZE, WIDE } from './listLayout';
import { matchesQuery } from './search';
import { fileText } from './text';

// Looking for a file or a folder of the space by words. What is looked for is in the address (?q=…), and nowhere
// else: the page shows what the address says, so coming back from a file that was found shows what was found.
// The field writes what is typed into the address once the typing has paused, or at once on Enter, without a new
// step in the history for every letter. While an input method is putting a word together (pinyin on its way to
// 预算), what the field holds is not yet what the person is looking for, and nothing is written.

/** How long the typing has to pause before what was typed is looked for, in milliseconds */
const PAUSE_MS = 250;

/** words is what the address says is looked for; empty when it says nothing */
export function SearchPage({ words }: { words: string }) {
  const space = useCurrentSpace();
  const navigate = useNavigate();
  const [typed, setTyped] = useState(words);
  const [composing, setComposing] = useState(false);
  // What this field last wrote into the address: an address that says something else was changed by a step back
  // or forward, and the field follows it
  const written = useRef(words);
  const field = useRef<HTMLInputElement>(null);
  const actions = useFileActions(space.id);

  const write = useCallback(
    (next: string) => {
      if (next === written.current) return;
      written.current = next;
      void navigate({
        to: '/spaces/$spaceId/search',
        params: { spaceId: space.id },
        search: { q: next === '' ? undefined : next },
        replace: true
      });
    },
    [navigate, space.id]
  );

  useEffect(() => {
    if (words === written.current) return;
    written.current = words;
    setTyped(words);
  }, [words]);

  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => write(typed.trim()), PAUSE_MS);
    return () => clearTimeout(timer);
  }, [typed, composing, write]);

  const found = useInfiniteQuery({
    ...matchesQuery(space.id, words),
    enabled: words !== '',
    // While other words are being looked for, what the words before found stays, dimmed
    placeholderData: keepPreviousData
  });
  const files = words === '' ? null : (found.data?.pages.flatMap((page) => page.files) ?? null);
  const looking =
    (!composing && typed.trim() !== words) || (words !== '' && found.isFetching && !found.isFetchingNextPage);
  const canEdit = roleCovers(space.role, 'editor');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!composing) write(typed.trim());
  };

  return (
    <>
      <MainBar trail={[]} title={shellText.search} />

      <Page wide>
        <PageHead title={shellText.search} />

        <search className="max-w-xl">
          <form onSubmit={submit}>
            <InputGroup>
              <InputGroupAddon>
                <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
              </InputGroupAddon>
              <InputGroupInput
                ref={field}
                autoFocus
                autoComplete="off"
                enterKeyHint="search"
                aria-label={fileText.searchLabel}
                placeholder={fileText.searchPlaceholder}
                maxLength={SEARCH_QUERY_MAX_LENGTH}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
              />
              <InputGroupAddon align="inline-end">
                {looking ? (
                  <Spinner />
                ) : (
                  typed !== '' && (
                    <InputGroupButton
                      size="icon-xs"
                      aria-label={fileText.searchClear}
                      title={fileText.searchClear}
                      onClick={() => {
                        setTyped('');
                        field.current?.focus();
                      }}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                    </InputGroupButton>
                  )
                )}
              </InputGroupAddon>
            </InputGroup>
          </form>
        </search>

        {words === '' ? (
          <Empty className="pb-24">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{fileText.searchStartTitle}</EmptyTitle>
              <EmptyDescription>{fileText.searchStartHint}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : files === null && found.isError ? (
          <Empty className="pb-24">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{commonText.somethingWentWrong}</EmptyTitle>
              <EmptyDescription role="alert">{thrownText(found.error)}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => found.refetch()}>
                {commonText.tryAgain}
              </Button>
            </EmptyContent>
          </Empty>
        ) : files === null || (files.length === 0 && found.isPlaceholderData) ? (
          // Nothing to show yet: the field says that it is being looked for
          <div className="flex-1" />
        ) : files.length === 0 ? (
          <Empty className="pb-24">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle className="break-words">{fileText.searchNothingTitle(words)}</EmptyTitle>
              <EmptyDescription>{fileText.searchNothingHint}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className={cn('@container -mx-3 transition-opacity', found.isPlaceholderData && 'opacity-50')}>
            <div className={cn(COLUMNS, HEAD)}>
              <span>{fileText.name}</span>
              <span className={WIDE}>{fileText.searchIn}</span>
              <span className={MEDIUM}>{fileText.modified}</span>
              <span className={SIZE}>{fileText.size}</span>
              <span />
            </div>
            <ul aria-label={fileText.searchFound} className="pt-1.5">
              {files.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  spaceId={space.id}
                  wide={<span className="truncate">{placeOf(file.path) ?? space.name}</span>}
                  onPick={canEdit ? (what) => actions.pick(file, what) : undefined}
                />
              ))}
            </ul>
            {found.hasNextPage && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" disabled={found.isFetchingNextPage} onClick={() => found.fetchNextPage()}>
                  {found.isFetchingNextPage && <Spinner data-icon="inline-start" />}
                  {fileText.showMore}
                </Button>
              </div>
            )}
          </div>
        )}
      </Page>

      <FileDialogs {...actions.dialogs} />
    </>
  );
}
