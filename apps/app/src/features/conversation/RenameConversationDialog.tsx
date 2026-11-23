import { CONVERSATION_TITLE_MAX_LENGTH } from '@pocketmice/contract/domains/conversation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { type Conversation, renameConversation } from './conversations';
import { conversationText } from './text';

/** The dialog a conversation is given another title in. Once it has it the dialog closes */
export function RenameConversationDialog({
  spaceId,
  conversation,
  open,
  onOpenChange
}: {
  spaceId: string;
  conversation: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* What is typed is kept inside the dialog: closed, it is gone, and the next time starts from the title */}
      <DialogContent>
        {open && <RenameForm spaceId={spaceId} conversation={conversation} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  spaceId,
  conversation,
  onDone
}: {
  spaceId: string;
  conversation: Conversation;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(conversation.title);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const failed = await renameConversation(spaceId, conversation.id, title);
    setBusy(false);
    if (failed !== null) return setProblem(failed);
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="contents">
      <DialogHeader>
        <DialogTitle>{conversationText.renameTitle}</DialogTitle>
      </DialogHeader>
      <Field data-invalid={problem !== null || undefined}>
        <FieldLabel htmlFor="rename-conversation-title">{conversationText.titleLabel}</FieldLabel>
        <Input
          id="rename-conversation-title"
          autoFocus
          autoComplete="off"
          maxLength={CONVERSATION_TITLE_MAX_LENGTH}
          value={title}
          aria-invalid={problem !== null || undefined}
          onFocus={(event) => event.target.select()}
          onChange={(event) => {
            setTitle(event.target.value);
            setProblem(null);
          }}
        />
        {problem !== null && <FieldError>{problem}</FieldError>}
      </Field>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{conversationText.cancel}</DialogClose>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {conversationText.rename}
        </Button>
      </DialogFooter>
    </form>
  );
}
