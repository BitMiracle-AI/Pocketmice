import { Add01Icon, Delete02Icon, Link01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { CopyButton } from '@/components/CopyButton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { copyText } from '@/lib/clipboard';
import { formatDate, formatSize } from '@/lib/format';
import { type Invite, inviteLink, invitesQuery, removeInvite } from './invites';
import { NewInviteDialog } from './NewInviteDialog';
import { inviteText } from './text';

/** The dot between two things an invite says of itself in its row */
function Dot() {
  return (
    <span aria-hidden="true" className="px-1.5 text-muted-foreground/50">
      ·
    </span>
  );
}

/**
 * The invite links to a space, on the page of its members: the owner makes one, copies it to send it, and deletes
 * it. Only the owner is shown this: an invite's link is all it takes to join.
 */
export function InviteLinks({ spaceId }: { spaceId: string }) {
  const { invites } = useSuspenseQuery(invitesQuery(spaceId)).data;
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Invite | null>(null);
  const [deleting, setDeleting] = useState(false);

  const copyFailed = () => toast.add({ type: 'error', title: inviteText.copyFailed });

  const made = (invite: Invite) => {
    // Copying from here is copying at a click, which is when a browser lets a page write to the clipboard
    const link = inviteLink(invite.id);
    const said = toast.add({
      title: inviteText.created,
      actionProps: {
        children: inviteText.copyLink,
        onClick: async () => {
          toast.close(said);
          if (!(await copyText(link))) copyFailed();
        }
      }
    });
  };

  const remove = async () => {
    if (!removing || deleting) return;
    setDeleting(true);
    const problem = await removeInvite(spaceId, removing.id);
    setDeleting(false);
    setRemoving(null);
    if (problem !== null) toast.add({ type: 'error', title: problem });
  };

  return (
    <section aria-labelledby="invites-title" className="flex flex-col gap-4 pt-4">
      {/* On a narrow window the button goes under what the links are, which then has the whole width to say it */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="invites-title" className="font-heading text-sm font-medium">
            {inviteText.title}
          </h2>
          <p className="max-w-xl text-sm text-pretty text-muted-foreground">{inviteText.hint}</p>
        </div>
        <Button variant="outline" onClick={() => setAdding(true)} className="shrink-0 self-start">
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          {inviteText.newLink}
        </Button>
      </div>

      {invites.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {inviteText.empty}
        </p>
      ) : (
        <ItemGroup aria-label={inviteText.listLabel}>
          {invites.map((invite) => (
            <Item key={invite.id} variant="outline" size="sm">
              <ItemMedia>
                <span
                  aria-hidden="true"
                  className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
                >
                  <HugeiconsIcon icon={Link01Icon} strokeWidth={2} className="size-4" />
                </span>
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full">
                  <code className="truncate font-mono text-xs font-normal">{inviteLink(invite.id)}</code>
                </ItemTitle>
                <ItemDescription className="text-xs">
                  {inviteText.joinsAs[invite.role]}
                  {invite.storageLimit !== null && (
                    <>
                      <Dot />
                      {inviteText.limit(formatSize(invite.storageLimit))}
                    </>
                  )}
                  <Dot />
                  {inviteText.expires(formatDate(invite.expiresAt))}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="gap-0.5">
                <CopyButton text={inviteLink(invite.id)} label={inviteText.copyOf} onFailed={copyFailed} />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={inviteText.removeOf}
                  title={inviteText.removeOf}
                  onClick={() => setRemoving(invite)}
                  className="text-muted-foreground"
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}

      <NewInviteDialog spaceId={spaceId} open={adding} onOpenChange={setAdding} onCreated={made} />

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && !deleting && setRemoving(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{inviteText.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{inviteText.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{inviteText.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={remove}>
              {deleting && <Spinner data-icon="inline-start" />}
              {inviteText.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
