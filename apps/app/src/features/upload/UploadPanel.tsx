import { Cancel01Icon, CloudUploadIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { MAX_FILE_BYTES } from '@pocketmice/contract/domains/file';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { FileIcon } from '@/features/file/FileIcon';
import { failureText } from '@/lib/api';
import { formatSize } from '@/lib/format';
import { uploadText } from './text';
import type { Upload, UploadFailure } from './uploadQueue';
import {
  cancelUpload,
  clearUploads,
  decideUpload,
  retryUpload,
  setUploadsOpen,
  useUploads,
  useUploadsOpen
} from './uploads';

/** What to tell a person about an upload that failed */
function failureSentence(failure: UploadFailure): string {
  const tooLarge = uploadText.tooLarge(formatSize(MAX_FILE_BYTES));
  // The server says the same of a body it will not take as this side says before sending one
  if (failure === 'INPUT_TOO_LARGE') return tooLarge;
  return failureText(failure, {
    TOO_LARGE: tooLarge,
    NOT_FOUND: uploadText.folderGone,
    CONFLICT: uploadText.changedMeanwhile,
    SPACE_STORAGE_LIMIT_EXCEEDED: uploadText.spaceNoRoom,
    MEMBER_STORAGE_LIMIT_EXCEEDED: uploadText.memberNoRoom
  });
}

/**
 * The uploads in hand: one button that says where they stand, and opens the list of them. They do not belong to
 * the folder they go to: they go on while the person looks at another folder or another page, so the button is
 * part of whatever frames the page (the sidebar, or the bar of a page that has none) and not of any page.
 * render is the button itself, with nothing in it; side is where the list opens from it. Whoever puts it
 * somewhere leaves it out while there are no uploads (useUploads).
 * The list opens by itself when something is added to it and when an upload needs the person (uploads.ts says
 * when); whether it is open is kept with the uploads, so it is the same list whichever button shows it.
 */
export function UploadPanel({ render, side }: { render: ReactElement; side: 'top' | 'right' | 'bottom' }) {
  const uploads = useUploads();
  const open = useUploadsOpen();

  const count = (...states: Upload['state'][]) => uploads.filter((upload) => states.includes(upload.state)).length;
  const going = count('waiting', 'sending');
  const taken = count('taken');
  const failed = count('failed');

  // What the button says is what still needs the person, the most pressing first
  const title =
    going > 0
      ? uploadText.uploading(going)
      : taken > 0
        ? uploadText.needDecision(taken)
        : failed > 0
          ? uploadText.notUploaded(failed)
          : uploadText.uploaded(uploads.length);

  return (
    <Popover open={open} onOpenChange={setUploadsOpen}>
      <PopoverTrigger render={render}>
        {going > 0 ? <Spinner /> : <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={2} />}
        <span>{title}</span>
      </PopoverTrigger>
      <PopoverContent side={side} align="end" className="w-96 max-w-[calc(100vw-1rem)]">
        <PopoverHeader className="flex-row items-center justify-between">
          <PopoverTitle>{uploadText.title}</PopoverTitle>
          {going === 0 && taken === 0 && (
            <Button variant="ghost" size="sm" onClick={clearUploads}>
              {uploadText.clear}
            </Button>
          )}
        </PopoverHeader>
        <ItemGroup className="max-h-80 overflow-y-auto">
          {uploads.map((upload) => (
            <UploadItem key={upload.id} upload={upload} />
          ))}
        </ItemGroup>
      </PopoverContent>
    </Popover>
  );
}

function UploadItem({ upload }: { upload: Upload }) {
  const share = upload.size === 0 ? 1 : upload.sent / upload.size;
  const going = upload.state === 'waiting' || upload.state === 'sending';

  return (
    <Item size="xs" variant="outline">
      <ItemMedia variant="icon">
        <FileIcon name={upload.name} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full">
          <span className="truncate">{upload.name}</span>
        </ItemTitle>
        {upload.state === 'waiting' && <ItemDescription>{uploadText.waiting}</ItemDescription>}
        {upload.state === 'sending' && (
          <>
            <ItemDescription>{uploadText.progress(formatSize(upload.sent), formatSize(upload.size))}</ItemDescription>
            <Progress aria-label={upload.name} value={share * 100} />
          </>
        )}
        {upload.state === 'done' && (
          <ItemDescription>
            {upload.asVersion ? uploadText.doneAsVersion : uploadText.doneAsFile} · {formatSize(upload.size)}
          </ItemDescription>
        )}
        {upload.state === 'taken' && (
          <ItemDescription>{upload.canBeVersion ? uploadText.taken : uploadText.takenByFolder}</ItemDescription>
        )}
        {upload.state === 'failed' && upload.failure && <FieldError>{failureSentence(upload.failure)}</FieldError>}
      </ItemContent>

      {(going || upload.state === 'failed') && (
        <ItemActions>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={going ? uploadText.cancel(upload.name) : uploadText.dismiss(upload.name)}
            title={going ? uploadText.cancel(upload.name) : uploadText.dismiss(upload.name)}
            onClick={() => cancelUpload(upload.id)}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        </ItemActions>
      )}

      {upload.state === 'taken' && (
        <ItemActions className="basis-full flex-wrap">
          {upload.canBeVersion && (
            <Button size="xs" onClick={() => decideUpload(upload.id, 'version')}>
              {uploadText.asVersion}
            </Button>
          )}
          <Button
            size="xs"
            variant={upload.canBeVersion ? 'outline' : 'default'}
            onClick={() => decideUpload(upload.id, 'both')}
          >
            {uploadText.keepBoth}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => decideUpload(upload.id, 'skip')}>
            {uploadText.skip}
          </Button>
        </ItemActions>
      )}

      {upload.state === 'failed' && upload.failure !== 'TOO_LARGE' && (
        <ItemActions className="basis-full">
          <Button size="xs" variant="outline" onClick={() => retryUpload(upload.id)}>
            {uploadText.tryAgain}
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}
