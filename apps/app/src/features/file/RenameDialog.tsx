import { FILE_NAME_MAX_LENGTH } from '@pocketmice/contract/domains/file';
import { type FormEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useLastGiven } from '@/hooks/useLastGiven';
import { stemLength } from './fileName';
import { type DriveFile, renameFile } from './files';
import { fileText } from './text';

/**
 * The dialog a file or a folder is given another name in. It is open while there is a file to rename; onClose is
 * called when it was renamed, and when the person gave up.
 */
export function RenameDialog({
  spaceId,
  file,
  onClose
}: {
  spaceId: string;
  file: DriveFile | null;
  onClose: () => void;
}) {
  const shown = useLastGiven(file);
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      {/* What is typed is kept inside the dialog: closed, it is gone, and the next file starts from its own name */}
      <DialogContent>{shown && <RenameForm spaceId={spaceId} file={shown} onDone={onClose} />}</DialogContent>
    </Dialog>
  );
}

function RenameForm({ spaceId, file, onDone }: { spaceId: string; file: DriveFile; onDone: () => void }) {
  const [name, setName] = useState(file.name);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const failed = await renameFile(spaceId, file, name);
    setBusy(false);
    if (failed !== null) return setProblem(failed);
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="contents">
      <DialogHeader>
        <DialogTitle>{fileText.renameTitle}</DialogTitle>
      </DialogHeader>
      <Field data-invalid={problem !== null || undefined}>
        <FieldLabel htmlFor="rename-name">{fileText.nameLabel}</FieldLabel>
        <Input
          id="rename-name"
          autoFocus
          autoComplete="off"
          maxLength={FILE_NAME_MAX_LENGTH}
          value={name}
          aria-invalid={problem !== null || undefined}
          // The part before the extension is selected to begin with: typing replaces it, and .pdf stays
          onFocus={(event) => {
            if (selected.current) return;
            selected.current = true;
            event.target.setSelectionRange(0, file.kind === 'folder' ? file.name.length : stemLength(file.name));
          }}
          onChange={(event) => {
            setName(event.target.value);
            setProblem(null);
          }}
        />
        {problem !== null && <FieldError>{problem}</FieldError>}
      </Field>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{fileText.cancel}</DialogClose>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {fileText.renameSave}
        </Button>
      </DialogFooter>
    </form>
  );
}
