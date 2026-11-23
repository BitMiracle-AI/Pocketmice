import { id } from '@pocketmice/contract/id';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { CardPage } from '@/components/CardPage';
import { Button } from '@/components/ui/button';
import { Field, FieldError } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { SignedInAs } from '@/features/auth/SignedInAs';
import { signOutAndReturn } from '@/features/auth/signOut';
import { commonText } from '@/lib/text';
import { joinWith } from './invites';
import { inviteText } from './text';

/**
 * What the link of an invite opens, for someone who is signed in: one button that joins the space. Opening the
 * link joins nothing by itself: the person sees who they are signed in as first, and can change that.
 * The page cannot say which space the invite is to: the api tells that to whoever joins, not to whoever has the
 * link. inviteId is what the address carries, which anyone can write.
 */
export function JoinPage({ inviteId }: { inviteId: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // What is no id is no invite: the api is not asked
  const [dead, setDead] = useState(!id.safeParse(inviteId).success);

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const result = await joinWith(inviteId);
    if ('space' in result) {
      toast.add({ title: inviteText.joined(result.space.name) });
      await navigate({ to: '/spaces/$spaceId', params: { spaceId: result.space.id }, replace: true });
      return;
    }
    setBusy(false);
    if ('dead' in result) setDead(true);
    else setProblem(result.problem);
  };

  // Under either card: who is signed in, and the way to join as someone else
  const foot = <SignedInAs way={inviteText.otherAccount} onLeave={() => signOutAndReturn(`/join/${inviteId}`)} />;

  if (dead) {
    return (
      <CardPage title={inviteText.deadTitle} description={inviteText.deadDescription} foot={foot}>
        <Field>
          <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
            {commonText.toHome}
          </Button>
        </Field>
      </CardPage>
    );
  }
  return (
    <CardPage title={inviteText.joinTitle} description={inviteText.joinDescription} foot={foot}>
      <Field data-invalid={problem !== null || undefined}>
        <Button disabled={busy} onClick={join}>
          {busy && <Spinner data-icon="inline-start" />}
          {inviteText.join}
        </Button>
        {problem !== null && <FieldError className="text-center">{problem}</FieldError>}
      </Field>
    </CardPage>
  );
}
