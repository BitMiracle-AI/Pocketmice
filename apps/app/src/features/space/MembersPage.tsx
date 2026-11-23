import { ArrowDown01Icon, UserRemove01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { grantableRole } from '@pocketmice/contract/spaceRole';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Page, PageHead } from '@/components/Page';
import { PersonAvatar } from '@/components/PersonAvatar';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { InviteLinks } from '@/features/invite/InviteLinks';
import { MainBar } from '@/features/shell/MainBar';
import { shellText } from '@/features/shell/text';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLastGiven } from '@/hooks/useLastGiven';
import { useCurrentSpace } from './CurrentSpaceProvider';
import { changeRole, type GrantableRole, leave, type Member, membersQuery, removeFromSpace } from './members';
import { noLongerIn } from './spaces';
import { spaceText } from './text';

// Who is in a space, and what each may do there. Every member sees the list. The owner changes the role of
// someone else, or takes them out, from the role at the end of their row; under the list are the invite links,
// which only the owner sees. Anyone but the owner can leave: the owner cannot, and their own role does not change.

/** The roles that can be given, in the order they are offered: the one that may do more first */
const OFFERED = [...grantableRole.options].reverse();

/** What the person is being asked about: taking a member out, or leaving themselves */
type Asking = { member: Member } | 'leave' | null;

export function MembersPage() {
  const space = useCurrentSpace();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const { members } = useSuspenseQuery(membersQuery(space.id)).data;
  // The member whose role is being changed: their row waits until the api has answered
  const [changing, setChanging] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking>(null);
  const [confirming, setConfirming] = useState(false);
  const asked = useLastGiven(asking);

  const isOwner = space.role === 'owner';

  const change = async (member: Member, role: GrantableRole) => {
    if (role === member.role || changing !== null) return;
    setChanging(member.userId);
    const problem = await changeRole(space.id, member.userId, role);
    setChanging(null);
    if (problem !== null) toast.add({ type: 'error', title: problem });
  };

  const confirm = async () => {
    if (!asking || confirming) return;
    setConfirming(true);
    const problem = asking === 'leave' ? await leave(space.id) : await removeFromSpace(space.id, asking.member.userId);
    if (problem === null && asking === 'leave') {
      // This space is no longer the person's: they go to the start, where the ones that are theirs are. The page
      // leaves the space before the space leaves the list: a page of a space that is not on the list says "no
      // such space", which is not what happened here
      await navigate({ to: '/', replace: true });
      noLongerIn(space.id);
      toast.add({ title: spaceText.left(space.name) });
      return;
    }
    setConfirming(false);
    setAsking(null);
    if (problem !== null) toast.add({ type: 'error', title: problem });
  };

  return (
    <>
      <MainBar trail={[]} title={shellText.members} />

      <Page>
        <PageHead title={shellText.members} hint={spaceText.membersHints[space.role]}>
          {!isOwner && (
            <Button variant="outline" onClick={() => setAsking('leave')}>
              {spaceText.leave}
            </Button>
          )}
        </PageHead>

        <ItemGroup aria-label={spaceText.membersLabel}>
          {members.map((member) => (
            <Item key={member.userId} variant="outline" size="sm">
              <ItemMedia>
                <PersonAvatar name={member.name} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle>
                  <span className="truncate">{member.name}</span>
                  {member.userId === user.id && <Badge variant="secondary">{spaceText.you}</Badge>}
                </ItemTitle>
              </ItemContent>
              <ItemActions>
                {isOwner && member.role !== 'owner' ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={spaceText.changeRole(member.name)}
                          disabled={changing !== null}
                          className="text-muted-foreground"
                        />
                      }
                    >
                      {spaceText.roles[member.role]}
                      {changing === member.userId ? (
                        <Spinner data-icon="inline-end" />
                      ) : (
                        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} data-icon="inline-end" />
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-64">
                      <DropdownMenuRadioGroup
                        value={member.role}
                        onValueChange={(value) => change(member, value as GrantableRole)}
                      >
                        {OFFERED.map((role) => (
                          // Picking a role closes the menu, as picking anything else in it does: the row then
                          // says the role, and waits for the api
                          <DropdownMenuRadioItem key={role} value={role} closeOnClick>
                            <span className="flex flex-col gap-0.5">
                              <span>{spaceText.roles[role]}</span>
                              <span className="text-xs text-muted-foreground">{spaceText.roleHints[role]}</span>
                            </span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setAsking({ member })}>
                        <HugeiconsIcon icon={UserRemove01Icon} strokeWidth={2} />
                        {spaceText.removeMember}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="px-2.5 text-sm text-muted-foreground">{spaceText.roles[member.role]}</span>
                )}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>

        {isOwner && <InviteLinks spaceId={space.id} />}
      </Page>

      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && !confirming && setAsking(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">
              {asked === 'leave' ? spaceText.leaveTitle(space.name) : asked && spaceText.removeTitle(asked.member.name)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {asked === 'leave' ? spaceText.leaveDescription : spaceText.removeDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>{spaceText.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={confirming} onClick={confirm}>
              {confirming && <Spinner data-icon="inline-start" />}
              {asked === 'leave' ? spaceText.leave : spaceText.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
