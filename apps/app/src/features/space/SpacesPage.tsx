import { Add01Icon, ArrowRight02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { CardPage } from '@/components/CardPage';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { SignedInAs } from '@/features/auth/SignedInAs';
import { SignOutDialog } from '@/features/auth/SignOutDialog';
import { authText } from '@/features/auth/text';
import { TopBar } from '@/features/shell/TopBar';
import { NewSpaceDialog } from './NewSpaceDialog';
import { SpaceMark } from './SpaceMark';
import { SpaceNameField } from './SpaceNameField';
import { type Space, useSpaces } from './spaces';
import { spaceText } from './text';
import { useNewSpace } from './useNewSpace';

// The start: the spaces the person is in, a card each. A space is gone into by opening its card, and left by
// coming back here: there is no other switch. Signing in leads here, whichever space the person was in last.
// The page is outside the frame of a space: it has no sidebar, and who is signed in is in the corner of its bar.
// It is on the blue of the frame itself, and the spaces are white cards on it.
// Someone who is in no space is asked to make one, here: the server makes none for them.

export function SpacesPage() {
  const spaces = useSpaces();
  const [creating, setCreating] = useState(false);

  if (spaces.length === 0) return <FirstSpace />;
  return (
    <div className="on-frame flex min-h-svh flex-col">
      <TopBar />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-4 md:p-6 md:pt-10">
        <div className="flex items-end gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h1 className="text-3xl font-bold md:text-4xl">{spaceText.spacesTitle}</h1>
            <p className="text-base text-muted-foreground">{spaceText.whatASpaceIs}</p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            {spaceText.newSpace}
          </Button>
        </div>
        <ul aria-label={spaceText.spacesLabel} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space) => (
            <li key={space.id}>
              <SpaceCard space={space} />
            </li>
          ))}
        </ul>
      </main>
      <NewSpaceDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

/** The card of one space: what it is called and what the person is in it. All of it is the link into the space */
function SpaceCard({ space }: { space: Space }) {
  return (
    <Link
      to="/spaces/$spaceId"
      params={{ spaceId: space.id }}
      className="group/space block rounded-4xl outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <Card className="gap-10">
        <CardHeader>
          <SpaceMark id={space.id} name={space.name} large />
          <CardAction>
            {/* The way in: it takes the colour of the main button while the pointer is on the card */}
            <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground group-hover/space:bg-primary group-hover/space:text-primary-foreground">
              <HugeiconsIcon icon={ArrowRight02Icon} strokeWidth={2} className="size-4" />
            </span>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-0.5">
          <CardTitle className="truncate text-xl">{space.name}</CardTitle>
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
  const form = useNewSpace();
  const [leaving, setLeaving] = useState(false);
  return (
    <CardPage
      title={spaceText.firstTitle}
      description={spaceText.firstDescription}
      foot={
        <>
          <SignedInAs way={authText.signOut} onLeave={() => setLeaving(true)} />
          <SignOutDialog open={leaving} onOpenChange={setLeaving} />
        </>
      }
    >
      <form onSubmit={form.submit} noValidate>
        <FieldGroup>
          <SpaceNameField id="first-space-name" name={form.name} problem={form.problem} onChange={form.setName} />
          <Field>
            <Button type="submit" disabled={form.busy}>
              {form.busy && <Spinner data-icon="inline-start" />}
              {spaceText.create}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </CardPage>
  );
}
