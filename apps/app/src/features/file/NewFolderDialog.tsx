import { FILE_NAME_MAX_LENGTH } from '@pocketmice/contract/domains/file';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { makeFolder } from './files';
import { fileText } from './text';

/**
 * The dialog a folder is made in: in the folder parentId, or directly in the space when that is null. Once it is
 * made the dialog closes, and the list the page shows has it.
 */
export function NewFolderDialog({
  spaceId,
  parentId,
  open,
  onOpenChange
}: {
  spaceId: string;
  parentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setName('');
    setProblem(null);
    onOpenChange(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const failed = await makeFolder(spaceId, parentId, name);
    setBusy(false);
    if (failed !== null) return setProblem(failed);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>{fileText.folderTitle}</DialogTitle>
          </DialogHeader>
          <Field data-invalid={problem !== null || undefined}>
            <FieldLabel htmlFor="new-folder-name">{fileText.nameLabel}</FieldLabel>
            <Input
              id="new-folder-name"
              autoFocus
              autoComplete="off"
              maxLength={FILE_NAME_MAX_LENGTH}
              value={name}
              placeholder={fileText.folderPlaceholder}
              aria-invalid={problem !== null || undefined}
              onChange={(event) => {
                setName(event.target.value);
                setProblem(null);
              }}
            />
            {problem !== null && <FieldError>{problem}</FieldError>}
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="secondary" />}>{fileText.cancel}</DialogClose>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {fileText.folderCreate}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
