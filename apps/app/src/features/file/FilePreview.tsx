import { ArrowExpand01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { failureOfThrown } from '@pocketmice/client/api';
import { getFileDownloadUrl } from '@pocketmice/contract/domains/file';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import { type ReactNode, useEffect, useState } from 'react';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { ApiFailure, call, thrownText } from '@/lib/api';
import { formatSize } from '@/lib/format';
import { FileIcon } from './FileIcon';
import type { DriveFile } from './files';
import { dataAddressOf, type Preview, previewOf, TEXT_PREVIEW_BYTES, textOf } from './preview';
import { fileText } from './text';

// What a file holds, shown where the file is picked: the start of a text, or a picture (preview.ts says which).
// The page asks the api where the bytes are (getFileDownloadUrl), fetches them there, from the storage, and draws
// them itself.

/** How long the bytes of a preview nobody is looking at are kept, in milliseconds */
const KEPT_FOR_MS = 60_000;

/**
 * The bytes of one version of a file: its first bytes, or all of it when bytes is null.
 * They are kept under the version and not under the space, as the answers of the operations are: a version never
 * changes, so what was read of one stays right whatever happens in the space, and is not fetched again each time
 * something there changes.
 */
function contentQuery(spaceId: string, fileId: string, versionId: string, bytes: number | null) {
  return queryOptions<ArrayBuffer, ApiFailure<'NOT_FOUND'>>({
    queryKey: ['fileContent', versionId, bytes],
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: KEPT_FOR_MS,
    queryFn: async ({ signal }) => {
      // Whether the person may read the file is settled here, by the api. The address it answers with is asked
      // for each time the bytes are fetched and is not kept: it works for a few minutes
      const asked = await call(getFileDownloadUrl, { spaceId, fileId, versionId });
      if (!asked.ok) throw new ApiFailure<'NOT_FOUND'>(asked.code, asked.message);

      let response: Response;
      try {
        // The address is the storage's, and holding it is all the storage asks: nothing of the person goes along
        response = await fetch(asked.data.url, {
          headers: bytes === null ? undefined : { range: `bytes=0-${bytes - 1}` },
          signal
        });
        if (response.ok) return await response.arrayBuffer();
      } catch (thrown) {
        const failure = failureOfThrown(thrown, 'the preview');
        throw new ApiFailure<'NOT_FOUND'>(failure.code, failure.message);
      }
      // What a storage answers a refusal with is its own, and not an error of the api
      throw new ApiFailure<'NOT_FOUND'>(
        'BAD_RESPONSE',
        `The storage answered the preview with status ${response.status}.`
      );
    }
  });
}

/**
 * The preview of a file as it is now: a box of one shape whatever the file is, and, when there is something to
 * show, a button that shows it large, in a dialog.
 */
export function FilePreview({ file }: { file: DriveFile }) {
  const [large, setLarge] = useState(false);
  const version = file.version;
  if (!version) return null;
  const preview = previewOf(file.name, version.size);

  return (
    <>
      <AspectRatio ratio={4 / 3} className="overflow-hidden rounded-xl bg-muted">
        {preview.kind === 'none' ? (
          <Quiet>
            <FileIcon name={file.name} className="size-10" />
            {fileText[NONE[preview.why]]}
          </Quiet>
        ) : (
          <>
            <Content file={file} versionId={version.id} preview={preview} className="size-full" />
            <Button
              variant="secondary"
              size="icon-sm"
              className="absolute top-2 right-2"
              aria-label={fileText.previewOpen}
              title={fileText.previewOpen}
              onClick={() => setLarge(true)}
            >
              <HugeiconsIcon icon={ArrowExpand01Icon} strokeWidth={2} />
            </Button>
          </>
        )}
      </AspectRatio>

      <Dialog open={large} onOpenChange={setLarge}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="pr-10 leading-normal break-words">{file.name}</DialogTitle>
            {preview.kind === 'text' && preview.cut && (
              <DialogDescription>{fileText.previewCut(formatSize(TEXT_PREVIEW_BYTES))}</DialogDescription>
            )}
          </DialogHeader>
          {large && preview.kind !== 'none' && (
            <div className="overflow-hidden rounded-xl bg-muted">
              <Content file={file} versionId={version.id} preview={preview} className="h-[70vh] w-full" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The sentence for a file that is not shown, by why it is not */
const NONE = { kind: 'noPreview', large: 'previewTooLarge', empty: 'previewEmpty' } as const;

/** What a preview says in place of the content: that it is on its way, that there is none, that it failed */
function Quiet({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** The content itself, in a box of the size className gives */
function Content({
  file,
  versionId,
  preview,
  className
}: {
  file: DriveFile;
  versionId: string;
  preview: Exclude<Preview, { kind: 'none' }>;
  className: string;
}) {
  const space = useCurrentSpace();
  const content = useQuery(contentQuery(space.id, file.id, versionId, preview.kind === 'text' ? preview.bytes : null));

  if (content.isPending) {
    return (
      <div className={className}>
        <Quiet>
          <Spinner />
        </Quiet>
      </div>
    );
  }
  if (content.isError) {
    return (
      <div className={className}>
        <Quiet>
          <FileIcon name={file.name} className="size-10" />
          <span role="alert">{thrownText(content.error)}</span>
        </Quiet>
      </div>
    );
  }
  if (preview.kind === 'image')
    return <Picture bytes={content.data} preview={preview} name={file.name} className={className} />;
  return (
    <pre
      className={cn('overflow-auto p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap', className)}
    >
      {textOf(content.data, preview.cut)}
    </pre>
  );
}

/**
 * A picture drawn from its bytes. The browser is told what they are by the type the name of the file stands for:
 * the api sends every content as plain bytes. One that can carry a script is drawn from a data: address, and the
 * others from an address of the bytes the page holds (see Preview).
 */
function Picture({
  bytes,
  preview,
  name,
  className
}: {
  bytes: ArrayBuffer;
  preview: Extract<Preview, { kind: 'image' }>;
  name: string;
  className: string;
}) {
  const { type, scripted } = preview;
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    if (scripted) {
      setAddress(dataAddressOf(bytes, type));
      return;
    }
    const made = URL.createObjectURL(new Blob([bytes], { type }));
    setAddress(made);
    return () => URL.revokeObjectURL(made);
  }, [bytes, type, scripted]);
  return address && <img src={address} alt={name} className={cn('object-contain', className)} />;
}
