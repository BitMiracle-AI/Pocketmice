import { Download04Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { formatSize, formatWhen } from '@/lib/format';
import { downloadFile } from './download';
import { FileIcon } from './FileIcon';
import { type FileAction, FileMenu } from './FileMenu';
import type { DriveFile } from './files';
import { COLUMNS, MEDIUM, ROW, ROW_BUTTON, SIZE, WIDE } from './listLayout';
import { fileText } from './text';

/**
 * One row of a list of files that are where they are: what is in a folder, what was found. (The trash lists what
 * is nowhere, and has rows of its own.)
 * Anywhere on the row opens what the row is: a folder opens as a page of what is in it, a file opens its own page.
 * The row ends with what can be done with it: a file can be downloaded by anyone who sees it, and an editor has a
 * menu that renames it, describes it, moves it and puts it in the trash.
 * wide is what the wide column holds, which differs with the list. onPick is there for an editor: what was picked
 * from the menu of the row.
 */
export function FileRow({
  file,
  spaceId,
  wide,
  onPick
}: {
  file: DriveFile;
  spaceId: string;
  wide: ReactNode;
  onPick: ((action: FileAction) => void) | undefined;
}) {
  const isFolder = file.kind === 'folder';
  return (
    <li className={cn(COLUMNS, ROW)}>
      <div className="flex min-w-0 items-center gap-3">
        <FileIcon name={file.name} folder={isFolder} className="size-4.5" />
        {/* The link is as large as the row: anywhere on the row opens the folder, or the page of the file */}
        <Link
          to="/spaces/$spaceId/files/$fileId"
          params={{ spaceId, fileId: file.id }}
          className="min-w-0 truncate outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/30"
        >
          {file.name}
        </Link>
        {file.description && (
          <span className="hidden min-w-0 shrink-[9999] truncate text-muted-foreground @2xl:block">
            {file.description}
          </span>
        )}
      </div>

      <div className={cn(WIDE, 'text-muted-foreground')}>{wide}</div>
      <span className={cn(MEDIUM, 'text-muted-foreground tabular-nums')}>{formatWhen(file.updatedAt)}</span>
      <span className={cn(SIZE, 'text-muted-foreground tabular-nums')}>
        {file.version && formatSize(file.version.size)}
      </span>

      <div className="flex items-center justify-end gap-0.5">
        {!isFolder && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={fileText.download(file.name)}
            title={fileText.download(file.name)}
            onClick={() => downloadFile(spaceId, file)}
            className={ROW_BUTTON}
          >
            <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
          </Button>
        )}
        {onPick && <FileMenu file={file} onPick={onPick} className={ROW_BUTTON} />}
      </div>
    </li>
  );
}
