import { HardDriveIcon, MoreHorizontalIcon, UserRemove01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { grantableRole } from '@pocketmice/contract/spaceRole';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Page } from '@/components/Page';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { InviteLinks } from '@/features/invite/InviteLinks';
import { PageBar } from '@/features/shell/PageBar';
import { shellText } from '@/features/shell/text';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLastGiven } from '@/hooks/useLastGiven';
import { formatSize } from '@/lib/format';
import { useCurrentSpace } from './CurrentSpaceProvider';
import { MemberLimitDialog } from './MemberLimitDialog';
import { changeRole, type GrantableRole, leave, type Member, membersQuery, removeFromSpace } from './members';
import { spaceHolds, spaceSizeQuery, useNoLongerIn } from './spaces';
import { shareOf } from './storageLimit';
import { spaceText } from './text';

// Who is in a space, what each may do there, and how much of it each holds. Every member sees the list, and over
// it how much the space holds in all. The owner gives someone else another role where the role is said, and from
// the menu at the end of a row sets how much a member may hold (their own row included) or takes someone out;
// under the list are the invite links, which only the owner sees. Anyone but the owner can leave: the owner
// cannot, and their own role does not change.

/** The roles that can be given, in the order they are offered: the one that may do more first */
const OFFERED = [...grantableRole.options].reverse();

/** What the person is being asked about: taking a member out, or leaving themselves */
type Asking = { member: Member } | 'leave' | null;

export function MembersPage() {
  const space = useCurrentSpace();
  const user = useCurrentUser();
  const noLongerIn = useNoLongerIn();
  const { members } = useSuspenseQuery(membersQuery(space.id)).data;
  const size = useSuspenseQuery(spaceSizeQuery(space.id)).data;
  // The member whose role is being changed: their row waits until the api has answered
  const [changing, setChanging] = useState<string | null>(null);
  // The member whose storage limit is being set
  const [limiting, setLimiting] = useState<Member | null>(null);
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
      // This space is no longer the person's: they go to the start, where the ones that are theirs are
      await noLongerIn(space.id);
      toast.add({ title: spaceText.left(space.name) });
      return;
    }
    setConfirming(false);
    setAsking(null);
    if (problem !== null) toast.add({ type: 'error', title: problem });
  };

  return (
    <>
      <PageBar
        title={shellText.members}
        actions={
          !isOwner && (
            <Button variant="outline" onClick={() => setAsking('leave')}>
              {spaceText.leave}
            </Button>
          )
        }
      />

      <Page>
        <Card>
          <CardHeader>
            <CardTitle>{spaceText.storageTitle}</CardTitle>
            <CardDescription>{spaceHolds(size)}</CardDescription>
          </CardHeader>
          {size.storageLimit !== null && (
            <CardContent>
              {/* The sentence over it says the same in words, so the bar is for the eye alone */}
              <Progress aria-hidden="true" value={shareOf(size.storageSize, size.storageLimit)} />
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{shellText.members}</CardTitle>
            <CardDescription>{spaceText.membersHints[space.role]}</CardDescription>
          </CardHeader>
          <CardContent>
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
                    <ItemDescription>
                      {member.storageLimit === null
                        ? spaceText.holds(formatSize(member.storageSize))
                        : spaceText.holdsOf(formatSize(member.storageSize), formatSize(member.storageLimit))}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {changing === member.userId && <Spinner />}
                    {isOwner && member.role !== 'owner' ? (
                      // The owner gives someone else another role where the role is said; the row waits until
                      // the api has answered
                      <Select
                        value={member.role}
                        items={OFFERED.map((role) => ({ value: role, label: spaceText.roles[role] }))}
                        disabled={changing !== null}
                        onValueChange={(role) => change(member, role as GrantableRole)}
                      >
                        <SelectTrigger size="sm" aria-label={spaceText.changeRole(member.name)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end" alignItemWithTrigger={false} className="w-72">
                          <SelectGroup>
                            {OFFERED.map((role) => (
                              <SelectItem key={role} value={role}>
                                <span className="flex flex-col gap-0.5">
                                  <span>{spaceText.roles[role]}</span>
                                  <span className="text-xs font-normal whitespace-normal text-muted-foreground">
                                    {spaceText.roleHints[role]}
                                  </span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm text-muted-foreground">{spaceText.roles[member.role]}</span>
                    )}
                    {isOwner && (
                      // What else the owner does to a member. The owner's own row has the storage limit and
                      // nothing else: their role does not change, and they cannot be removed
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={spaceText.changeLimit(member.name)}
                              disabled={changing !== null}
                            />
                          }
                        >
                          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-48">
                          <DropdownMenuItem onClick={() => setLimiting(member)}>
                            <HugeiconsIcon icon={HardDriveIcon} strokeWidth={2} />
                            {spaceText.storageLimitItem}
                          </DropdownMenuItem>
                          {member.role !== 'owner' && (
                            <DropdownMenuItem variant="destructive" onClick={() => setAsking({ member })}>
                              <HugeiconsIcon icon={UserRemove01Icon} strokeWidth={2} />
                              {spaceText.removeMember}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>

        {isOwner && <InviteLinks spaceId={space.id} />}
      </Page>

      <MemberLimitDialog spaceId={space.id} member={limiting} onClose={() => setLimiting(null)} />

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
