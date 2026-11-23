import { CONVERSATION_TITLE_MAX_LENGTH } from '@pocketmice/contract/domains/conversation';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useId, useState } from 'react';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { membersQuery } from '@/features/space/members';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { thrownText } from '@/lib/api';
import { startConversation } from './conversations';
import { conversationText } from './text';

/**
 * The dialog a conversation is started in: what it is about, and who of the space is in it besides the person.
 * Once it is started the dialog closes, and the page goes to the conversation.
 */
export function NewConversationDialog({
  spaceId,
  open,
  onOpenChange
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* What is typed is kept inside the dialog: closed, it is gone, and the next one starts empty */}
      <DialogContent>
        {open && <NewConversationForm spaceId={spaceId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function NewConversationForm({ spaceId, onDone }: { spaceId: string; onDone: () => void }) {
  const space = useCurrentSpace();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const members = useQuery(membersQuery(spaceId));
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idPrefix = useId();

  const others = members.data?.members.filter((member) => member.userId !== user.id);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const started = await startConversation(spaceId, title, picked);
    if ('problem' in started) {
      setBusy(false);
      return setProblem(started.problem);
    }
    if (started.missed) toast.add({ type: 'error', title: conversationText.someNotAdded });
    await navigate({
      to: '/spaces/$spaceId/conversations/$conversationId',
      params: { spaceId, conversationId: started.conversation.id }
    });
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="contents">
      <DialogHeader>
        <DialogTitle>{conversationText.startTitle}</DialogTitle>
        <DialogDescription>{conversationText.whatAConversationIs}</DialogDescription>
      </DialogHeader>

      <Field data-invalid={problem !== null || undefined}>
        <FieldLabel htmlFor="new-conversation-title">{conversationText.titleLabel}</FieldLabel>
        <Input
          id="new-conversation-title"
          autoFocus
          autoComplete="off"
          maxLength={CONVERSATION_TITLE_MAX_LENGTH}
          value={title}
          placeholder={conversationText.titlePlaceholder}
          aria-invalid={problem !== null || undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            setProblem(null);
          }}
        />
        {problem !== null && <FieldError>{problem}</FieldError>}
      </Field>

      <Field>
        <FieldLabel id="new-conversation-people">{conversationText.peopleLabel}</FieldLabel>
        {others === undefined ? (
          <div className="flex h-20 items-center justify-center rounded-2xl border">
            {members.isError ? (
              <p role="alert" className="px-6 text-center text-muted-foreground">
                {thrownText(members.error)}
              </p>
            ) : (
              <Spinner />
            )}
          </div>
        ) : others.length === 0 ? (
          <p className="text-muted-foreground">{conversationText.nobodyElse}</p>
        ) : (
          <ul aria-labelledby="new-conversation-people" className="max-h-48 overflow-y-auto rounded-2xl border p-1">
            {others.map((member) => (
              <li key={member.userId}>
                <label
                  htmlFor={`${idPrefix}-${member.userId}`}
                  className="flex h-9 min-w-0 items-center gap-3 rounded-xl px-2.5 hover:bg-muted/70"
                >
                  <Checkbox
                    id={`${idPrefix}-${member.userId}`}
                    checked={picked.includes(member.userId)}
                    onCheckedChange={(checked) =>
                      setPicked(checked ? [...picked, member.userId] : picked.filter((each) => each !== member.userId))
                    }
                  />
                  <PersonAvatar name={member.name} small />
                  <span className="min-w-0 flex-1 truncate">{member.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <FieldDescription>
          {/* No conversation is closed to the owner of the space: whoever starts one is told */}
          {picked.length === 0 ? conversationText.aloneHint : conversationText.peopleHint}
          {space.role !== 'owner' && ` ${conversationText.ownerReads}`}
        </FieldDescription>
      </Field>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{conversationText.cancel}</DialogClose>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {conversationText.startConfirm}
        </Button>
      </DialogFooter>
    </form>
  );
}
