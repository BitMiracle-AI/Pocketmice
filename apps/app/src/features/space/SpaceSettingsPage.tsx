import { SPACE_NAME_MAX_LENGTH } from '@pocketmice/contract/domains/space';
import { useSuspenseQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Page, PageHead } from '@/components/Page';
import { SavedField } from '@/components/SavedField';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { MainBar } from '@/features/shell/MainBar';
import { commonText } from '@/lib/text';
import { useCurrentSpace } from './CurrentSpaceProvider';
import { StorageLimitField } from './StorageLimitField';
import {
  removeSpace,
  renameSpace,
  type Space,
  setSpaceLimit,
  spaceHolds,
  spaceSizeQuery,
  useNoLongerIn
} from './spaces';
import { isLimit, limitOf, typedOf } from './storageLimit';
import { spaceText } from './text';

// The settings of a space: what it is called, how much it may hold, and the end of it. All of it is the owner's
// alone, so the sidebar shows the way here to the owner only; anyone else who writes the address is told whose it
// is. How much each member may hold is set where the members are (MembersPage).
// Deleting a space is the one thing in the app that takes everything with it, and nothing brings it back: the
// owner types the name of the space before the button works.

export function SpaceSettingsPage() {
  const space = useCurrentSpace();
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const rename = async (name: string) => {
    const problem = await renameSpace(space.id, name);
    if (problem === null) toast.add({ title: spaceText.renamed });
    return problem;
  };

  if (space.role !== 'owner') {
    return (
      <>
        <MainBar trail={[]} title={spaceText.settingsTitle} />
        <Page>
          <PageHead title={spaceText.settingsTitle} hint={spaceText.settingsOwnerOnly} />
        </Page>
      </>
    );
  }
  return (
    <>
      <MainBar trail={[]} title={spaceText.settingsTitle} />

      <Page>
        <PageHead title={spaceText.settingsTitle} hint={spaceText.settingsHint} />

        <div className="flex max-w-md flex-col gap-7">
          <SavedField
            id="space-name"
            label={spaceText.nameLabel}
            hint={spaceText.renameHint}
            value={space.name}
            maxLength={SPACE_NAME_MAX_LENGTH}
            save={rename}
          />
          <SpaceStorage spaceId={space.id} />
        </div>

        <section
          aria-labelledby="delete-space-title"
          className="mt-4 flex flex-col gap-3 rounded-2xl border border-destructive/30 p-4 sm:flex-row sm:items-center sm:gap-4"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="delete-space-title" className="font-heading text-sm font-medium">
              {spaceText.deleteSpaceTitle}
            </h2>
            <p className="text-sm text-pretty text-muted-foreground">{spaceText.deleteSpaceHint}</p>
          </div>
          <Button variant="destructive" onClick={() => setAsking(true)} className="shrink-0 self-start sm:self-center">
            {spaceText.deleteSpace}
          </Button>
        </section>
      </Page>

      <AlertDialog open={asking} onOpenChange={(open) => !deleting && setAsking(open)}>
        {/* What is typed is kept inside the dialog: closed, it is gone */}
        <AlertDialogContent>
          <DeleteSpaceForm space={space} busy={deleting} onBusy={setDeleting} />
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * How much the space holds, with a bar that says how much of its limit that is when it has one, and the field the
 * limit is set in. The field is saved by itself, as the name over it is: the button is off while what is typed is
 * the limit that is there.
 */
function SpaceStorage({ spaceId }: { spaceId: string }) {
  const size = useSuspenseQuery(spaceSizeQuery(spaceId)).data;
  const [typed, setTyped] = useState(() => typedOf(size.storageLimit));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unchanged = isLimit(typed, size.storageLimit);
  // Nothing more goes in: the space holds as much as it may, or more, when the limit was set under what it holds
  const noRoom = size.storageLimit !== null && size.storageSize >= size.storageLimit;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || unchanged) return;
    const limit = limitOf(typed);
    if (limit === 'invalid') return setProblem(spaceText.limitInvalid);
    setBusy(true);
    const failed = await setSpaceLimit(spaceId, limit);
    setBusy(false);
    if (failed !== null) return setProblem(failed);
    toast.add({ title: spaceText.limitSaved });
  };

  return (
    <section aria-labelledby="space-storage-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h2 id="space-storage-title" className="font-heading text-sm font-medium">
          {spaceText.storageTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{spaceHolds(size)}</p>
        {size.storageLimit !== null && (
          // The sentence over it says the same in words, so the bar is for the eye alone
          <Progress
            aria-hidden="true"
            value={noRoom ? 100 : (size.storageSize / size.storageLimit) * 100}
            className={noRoom ? '[&_[data-slot=progress-indicator]]:bg-destructive' : undefined}
          />
        )}
      </div>
      <form onSubmit={submit} noValidate>
        <StorageLimitField
          id="space-limit"
          hint={spaceText.spaceLimitHint}
          problem={problem}
          typed={typed}
          onTyped={(next) => {
            setTyped(next);
            setProblem(null);
          }}
        >
          <Button type="submit" disabled={busy || unchanged} className="shrink-0">
            {busy && <Spinner data-icon="inline-start" />}
            {commonText.save}
          </Button>
        </StorageLimitField>
      </form>
    </section>
  );
}

/** What the dialog holds. busy says the api is being asked: the page keeps it, to keep the dialog open meanwhile */
function DeleteSpaceForm({ space, busy, onBusy }: { space: Space; busy: boolean; onBusy: (busy: boolean) => void }) {
  const noLongerIn = useNoLongerIn();
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const matches = typed.trim() === space.name;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !matches) return;
    onBusy(true);
    const failed = await removeSpace(space.id);
    if (failed !== null) {
      onBusy(false);
      return setProblem(failed);
    }
    await noLongerIn(space.id);
    toast.add({ title: spaceText.deletedSpace(space.name) });
  };

  return (
    <form onSubmit={submit} noValidate className="contents">
      <AlertDialogHeader>
        <AlertDialogTitle className="break-words">{spaceText.deleteSpaceAsk(space.name)}</AlertDialogTitle>
        <AlertDialogDescription>{spaceText.deleteSpaceHint}</AlertDialogDescription>
      </AlertDialogHeader>
      <Field data-invalid={problem !== null || undefined}>
        <FieldLabel htmlFor="delete-space-name">{spaceText.deleteSpaceTypeLabel}</FieldLabel>
        <Input
          id="delete-space-name"
          autoFocus
          autoComplete="off"
          value={typed}
          placeholder={space.name}
          onChange={(event) => {
            setTyped(event.target.value);
            setProblem(null);
          }}
        />
        {problem !== null && <FieldError>{problem}</FieldError>}
      </Field>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>{spaceText.cancel}</AlertDialogCancel>
        <Button type="submit" variant="destructive" disabled={busy || !matches}>
          {busy && <Spinner data-icon="inline-start" />}
          {spaceText.deleteSpace}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
