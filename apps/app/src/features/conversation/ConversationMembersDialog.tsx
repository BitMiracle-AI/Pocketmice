import { UserRemove01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { membersQuery } from '@/features/space/members';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { thrownText } from '@/lib/api';
import { addToConversation, type Conversation, type ConversationMember, removeFromConversation } from './conversations';
import { conversationText } from './text';

/**
 * The dialog that shows who is in a conversation, and adds members of the space to it. Whoever can read the
 * conversation adds someone; the owner of the space takes someone out. Leaving is not here: it is in the menu of
 * the conversation, where the person does it for themselves.
 */
export function ConversationMembersDialog({
  open,
  onOpenChange,
  conversation,
  members
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation;
  members: readonly ConversationMember[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <MembersOf conversation={conversation} members={members} />}</DialogContent>
    </Dialog>
  );
}

function MembersOf({ conversation, members }: { conversation: Conversation; members: readonly ConversationMember[] }) {
  const space = useCurrentSpace();
  const user = useCurrentUser();
  const inSpace = useQuery(membersQuery(space.id));
  // The person being added or taken out: their row waits until the api has answered
  const [busy, setBusy] = useState<string | null>(null);

  const isOwner = space.role === 'owner';
  const others = inSpace.data?.members.filter((each) => !members.some((member) => member.userId === each.userId));

  const act = async (userId: string, what: typeof addToConversation) => {
    if (busy !== null) return;
    setBusy(userId);
    const problem = await what(space.id, conversation.id, userId);
    setBusy(null);
    if (problem !== null) toast.add({ type: 'error', title: problem });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{conversationText.membersTitle}</DialogTitle>
        <DialogDescription>
          {isOwner ? conversationText.membersHintOwner : conversationText.membersHint}
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-w-0 flex-col gap-4">
        {members.length === 0 ? (
          <p className="text-muted-foreground">{conversationText.nobodyIn}</p>
        ) : (
          <ul aria-label={conversationText.membersLabel} className="max-h-56 overflow-y-auto rounded-2xl border p-1">
            {members.map((member) => (
              <li key={member.userId} className="flex h-9 min-w-0 items-center gap-3 px-2.5">
                <PersonAvatar name={member.name} small />
                <span className="min-w-0 truncate">{member.name}</span>
                {member.userId === user.id && <Badge variant="secondary">{conversationText.you}</Badge>}
                {/* The person takes themselves out by leaving */}
                {isOwner && member.userId !== user.id && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={conversationText.removeMember(member.name)}
                    title={conversationText.removeMember(member.name)}
                    disabled={busy !== null}
                    onClick={() => act(member.userId, removeFromConversation)}
                    className="ml-auto text-muted-foreground"
                  >
                    {busy === member.userId ? <Spinner /> : <HugeiconsIcon icon={UserRemove01Icon} strokeWidth={2} />}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <section className="flex min-w-0 flex-col gap-2">
          <h3 id="conversation-add-people" className="font-medium">
            {conversationText.addPeople}
          </h3>
          {others === undefined ? (
            <div className="flex h-20 items-center justify-center rounded-2xl border">
              {inSpace.isError ? (
                <p role="alert" className="px-6 text-center text-muted-foreground">
                  {thrownText(inSpace.error)}
                </p>
              ) : (
                <Spinner />
              )}
            </div>
          ) : others.length === 0 ? (
            <p className="text-muted-foreground">{conversationText.everyoneIsIn}</p>
          ) : (
            <ul aria-labelledby="conversation-add-people" className="max-h-56 overflow-y-auto rounded-2xl border p-1">
              {others.map((each) => (
                <li key={each.userId} className="flex h-9 min-w-0 items-center gap-3 px-2.5">
                  <PersonAvatar name={each.name} small />
                  <span className="min-w-0 truncate">{each.name}</span>
                  {each.userId === user.id && <Badge variant="secondary">{conversationText.you}</Badge>}
                  <Button
                    variant="outline"
                    size="xs"
                    aria-label={conversationText.addMember(each.name)}
                    disabled={busy !== null}
                    onClick={() => act(each.userId, addToConversation)}
                    className="ml-auto"
                  >
                    {busy === each.userId && <Spinner data-icon="inline-start" />}
                    {conversationText.add}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
