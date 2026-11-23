import { Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { MAX_FILE_BYTES } from '@pocketmice/contract/domains/file';
import { Button } from '@/components/ui/button';
import { FileIcon } from '@/features/file/FileIcon';
import { failureText } from '@/lib/api';
import { formatSize } from '@/lib/format';
import { uploadText } from './text';
import type { Upload, UploadFailure } from './uploadQueue';
import { cancelUpload, clearUploads, decideUpload, retryUpload, useUploads } from './uploads';

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
 * The uploads in hand, in the bottom right corner of the window. They do not belong to the folder they go to: the
 * panel stays while the person goes to another folder or another page, so it is not part of any page
 * (routes/_app.tsx). With no upload there is no panel.
 * Where there is a sidebar the page is a card with a margin around it, and the panel keeps the same distance from
 * the edge of that card as it has from the edge of a window with no card.
 */
export function UploadPanel() {
  const uploads = useUploads();
  if (uploads.length === 0) return null;

  const count = (...states: Upload['state'][]) => uploads.filter((upload) => states.includes(upload.state)).length;
  const going = count('waiting', 'sending');
  const taken = count('taken');
  const failed = count('failed');
  // What the panel is called says what still needs the person, the most pressing first
  const title =
    going > 0
      ? uploadText.uploading(going)
      : taken > 0
        ? uploadText.needDecision(taken)
        : failed > 0
          ? uploadText.notUploaded(failed)
          : uploadText.uploaded(uploads.length);

  return (
    <section
      aria-label={title}
      className="fixed right-3 bottom-3 z-20 w-92 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lg md:right-5 md:bottom-5"
    >
      <header className="flex h-11 items-center gap-2 pr-2 pl-4">
        <h2 className="flex-1 truncate text-sm font-medium">{title}</h2>
        {going === 0 && taken === 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={uploadText.close}
            onClick={clearUploads}
            className="text-muted-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        )}
      </header>
      <ul className="max-h-72 overflow-auto pb-1.5">
        {uploads.map((upload) => (
          <UploadRow key={upload.id} upload={upload} />
        ))}
      </ul>
    </section>
  );
}

function UploadRow({ upload }: { upload: Upload }) {
  const share = upload.size === 0 ? 1 : upload.sent / upload.size;
  const percent = Math.round(share * 100);
  const going = upload.state === 'waiting' || upload.state === 'sending';

  return (
    <li className="flex gap-3 py-2 pr-2 pl-4">
      <FileIcon name={upload.name} className="mt-px size-4.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex h-5 items-center gap-2 pr-2">
          <span className="min-w-0 flex-1 truncate text-sm">{upload.name}</span>
          {upload.state === 'sending' && <span className="text-xs text-muted-foreground tabular-nums">{percent}%</span>}
          {upload.state === 'waiting' && <span className="text-xs text-muted-foreground">{uploadText.waiting}</span>}
          {upload.state === 'done' && (
            <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
          )}
          {(going || upload.state === 'failed') && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={going ? uploadText.cancel(upload.name) : uploadText.dismiss(upload.name)}
              onClick={() => cancelUpload(upload.id)}
              className="-mr-2 text-muted-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          )}
        </div>

        {upload.state === 'sending' && (
          <div
            role="progressbar"
            aria-label={upload.name}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="my-1 mr-2 h-0.5 overflow-hidden rounded-full bg-foreground/10"
          >
            <div
              className="h-full origin-left rounded-full bg-primary transition-transform duration-150 ease-linear motion-reduce:transition-none dark:bg-chart-2"
              style={{ transform: `scaleX(${share})` }}
            />
          </div>
        )}

        {upload.state === 'done' && (
          <p className="text-xs text-muted-foreground">
            {upload.asVersion ? uploadText.doneAsVersion : uploadText.doneAsFile}
            <span aria-hidden="true" className="px-1.5 text-muted-foreground/50">
              ·
            </span>
            {formatSize(upload.size)}
          </p>
        )}

        {upload.state === 'taken' && (
          <>
            <p className="text-xs text-muted-foreground">
              {upload.canBeVersion ? uploadText.taken : uploadText.takenByFolder}
            </p>
            <div className="-ml-0.5 flex flex-wrap gap-1 pt-0.5">
              {upload.canBeVersion && (
                <Button size="xs" variant="secondary" onClick={() => decideUpload(upload.id, 'version')}>
                  {uploadText.asVersion}
                </Button>
              )}
              <Button
                size="xs"
                variant={upload.canBeVersion ? 'ghost' : 'secondary'}
                onClick={() => decideUpload(upload.id, 'both')}
              >
                {uploadText.keepBoth}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => decideUpload(upload.id, 'skip')}>
                {uploadText.skip}
              </Button>
            </div>
          </>
        )}

        {upload.state === 'failed' && upload.failure && (
          <>
            <p role="alert" className="pr-2 text-xs text-pretty text-destructive">
              {failureSentence(upload.failure)}
            </p>
            {upload.failure !== 'TOO_LARGE' && (
              <div className="-ml-0.5 pt-0.5">
                <Button size="xs" variant="secondary" onClick={() => retryUpload(upload.id)}>
                  {uploadText.tryAgain}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
