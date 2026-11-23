import { PencilEdit02Icon, UserRemove01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { membersQuery } from '@/features/space/members';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { thrownText } from '@/lib/api';
import { addToConversation, type Conversation, type ConversationMember, removeFromConversation } from './conversations';
import { conversationText } from './text';

/**
 * What a conversation is, beside what is said in it: its title, who is in it, and what can be done with it as a
 * whole. Whoever can read the conversation renames it and adds someone of the space to it; the owner of the space
 * takes someone out. A member leaves it for themselves, and the owner of the space deletes it: both are asked
 * about first, by the page (onAsk), which is also where the title is changed (onRename).
 */
export function ConversationAbout({
  conversation,
  members,
  onRename,
  onAsk
}: {
  conversation: Conversation;
  members: readonly ConversationMember[];
  onRename: () => void;
  onAsk: (what: 'leave' | 'delete') => void;
}) {
  const space = useCurrentSpace();
  const user = useCurrentUser();
  const inSpace = useQuery(membersQuery(space.id));
  // The person being added or taken out: their row waits until the api has answered
  const [busy, setBusy] = useState<string | null>(null);

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

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-medium break-words">{conversation.title}</h2>
          <p className="text-sm text-muted-foreground">{conversationText.membersCount(members.length)}</p>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={onRename}>
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
            {conversationText.rename}
          </Button>
        </div>

        <Separator />

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
                <Item key={member.userId} size="xs" variant="outline">
                  <ItemMedia>
                    <PersonAvatar name={member.name} size="sm" />
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

        <Separator />

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
                <Item key={each.userId} size="xs" variant="outline">
                  <ItemMedia>
                    <PersonAvatar name={each.name} size="sm" />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle>
                      <span className="truncate">{each.name}</span>
                      {each.userId === user.id && <Badge variant="secondary">{conversationText.you}</Badge>}
                    </ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="outline"
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
            <Separator />
            <div className="flex flex-wrap gap-2">
              {isMember && (
                <Button variant="outline" size="sm" onClick={() => onAsk('leave')}>
                  {conversationText.leave}
                </Button>
              )}
              {/* What cannot be undone is the owner's alone */}
              {isOwner && (
                <Button variant="destructive" size="sm" onClick={() => onAsk('delete')}>
                  {conversationText.deleteConversation}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
