import { Add01Icon, Delete02Icon, Link01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { grantableRole } from '@pocketmice/contract/spaceRole';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { spaceText } from '@/features/space/text';
import { formatDate } from '@/lib/format';
import { type Invite, inviteLink, invitesQuery, makeInvite, removeInvite } from './invites';
import { inviteText } from './text';

/** The roles an invite can give, in the order they are offered: the one that may do more first */
const OFFERED = [...grantableRole.options].reverse();

/**
 * The invite links to a space, on the page of its members: the owner makes one, copies it to send it, and deletes
 * it. Only the owner is shown this: an invite's link is all it takes to join.
 */
export function InviteLinks({ spaceId }: { spaceId: string }) {
  const { invites } = useSuspenseQuery(invitesQuery(spaceId)).data;
  const [making, setMaking] = useState(false);
  const [removing, setRemoving] = useState<Invite | null>(null);
  const [deleting, setDeleting] = useState(false);

  const copyFailed = () => toast.add({ type: 'error', title: inviteText.copyFailed });

  const make = async (role: Invite['role']) => {
    if (making) return;
    setMaking(true);
    const result = await makeInvite(spaceId, role);
    setMaking(false);
    if ('problem' in result) {
      toast.add({ type: 'error', title: result.problem });
      return;
    }
    // Copying from here is copying at a click, which is when a browser lets a page write to the clipboard
    const link = inviteLink(result.invite.id);
    const said = toast.add({
      title: inviteText.created,
      actionProps: {
        children: inviteText.copyLink,
        onClick: () => {
          toast.close(said);
          navigator.clipboard.writeText(link).catch(copyFailed);
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
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" disabled={making} className="shrink-0 self-start" />}>
            {making ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            )}
            {inviteText.newLink}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-64">
            {OFFERED.map((role) => (
              <DropdownMenuItem key={role} onClick={() => make(role)}>
                <span className="flex flex-col gap-0.5">
                  <span>{inviteText.joinsAs[role]}</span>
                  <span className="text-xs text-muted-foreground">{spaceText.roleHints[role]}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
                  <span aria-hidden="true" className="px-1.5 text-muted-foreground/50">
                    ·
                  </span>
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
