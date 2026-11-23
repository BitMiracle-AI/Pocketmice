import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { SEARCH_QUERY_MAX_LENGTH } from '@pocketmice/contract/domains/file';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { useGoToFiles } from './FilesLink';
import { useMatches } from './search';
import { fileText } from './text';

// The field files are looked for in, in the bar of the files. What is looked for is in the address (?q=…), and
// nowhere else: the page shows what the address says, so a step back shows what was found before.
// The field writes what is typed into the address once the typing has paused, or at once on Enter, without a new
// step in the history for every letter. While an input method is putting a word together (pinyin on its way to
// 预算), what the field holds is not yet what the person is looking for, and nothing is written.

/** How long the typing has to pause before what was typed is looked for, in milliseconds */
const PAUSE_MS = 250;

/**
 * The field. words is what the address says is looked for, empty when it says nothing; pickedId is what the
 * address says is picked, which stays picked while the words change.
 */
export function FileSearchField({
  pickedId,
  words,
  className
}: {
  pickedId: string | null;
  words: string;
  className?: string;
}) {
  const space = useCurrentSpace();
  const goTo = useGoToFiles(space.id);
  const [typed, setTyped] = useState(words);
  const [composing, setComposing] = useState(false);
  // What this field last wrote into the address: an address that says something else was changed from elsewhere
  // (a step back or forward, a link to a folder), and the field follows it
  const written = useRef(words);
  const field = useRef<HTMLInputElement>(null);
  const found = useMatches(space.id, words);

  const write = useCallback(
    (next: string) => {
      if (next === written.current) return;
      written.current = next;
      void goTo(pickedId, next, true);
    },
    [goTo, pickedId]
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

  const looking =
    (!composing && typed.trim() !== words) || (words !== '' && found.isFetching && !found.isFetchingNextPage);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!composing) write(typed.trim());
  };

  return (
    <search className={className}>
      <form onSubmit={submit}>
        <InputGroup>
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </InputGroupAddon>
          <InputGroupInput
            ref={field}
            autoComplete="off"
            enterKeyHint="search"
            aria-label={fileText.searchLabel}
            placeholder={fileText.searchLabel}
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
  );
}
