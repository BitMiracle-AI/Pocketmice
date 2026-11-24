import { ArrowExpand01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { failureOfThrown } from '@pocketmice/client/api';
import { DOWNLOAD_URL_SECONDS, getFileDownloadUrl } from '@pocketmice/contract/domains/file';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { Rows } from '@/components/Rows';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { ApiFailure, call, thrownText } from '@/lib/api';
import { formatSize } from '@/lib/format';
import { FileIcon } from './FileIcon';
import type { DriveFile } from './files';
import {
  dataAddressOf,
  isMarkdown,
  isPdf,
  languageOf,
  type Preview,
  previewOf,
  separatorOf,
  TEXT_PREVIEW_BYTES,
  textOf
} from './preview';
import { rowsOf } from './rows';
import { fileText } from './text';

// What a file holds, shown where the file is picked: the start of a text, a picture, a PDF, or a video or a sound
// (preview.ts says which). It is shown twice: small, in a box beside what else is known of the file, and large,
// in a dialog.
// The box is kept cheap: a text is plain there, and nothing is fetched for it of a PDF, a video or a sound. Large,
// a text is coloured as the language its name says, one written in Markdown is laid out as the document it is,
// one that is a table (a CSV) as a table, a PDF is read in the reader the browser has, and a video or a sound is
// played by the player it has.
// The page asks the api where the bytes are (getFileDownloadUrl), and they are fetched there, from the storage:
// by the page, for what it draws itself, and by the player, a part at a time, for what is played.

/** How long the bytes of a preview nobody is looking at are kept, in milliseconds */
const KEPT_FOR_MS = 60_000;

/**
 * Asks the api where the bytes of one version of a file are. Whether the person may read the file is settled
 * here, by the api. The address it answers with is asked for each time something is to be fetched from it, and
 * is kept no longer than that takes: it works for a few minutes.
 */
async function addressOf(spaceId: string, fileId: string, versionId: string): Promise<string> {
  const asked = await call(getFileDownloadUrl, { spaceId, fileId, versionId });
  if (!asked.ok) throw new ApiFailure<'NOT_FOUND'>(asked.code, asked.message);
  return asked.data.url;
}

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
      const address = await addressOf(spaceId, fileId, versionId);
      let response: Response;
      try {
        // The address is the storage's, and holding it is all the storage asks: nothing of the person goes along
        response = await fetch(address, {
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
 * The address a player plays one version of a file from. It is kept only while a player shows it: an address
 * works for a few minutes, so the one of an earlier look at the file is of no use to the next.
 */
function playedFromQuery(spaceId: string, fileId: string, versionId: string) {
  return queryOptions<string, ApiFailure<'NOT_FOUND'>>({
    queryKey: ['filePlayedFrom', versionId],
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    queryFn: () => addressOf(spaceId, fileId, versionId)
  });
}

/**
 * Whether an address the api answered with at answeredAt (as the cache tells it, dataUpdatedAt) is past its time,
 * or close to it.
 * - Both times are read off the clock that tells the time of day, which goes on while the machine sleeps. The
 *   clock a page has of its own (performance.now) stands still then in most browsers: by it, a player found
 *   again the next morning would have an address a minute old.
 * - The last tenth of its time is not counted on: an address is a little older than the answer it came in, and
 *   the clocks of the api, which signs it, and of the storage, which reads it, need not agree.
 */
const isSpent = (answeredAt: number) => Date.now() - answeredAt >= DOWNLOAD_URL_SECONDS * 1000 * 0.9;

// What colours code and lays a document out is fetched when a text is first shown large, and not with the page:
// it is several times the size of everything else the pane of a file needs.
const Code = lazy(() => import('@/components/Code').then((module) => ({ default: module.Code })));
const Markdown = lazy(() => import('@/components/Markdown').then((module) => ({ default: module.Markdown })));

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
            {preview.kind === 'pdf' || preview.kind === 'media' ? (
              <Quiet>
                <FileIcon name={file.name} className="size-10" />
                {preview.kind === 'pdf' ? fileText.previewPdf : fileText.previewMedia}
              </Quiet>
            ) : (
              <Small file={file} versionId={version.id} preview={preview} className="size-full" />
            )}
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
            <Large file={file} versionId={version.id} preview={preview} className="h-[70vh] w-full" />
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

/** A box of the size className gives that says the content is on its way */
function Waiting({ className }: { className: string }) {
  return (
    <div className={className}>
      <Quiet>
        <Spinner />
      </Quiet>
    </div>
  );
}

/** A box of the size className gives that says, in place of the content of the file, why it is not shown */
function Failed({ file, className, children }: { file: DriveFile; className: string; children: ReactNode }) {
  return (
    <div className={className}>
      <Quiet>
        <FileIcon name={file.name} className="size-10" />
        <span role="alert">{children}</span>
      </Quiet>
    </div>
  );
}

/** What can be shown of a file: every way of showing one but none */
type Shown = Exclude<Preview, { kind: 'none' }>;

/** What the page draws from bytes it fetches itself: every way of showing a file but playing it */
type Drawn = Exclude<Shown, { kind: 'media' }>;

/**
 * The bytes a preview is drawn from, in a box of the size className gives: while they are on their way the box
 * says so, when they could not be had it says why, and once they are here it holds what draw makes of them.
 */
function Fetched({
  file,
  versionId,
  preview,
  className,
  draw
}: {
  file: DriveFile;
  versionId: string;
  preview: Drawn;
  className: string;
  draw: (bytes: ArrayBuffer) => ReactNode;
}) {
  const space = useCurrentSpace();
  const content = useQuery(contentQuery(space.id, file.id, versionId, preview.kind === 'text' ? preview.bytes : null));

  if (content.isPending) return <Waiting className={className} />;
  if (content.isError) {
    return (
      <Failed file={file} className={className}>
        {thrownText(content.error)}
      </Failed>
    );
  }
  return draw(content.data);
}

/** The content in the small box: a text as it is, a picture. Nothing else is fetched for the box */
function Small({
  file,
  versionId,
  preview,
  className
}: {
  file: DriveFile;
  versionId: string;
  preview: Exclude<Drawn, { kind: 'pdf' }>;
  className: string;
}) {
  return (
    <Fetched
      file={file}
      versionId={versionId}
      preview={preview}
      className={className}
      draw={(bytes) =>
        preview.kind === 'image' ? (
          <Picture bytes={bytes} preview={preview} name={file.name} className={className} />
        ) : (
          <pre
            className={cn(
              'overflow-auto p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap',
              className
            )}
          >
            {textOf(bytes, preview.cut)}
          </pre>
        )
      }
    />
  );
}

/**
 * The content shown large. A text written in Markdown is laid out as the document it is, and one that is a table
 * as a table, each with its text as it is written one tab away; any other text is coloured as the language its
 * name says. A picture, a PDF and what is played are on a ground of their own.
 */
function Large({
  file,
  versionId,
  preview,
  className
}: {
  file: DriveFile;
  versionId: string;
  preview: Shown;
  className: string;
}) {
  // Another version is another thing to play: the player begins anew for it
  if (preview.kind === 'media') {
    return <Player key={versionId} file={file} versionId={versionId} preview={preview} className={className} />;
  }
  return (
    <Fetched
      file={file}
      versionId={versionId}
      preview={preview}
      className={className}
      draw={(bytes) => {
        if (preview.kind === 'image') {
          return (
            <div className="overflow-hidden rounded-xl bg-muted">
              <Picture bytes={bytes} preview={preview} name={file.name} className={className} />
            </div>
          );
        }
        if (preview.kind === 'pdf') {
          return (
            <div className="overflow-hidden rounded-xl bg-muted">
              <Pdf bytes={bytes} file={file} className={className} />
            </div>
          );
        }
        const text = textOf(bytes, preview.cut);
        const waiting = <Waiting className={className} />;
        const separator = separatorOf(file.name);
        if (separator !== null) {
          return (
            <TwoWays
              laidOut={fileText.previewTable}
              first={<Rows rows={rowsOf(text, separator, preview.cut)} className={className} />}
              source={
                <Suspense fallback={waiting}>
                  <Code text={text} language={null} className={className} />
                </Suspense>
              }
            />
          );
        }
        if (isMarkdown(file.name)) {
          return (
            <TwoWays
              laidOut={fileText.previewDocument}
              first={
                <Suspense fallback={waiting}>
                  <Markdown text={text} className={cn('overflow-auto px-1 py-2', className)} />
                </Suspense>
              }
              source={
                <Suspense fallback={waiting}>
                  <Code text={text} language="markdown" className={className} />
                </Suspense>
              }
            />
          );
        }
        return (
          <Suspense fallback={waiting}>
            <Code text={text} language={languageOf(file.name)} className={className} />
          </Suspense>
        );
      }}
    />
  );
}

/**
 * A text shown two ways, a tab each: first laid out as what it is written to be, under the name laidOut, and
 * then as it is written
 */
function TwoWays({ laidOut, first, source }: { laidOut: string; first: ReactNode; source: ReactNode }) {
  return (
    <Tabs defaultValue="laidOut">
      <TabsList>
        <TabsTrigger value="laidOut">{laidOut}</TabsTrigger>
        <TabsTrigger value="source">{fileText.previewSource}</TabsTrigger>
      </TabsList>
      <TabsContent value="laidOut">{first}</TabsContent>
      <TabsContent value="source">{source}</TabsContent>
    </Tabs>
  );
}

/**
 * A PDF, in the reader the browser has for one: its pages, its search, its links. The browser is told the bytes
 * are a PDF, so they have to be one: bytes that do not begin as a PDF does are not handed to it.
 */
function Pdf({ bytes, file, className }: { bytes: ArrayBuffer; file: DriveFile; className: string }) {
  const [address, setAddress] = useState<string | null>(null);
  const pdf = isPdf(bytes);
  useEffect(() => {
    if (!pdf) return;
    const made = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    setAddress(made);
    return () => URL.revokeObjectURL(made);
  }, [bytes, pdf]);

  if (!pdf) {
    return (
      <Failed file={file} className={className}>
        {fileText.previewNotPdf}
      </Failed>
    );
  }
  return address && <iframe src={address} title={file.name} className={cn('border-0', className)} />;
}

/**
 * A video or a sound, played by the player the browser has. The player fetches from the storage itself, at the
 * address the api answered with, a part at a time as the playing needs it: the page holds nothing of the file.
 * - The player is told what the file is by the type its name stands for (preview.ts): the storage says of every
 *   object that it is bytes of no particular kind, and a browser that goes by what it is told (Safari's, for
 *   some kinds) would not play it.
 * - An address works for a few minutes, and playing may take longer. Fetching from one whose time is up, a player
 *   gives up (Chrome), gives up and then tries what it was given once more (Firefox), or waits without end
 *   (Safari's). So when the player gives up, or has run out of what to play, and its address is past its time,
 *   the api is asked for another, and the playing goes on from where it was. A player that gives up while its
 *   address still works could not play the file.
 */
function Player({
  file,
  versionId,
  preview,
  className
}: {
  file: DriveFile;
  versionId: string;
  preview: Extract<Preview, { kind: 'media' }>;
  className: string;
}) {
  const space = useCurrentSpace();
  const from = useQuery(playedFromQuery(space.id, file.id, versionId));
  const player = useRef<HTMLMediaElement | null>(null);
  /** Where the playing was, and whether it was going, when another address was asked for: taken up once it is here */
  const left = useRef<{ at: number; playing: boolean } | null>(null);
  const [unplayable, setUnplayable] = useState(false);
  const answeredAt = from.dataUpdatedAt;

  // A player reads where to fetch from when it is made, and again only when told to: when another address,
  // asked for because the playing had stopped, is here
  useEffect(() => {
    if (answeredAt && left.current) player.current?.load();
  }, [answeredAt]);

  if (from.isPending) return <Waiting className={className} />;
  if (from.isError) {
    return (
      <Failed file={file} className={className}>
        {thrownText(from.error)}
      </Failed>
    );
  }
  if (unplayable) {
    return (
      <Failed file={file} className={className}>
        {fileText.previewNotPlayable}
      </Failed>
    );
  }

  /** Asks for another address when the one in use is past its time, and says whether it did */
  const askAgain = (): boolean => {
    const element = player.current;
    if (!element || !isSpent(answeredAt)) return false;
    // A player may say that it waits and then that it gave up: the place is the one of the first time, since by
    // the second the playing may have been set back to its start
    left.current ??= { at: element.currentTime, playing: !element.paused };
    void from.refetch({ cancelRefetch: false });
    return true;
  };
  /** The player gave up: on what it was playing, or on playing what it was given at all */
  const gaveUp = () => {
    if (!askAgain()) setUnplayable(true);
  };
  const playing = {
    ref: (element: HTMLMediaElement | null) => {
      player.current = element;
    },
    controls: true,
    preload: 'metadata',
    onWaiting: () => {
      askAgain();
    },
    // Said by the player of what it was playing, and by its source when the player can play nothing of what is
    // there: React hands what the source says on to the player
    onError: gaveUp,
    onLoadedMetadata: () => {
      const element = player.current;
      const place = left.current;
      if (!element || !place) return;
      left.current = null;
      element.currentTime = place.at;
      // A browser may refuse to start what the person did not start themselves: the player then stands at the
      // place, and they start it
      if (place.playing) element.play().catch(() => undefined);
    }
  } as const;
  const source = <source src={from.data} type={preview.type} />;

  if (preview.as === 'audio') {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-6 rounded-xl bg-muted p-6 text-muted-foreground',
          className
        )}
      >
        <FileIcon name={file.name} className="size-10" />
        <audio {...playing} className="w-full max-w-xl">
          {source}
        </audio>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl bg-muted">
      <video {...playing} playsInline className={cn('bg-black', className)}>
        {source}
      </video>
    </div>
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
