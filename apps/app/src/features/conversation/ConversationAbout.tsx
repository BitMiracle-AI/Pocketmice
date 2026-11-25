import { PencilEdit02Icon, UserRemove01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
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
import { FieldError } from '@/components/ui/field';
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { membersQuery } from '@/features/space/members';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLastGiven } from '@/hooks/useLastGiven';
import { thrownText } from '@/lib/api';
import {
  addToConversation,
  type Conversation,
  type ConversationMember,
  conversationsChanged,
  exitConversation,
  removeConversation,
  removeFromConversation
} from './conversations';
import { RenameConversationDialog } from './RenameConversationDialog';
import { conversationText } from './text';

/** What the person is being asked about: leaving the conversation, or deleting it */
type Asking = 'leave' | 'delete' | null;

/**
 * What a conversation is, beside what is said in it: its title, who is in it, and what can be done with it as a
 * whole. Whoever can read the conversation renames it and adds someone of the space to it; the owner of the space
 * takes someone out. A member leaves it for themselves, and the owner of the space deletes it: both are asked
 * about first.
 * going says the person is leaving or deleting it and the api has not answered yet; the page keeps that
 * (onGoing), since it is the page that would otherwise say the conversation is gone.
 */
export function ConversationAbout({
  conversation,
  members,
  going,
  onGoing
}: {
  conversation: Conversation;
  members: readonly ConversationMember[];
  going: boolean;
  onGoing: (going: boolean) => void;
}) {
  const space = useCurrentSpace();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const inSpace = useQuery(membersQuery(space.id));
  // The person being added or taken out: their row waits until the api has answered
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [asking, setAsking] = useState<Asking>(null);
  const asked = useLastGiven(asking);

  const isOwner = space.role === 'owner';
  // The owner of the space reads a conversation they are no member of
  const isMember = conversation.lastReadNumber !== null;
  const others = inSpace.data?.members.filter((each) => !members.some((member) => member.userId === each.userId));

  const act = async (userId: string, what: typeof addToConversation) => {
    if (busy !== null) return;
    setBusy(userId);
    const problem = await what(space.id, conversation.id, userId);
    setBusy(null);
    if (problem !== null) toast.add({ type: 'error', title: problem });
  };

  const confirm = async () => {
    if (!asking || going) return;
    onGoing(true);
    const problem =
      asking === 'leave'
        ? await exitConversation(space.id, conversation.id)
        : await removeConversation(space.id, conversation.id);
    if (problem !== null) {
      onGoing(false);
      setAsking(null);
      return toast.add({ type: 'error', title: problem });
    }
    // The owner of the space who leaves still reads the conversation, and stays on its page. Anyone else, and
    // whoever deleted it, goes to the list; the page leaves the conversation before the cache hears that it is gone
    if (asking === 'delete' || !isOwner) {
      await navigate({ to: '/spaces/$spaceId/conversations', params: { spaceId: space.id }, replace: true });
    }
    conversationsChanged(space.id, conversation.id);
    toast.add({
      title:
        asking === 'leave' ? conversationText.left(conversation.title) : conversationText.deleted(conversation.title)
    });
    onGoing(false);
    setAsking(null);
  };

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-base font-medium break-words select-text">{conversation.title}</h2>
            <p className="text-sm text-muted-foreground">{conversationText.membersCount(members.length)}</p>
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={() => setRenaming(true)}>
              <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
              {conversationText.rename}
            </Button>
          </div>

          <section aria-labelledby="conversation-members" className="flex flex-col gap-3">
            <h3 id="conversation-members" className="text-sm font-medium">
              {conversationText.membersTitle}
            </h3>
            <p className="text-sm text-pretty text-muted-foreground">
              {isOwner ? conversationText.membersHintOwner : conversationText.membersHint}
            </p>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">{conversationText.nobodyIn}</p>
            ) : (
              <ItemGroup aria-label={conversationText.membersLabel}>
                {members.map((member) => (
                  <Item key={member.userId} size="xs" variant="muted">
                    <ItemMedia>
                      <PersonAvatar id={member.userId} name={member.name} size="sm" />
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                      <ItemTitle>
                        <span className="truncate">{member.name}</span>
                        {member.userId === user.id && <Badge variant="secondary">{conversationText.you}</Badge>}
                      </ItemTitle>
                    </ItemContent>
                    {/* The person takes themselves out by leaving */}
                    {isOwner && member.userId !== user.id && (
                      <ItemActions>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={conversationText.removeMember(member.name)}
                          title={conversationText.removeMember(member.name)}
                          disabled={busy !== null}
                          onClick={() => act(member.userId, removeFromConversation)}
                        >
                          {busy === member.userId ? (
                            <Spinner />
                          ) : (
                            <HugeiconsIcon icon={UserRemove01Icon} strokeWidth={2} />
                          )}
                        </Button>
                      </ItemActions>
                    )}
                  </Item>
                ))}
              </ItemGroup>
            )}
          </section>

          <section aria-labelledby="conversation-add-people" className="flex flex-col gap-3">
            <h3 id="conversation-add-people" className="text-sm font-medium">
              {conversationText.addPeople}
            </h3>
            {others === undefined ? (
              inSpace.isError ? (
                <FieldError>{thrownText(inSpace.error)}</FieldError>
              ) : (
                <Spinner />
              )
            ) : others.length === 0 ? (
              <p className="text-sm text-muted-foreground">{conversationText.everyoneIsIn}</p>
            ) : (
              <ItemGroup aria-labelledby="conversation-add-people">
                {others.map((each) => (
                  <Item key={each.userId} size="xs" variant="muted">
                    <ItemMedia>
                      <PersonAvatar id={each.userId} name={each.name} size="sm" />
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                      <ItemTitle>
                        <span className="truncate">{each.name}</span>
                        {each.userId === user.id && <Badge variant="secondary">{conversationText.you}</Badge>}
                      </ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        variant="secondary"
                        size="xs"
                        aria-label={conversationText.addMember(each.name)}
                        disabled={busy !== null}
                        onClick={() => act(each.userId, addToConversation)}
                      >
                        {busy === each.userId && <Spinner data-icon="inline-start" />}
                        {conversationText.add}
                      </Button>
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </section>

          {(isMember || isOwner) && (
            <>
              <div className="flex flex-wrap gap-2">
                {isMember && (
                  <Button variant="secondary" size="sm" onClick={() => setAsking('leave')}>
                    {conversationText.leave}
                  </Button>
                )}
                {/* What cannot be undone is the owner's alone */}
                {isOwner && (
                  <Button variant="destructive" size="sm" onClick={() => setAsking('delete')}>
                    {conversationText.deleteConversation}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      <RenameConversationDialog
        spaceId={space.id}
        conversation={conversation}
        open={renaming}
        onOpenChange={setRenaming}
      />
      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && !going && setAsking(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">
              {asked === 'leave'
                ? conversationText.leaveTitle(conversation.title)
                : conversationText.deleteTitle(conversation.title)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {asked === 'delete'
                ? conversationText.deleteDescription
                : isOwner
                  ? conversationText.leaveDescriptionOwner
                  : conversationText.leaveDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={going}>{conversationText.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={going} onClick={confirm}>
              {going && <Spinner data-icon="inline-start" />}
              {asked === 'leave' ? conversationText.leave : conversationText.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
