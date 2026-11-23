import { Add01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ALONE_LINK, AloneFoot, AloneHeading } from '@/components/Alone';
import { PageHead } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { signOut } from '@/features/auth/signOut';
import { authText } from '@/features/auth/text';
import { UserButton } from '@/features/shell/UserMenu';
import { UploadPanel } from '@/features/upload/UploadPanel';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { NewSpaceDialog } from './NewSpaceDialog';
import { SpaceMark } from './SpaceMark';
import { SpaceNameField } from './SpaceNameField';
import { type Space, useSpaces } from './spaces';
import { spaceText } from './text';
import { useNewSpace } from './useNewSpace';

// The start: the spaces the person is in, a card each. A space is gone into by opening its card, and left by
// coming back here: there is no other switch. Signing in leads here, whichever space the person was in last.
// The page is outside the frame of a space: it has no sidebar, and who is signed in is in its corner.
// Someone who is in no space is asked to make one, here: the server makes none for them.

export function SpacesPage() {
  const spaces = useSpaces();
  const [creating, setCreating] = useState(false);

  return (
    // As high as the window, and the page scrolls inside: the uploads in hand stay in the corner
    <div className="relative flex h-svh flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between pr-4 pl-6">
        <span className="text-sm font-semibold tracking-tight">Pocketmice</span>
        <UserButton />
      </header>

      {spaces.length === 0 ? (
        <FirstSpace />
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-6 pb-16">
            <PageHead title={spaceText.spacesTitle} hint={spaceText.whatASpaceIs}>
              <Button onClick={() => setCreating(true)}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                {spaceText.newSpace}
              </Button>
            </PageHead>
            <ul aria-label={spaceText.spacesLabel} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {spaces.map((space) => (
                <li key={space.id}>
                  <SpaceCard space={space} />
                </li>
              ))}
            </ul>
          </div>
        </main>
      )}

      <NewSpaceDialog open={creating} onOpenChange={setCreating} />
      <UploadPanel />
    </div>
  );
}

/** The card of one space: what it is called and what the person is in it. All of it is the link into the space */
function SpaceCard({ space }: { space: Space }) {
  return (
    <Link
      to="/spaces/$spaceId"
      params={{ spaceId: space.id }}
      className="group/space block rounded-[min(var(--radius-4xl),24px)] outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <Card className="gap-7 transition-colors group-hover/space:bg-muted/60">
        <CardHeader>
          <SpaceMark name={space.name} large />
          <CardAction className="text-muted-foreground opacity-0 transition-opacity group-hover/space:opacity-100 group-focus-visible/space:opacity-100">
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <CardTitle className="truncate">{space.name}</CardTitle>
          <CardDescription>{spaceText.roles[space.role]}</CardDescription>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * What the start shows to someone who is in no space: the form that makes their first one. Under it is the address
 * they signed in with, and the way out: someone who has spaces and sees none has signed in with another address.
 */
function FirstSpace() {
  const user = useCurrentUser();
  const form = useNewSpace();
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 pt-4 pb-32">
      <div className="w-full max-w-80">
        <AloneHeading title={spaceText.firstTitle}>{spaceText.firstDescription}</AloneHeading>
        <form onSubmit={form.submit} noValidate className="mt-8 flex flex-col gap-6">
          <SpaceNameField id="first-space-name" name={form.name} problem={form.problem} onChange={form.setName} />
          <Button type="submit" disabled={form.busy} className="w-full">
            {form.busy && <Spinner data-icon="inline-start" />}
            {spaceText.create}
          </Button>
        </form>
        <AloneFoot>
          <span>{authText.signedInAs(user.email)}</span>
          <button type="button" className={ALONE_LINK} onClick={signOut}>
            {authText.signOut}
          </button>
        </AloneFoot>
      </div>
    </main>
  );
}
