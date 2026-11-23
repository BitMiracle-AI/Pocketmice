import { Delete02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { KeyMark } from '@/components/KeyMark';
import { PersonAvatar } from '@/components/PersonAvatar';
import {
  Attachment,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger
} from '@/components/ui/attachment';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { MessageContent, MessageHeader, Message as MessageLine } from '@/components/ui/message';
import { FileIcon } from '@/features/file/FileIcon';
import { formatMoment, formatTime } from '@/lib/format';
import type { Message } from './conversations';
import { conversationText } from './text';

/**
 * One message of a conversation. What the person typed themselves is at the right; what anyone else sent, and what
 * an agent sent, their own agents too, is at the left, under who sent it: a person by their name, an agent by the
 * API key it sent through and the person it spoke as.
 * head says that the message begins a run, and is shown with who sent it and when. nameOf names a member that is
 * mentioned. onDelete is there when the person may delete the message.
 * A file the message points at opens beside the conversation, where it is read next to what is said about it.
 */
export function MessageRow({
  spaceId,
  conversationId,
  message,
  head,
  mine,
  nameOf,
  onDelete
}: {
  spaceId: string;
  conversationId: string;
  message: Message;
  head: boolean;
  mine: boolean;
  nameOf: (userId: string) => string;
  onDelete: (() => void) | undefined;
}) {
  const { user, apiKey } = message;
  const deleted = message.deletedAt !== null;
  const time = (
    <time dateTime={message.createdAt} title={formatMoment(message.createdAt)} className="font-normal tabular-nums">
      {formatTime(message.createdAt)}
    </time>
  );

  return (
    <MessageLine align={mine ? 'end' : 'start'} className={cn('group/row', head ? 'pt-4' : 'pt-1')}>
      {!mine && (
        <div className="flex w-8 shrink-0 justify-center pt-5">
          {head && (apiKey ? <KeyMark /> : <PersonAvatar name={user.name} />)}
        </div>
      )}

      <MessageContent className="gap-1">
        {head && (
          <MessageHeader
            className="gap-1.5"
            title={apiKey ? conversationText.viaKey(user.name, apiKey.name) : undefined}
          >
            {!mine && (
              <span className="min-w-0 truncate">
                {apiKey && (
                  <>
                    <span className="text-foreground">{apiKey.name}</span>
                    <span aria-hidden="true" className="px-1.5 text-muted-foreground/50">
                      ·
                    </span>
                  </>
                )}
                <span className={cn(!apiKey && 'text-foreground')}>{user.name}</span>
              </span>
            )}
            {time}
          </MessageHeader>
        )}

        <div className={cn('flex max-w-full min-w-0 items-center gap-1', mine && 'flex-row-reverse')}>
          {deleted ? (
            <Bubble variant="outline">
              <BubbleContent className="text-muted-foreground italic">{conversationText.deletedMessage}</BubbleContent>
            </Bubble>
          ) : (
            <Bubble variant={mine ? 'default' : apiKey ? 'tinted' : 'muted'} className="max-w-[min(80%,40rem)]">
              <BubbleContent className="whitespace-pre-wrap">
                {message.mentionedUserIds.length > 0 && (
                  <span className={cn('block font-medium', !mine && 'text-primary dark:text-chart-1')}>
                    {message.mentionedUserIds.map((userId) => conversationText.at(nameOf(userId))).join(' ')}
                  </span>
                )}
                {message.text}
              </BubbleContent>
            </Bubble>
          )}
          {onDelete && !deleted && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={conversationText.deleteMessage}
              title={conversationText.deleteMessage}
              onClick={onDelete}
              className="shrink-0 text-muted-foreground group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0"
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </Button>
          )}
        </div>

        {message.files.length > 0 && (
          <ul className={cn('flex max-w-full min-w-0 flex-wrap gap-1.5', mine && 'justify-end')}>
            {message.files.map(({ id, file }) => (
              <li key={id} className="max-w-full min-w-0">
                {file ? (
                  <Attachment size="xs" className="min-w-0">
                    <AttachmentMedia>
                      <FileIcon name={file.name} folder={file.kind === 'folder'} />
                    </AttachmentMedia>
                    <AttachmentContent className="pr-1.5">
                      <AttachmentTitle title={file.path}>{file.name}</AttachmentTitle>
                    </AttachmentContent>
                    <AttachmentTrigger
                      aria-label={conversationText.openFile(file.name)}
                      render={
                        <Link
                          to="/spaces/$spaceId/conversations/$conversationId"
                          params={{ spaceId, conversationId }}
                          search={{ file: id }}
                        />
                      }
                    />
                  </Attachment>
                ) : (
                  // It was put in the trash, or deleted for good: the message still says it pointed at something
                  <Attachment size="xs" state="idle" className="min-w-0">
                    <AttachmentMedia>
                      <FileIcon name="" />
                    </AttachmentMedia>
                    <AttachmentContent className="pr-1.5 text-muted-foreground italic">
                      {conversationText.fileGone}
                    </AttachmentContent>
                  </Attachment>
                )}
              </li>
            ))}
          </ul>
        )}
      </MessageContent>
    </MessageLine>
  );
}
