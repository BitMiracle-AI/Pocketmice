import { FILE_DESCRIPTION_MAX_LENGTH } from '@pocketmice/contract/domains/file';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useLastGiven } from '@/hooks/useLastGiven';
import { type DriveFile, describeFile } from './files';
import { fileText } from './text';

/**
 * The dialog the description of a file or a folder is written in: what it is, in the words of whoever writes it
 * down. Saved empty, it has none. It is open while there is a file to describe; onClose is called when the
 * description was saved, and when the person gave up.
 */
export function DescriptionDialog({
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
      <DialogContent>{shown && <DescriptionForm spaceId={spaceId} file={shown} onDone={onClose} />}</DialogContent>
    </Dialog>
  );
}

function DescriptionForm({ spaceId, file, onDone }: { spaceId: string; file: DriveFile; onDone: () => void }) {
  const [text, setText] = useState(file.description);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const failed = await describeFile(spaceId, file, text);
    setBusy(false);
    if (failed !== null) return setProblem(failed);
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="contents">
      <DialogHeader>
        <DialogTitle className="break-words">{fileText.describeTitle(file.name)}</DialogTitle>
        <DialogDescription>{fileText.describeHint}</DialogDescription>
      </DialogHeader>
      <Field data-invalid={problem !== null || undefined}>
        <Textarea
          autoFocus
          aria-label={fileText.describeLabel}
          maxLength={FILE_DESCRIPTION_MAX_LENGTH}
          value={text}
          aria-invalid={problem !== null || undefined}
          className="max-h-60 min-h-24"
          onChange={(event) => {
            setText(event.target.value);
            setProblem(null);
          }}
          // Enter starts a new line, as it does wherever several lines are typed; with Ctrl or Cmd it saves
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit();
          }}
        />
        {problem !== null && <FieldError>{problem}</FieldError>}
      </Field>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{fileText.cancel}</DialogClose>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {fileText.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
