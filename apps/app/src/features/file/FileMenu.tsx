import {
  Delete02Icon,
  FolderTransferIcon,
  MoreHorizontalIcon,
  NoteEditIcon,
  PencilEdit02Icon
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import type { DriveFile } from './files';
import { fileText } from './text';

/** What the menu of a row offers: each changes the file or the folder, so the menu is there for an editor */
export type FileAction = 'rename' | 'describe' | 'move' | 'trash';

/**
 * The menu at the end of a row: what an editor can do with the file or the folder. onPick is told what was
 * picked; the page does it. className is for the button that opens the menu.
 */
export function FileMenu({
  file,
  onPick,
  className
}: {
  file: DriveFile;
  onPick: (action: FileAction) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={fileText.more(file.name)} className={className} />}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onClick={() => onPick('rename')}>
          <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
          {fileText.rename}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick('describe')}>
          <HugeiconsIcon icon={NoteEditIcon} strokeWidth={2} />
          {file.description ? fileText.editDescription : fileText.addDescription}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick('move')}>
          <HugeiconsIcon icon={FolderTransferIcon} strokeWidth={2} />
          {fileText.move}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onPick('trash')}>
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          {fileText.toTrash}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
