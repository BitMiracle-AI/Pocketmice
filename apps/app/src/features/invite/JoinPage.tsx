import { id } from '@pocketmice/contract/id';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ALONE_LINK, Alone, AloneFoot, AloneHeading } from '@/components/Alone';
import { Button, buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { signOutAndReturn } from '@/features/auth/signOut';
import { authText } from '@/features/auth/text';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { joinWith } from './invites';
import { inviteText } from './text';

/**
 * What the link of an invite opens, for someone who is signed in: one button that joins the space. Opening the
 * link joins nothing by itself: the person sees who they are signed in as first, and can change that.
 * The page cannot say which space the invite is to: the api tells that to whoever joins, not to whoever has the
 * link. inviteId is what the address carries, which anyone can write.
 */
export function JoinPage({ inviteId }: { inviteId: string }) {
  const user = useCurrentUser();
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

  if (dead) {
    return (
      <Alone>
        <AloneHeading title={inviteText.deadTitle}>{inviteText.deadDescription}</AloneHeading>
        <Link to="/" className={buttonVariants({ variant: 'outline', className: 'mt-8' })}>
          {inviteText.toHome}
        </Link>
      </Alone>
    );
  }
  return (
    <Alone>
      <AloneHeading title={inviteText.joinTitle}>{inviteText.joinDescription}</AloneHeading>
      <div className="mt-8 flex flex-col gap-3">
        <Button disabled={busy} onClick={join} className="w-full">
          {busy && <Spinner data-icon="inline-start" />}
          {inviteText.join}
        </Button>
        {problem !== null && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
      </div>
      <AloneFoot>
        <span>{authText.signedInAs(user.email)}</span>
        <button type="button" className={ALONE_LINK} onClick={() => signOutAndReturn(`/join/${inviteId}`)}>
          {inviteText.otherAccount}
        </button>
      </AloneFoot>
    </Alone>
  );
}
