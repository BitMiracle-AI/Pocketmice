import { ArrowUp02Icon, AtIcon, Attachment01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  MESSAGE_FILES_MAX,
  MESSAGE_MENTIONS_MAX,
  MESSAGE_TEXT_MAX_LENGTH,
  messageText
} from '@pocketmice/contract/domains/conversation';
import { type FormEvent, type KeyboardEvent, useRef, useState } from 'react';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import { useMessageScroller } from '@/components/ui/message-scroller';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { FileIcon } from '@/features/file/FileIcon';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type ConversationMember, sendMessage } from './conversations';
import { FilePickerDialog, type PickedFile } from './FilePickerDialog';
import { conversationText } from './text';

// The field a message is written in, at the bottom of a conversation. Enter sends what is written, and Shift with
// Enter begins a new line; on a touch screen Enter begins a new line, and the button sends. Whom the message
// mentions and which files it points at are picked with the two buttons under the field, and shown above what is
// written, where each can be taken away again.
// What is written is not sent before the api has said so, and stays in the field when it could not be sent.
// What was written in a conversation and not sent is kept while the page is open: someone who looks into another
// conversation and comes back finds it as they left it. Opening the page anew starts empty.

/** What is being written: the text, the members it mentions, the files it points at */
interface Writing {
  text: string;
  mentioned: readonly string[];
  files: readonly PickedFile[];
}

const NOTHING: Writing = { text: '', mentioned: [], files: [] };

/** Whether the page is used by touch: there is no Shift to hold, and the keyboard takes half the screen */
const TOUCH = window.matchMedia('(pointer: coarse)');

/** What was written and not sent, by conversation */
const unsent = new Map<string, Writing>();

/** members are the members of the conversation: the ones a message can mention */
export function Composer({
  spaceId,
  conversationId,
  members
}: {
  spaceId: string;
  conversationId: string;
  members: readonly ConversationMember[];
}) {
  const user = useCurrentUser();
  const { scrollToEnd } = useMessageScroller();
  const field = useRef<HTMLTextAreaElement>(null);
  const [writing, setWriting] = useState(() => unsent.get(conversationId) ?? NOTHING);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);

  const write = (next: Writing) => {
    setWriting(next);
    if (next.text === '' && next.mentioned.length === 0 && next.files.length === 0) unsent.delete(conversationId);
    else unsent.set(conversationId, next);
  };

  // In the order they were picked. Someone who was picked and has left the conversation since is not mentioned:
  // the server would refuse the message
  const mentioned = writing.mentioned.flatMap((userId) => members.find((member) => member.userId === userId) ?? []);
  const checked = messageText.safeParse(writing.text);

  const send = async () => {
    if (!checked.success || sending) return;
    setSending(true);
    const problem = await sendMessage(spaceId, conversationId, {
      text: checked.data,
      mentionedUserIds: mentioned.map((member) => member.userId),
      fileIds: writing.files.map((file) => file.id)
    });
    setSending(false);
    if (problem !== null) return toast.add({ type: 'error', title: problem });
    write(NOTHING);
    // Whoever sent something sees it, wherever they had scrolled to
    scrollToEnd();
    field.current?.focus();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // Enter that picks a word while Chinese or Japanese is being typed is not the end of the message
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (TOUCH.matches) return;
    event.preventDefault();
    void send();
  };

  return (
    <>
      <form onSubmit={submit} className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
        <InputGroup>
          {(mentioned.length > 0 || writing.files.length > 0) && (
            <InputGroupAddon align="block-start" className="flex-wrap gap-1.5">
              {mentioned.map((member) => (
                <Badge key={member.userId} variant="secondary" className="max-w-full pr-1">
                  <span className="truncate">{conversationText.at(member.name)}</span>
                  <button
                    type="button"
                    aria-label={conversationText.dropMention(member.name)}
                    className="rounded-full p-0.5 hover:bg-foreground/10"
                    onClick={() => {
                      write({ ...writing, mentioned: writing.mentioned.filter((each) => each !== member.userId) });
                      // The button goes away with what it took away: the focus goes back to what is being written
                      field.current?.focus();
                    }}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
                  </button>
                </Badge>
              ))}
              {writing.files.map((file) => (
                <Badge key={file.id} variant="secondary" className="max-w-full pr-1">
                  <FileIcon name={file.name} folder={file.kind === 'folder'} />
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={conversationText.dropFile(file.name)}
                    className="rounded-full p-0.5 hover:bg-foreground/10"
                    onClick={() => {
                      write({ ...writing, files: writing.files.filter((each) => each.id !== file.id) });
                      field.current?.focus();
                    }}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
                  </button>
                </Badge>
              ))}
            </InputGroupAddon>
          )}

          <InputGroupTextarea
            ref={field}
            // Not on a touch screen: the keyboard would come up over the messages the person came to read
            autoFocus={!TOUCH.matches}
            rows={1}
            aria-label={conversationText.writeLabel}
            placeholder={conversationText.writePlaceholder}
            maxLength={MESSAGE_TEXT_MAX_LENGTH}
            value={writing.text}
            // While it is being sent what is written stays as it is: it is taken away when it was sent
            readOnly={sending}
            className="max-h-48 min-h-10 px-3"
            onChange={(event) => write({ ...writing, text: event.target.value })}
            onKeyDown={onKeyDown}
          />

          <InputGroupAddon align="block-end" className="gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <InputGroupButton
                    size="icon-xs"
                    aria-label={conversationText.mention}
                    title={conversationText.mention}
                    className="size-7"
                  />
                }
              >
                <HugeiconsIcon icon={AtIcon} strokeWidth={2} />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="max-h-72 min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{conversationText.mentionHint}</DropdownMenuLabel>
                  {members.map((member) => {
                    const picked = writing.mentioned.includes(member.userId);
                    return (
                      <DropdownMenuCheckboxItem
                        key={member.userId}
                        checked={picked}
                        disabled={!picked && mentioned.length >= MESSAGE_MENTIONS_MAX}
                        onCheckedChange={(next) =>
                          write({
                            ...writing,
                            mentioned: next
                              ? [...writing.mentioned, member.userId]
                              : writing.mentioned.filter((each) => each !== member.userId)
                          })
                        }
                      >
                        <PersonAvatar id={member.userId} name={member.name} size="sm" />
                        <span className="truncate">
                          {member.userId === user.id ? conversationText.nameAndYou(member.name) : member.name}
                        </span>
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <InputGroupButton
              size="icon-xs"
              aria-label={conversationText.pointAtFiles}
              title={conversationText.pointAtFiles}
              className="size-7"
              onClick={() => setPicking(true)}
            >
              <HugeiconsIcon icon={Attachment01Icon} strokeWidth={2} />
            </InputGroupButton>

            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-xs"
              aria-label={conversationText.send}
              title={conversationText.send}
              disabled={!checked.success || sending}
              className="ml-auto size-7 rounded-full"
            >
              {sending ? <Spinner /> : <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2} />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>

      <FilePickerDialog
        open={picking}
        picked={writing.files}
        max={MESSAGE_FILES_MAX}
        onDone={(files) => {
          setPicking(false);
          if (files) write({ ...writing, files });
        }}
      />
    </>
  );
}
