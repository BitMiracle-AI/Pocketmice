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
import { Spinner } from '@/components/ui/spinner';
import { SpaceNameField } from './SpaceNameField';
import { spaceText } from './text';
import { useNewSpace } from './useNewSpace';

/** The dialog a space is made in. Once it is made, the dialog closes and the page goes to the new space */
export function NewSpaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const form = useNewSpace(() => onOpenChange(false));
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={form.submit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>{spaceText.dialogTitle}</DialogTitle>
            <DialogDescription>{spaceText.whatASpaceIs}</DialogDescription>
          </DialogHeader>
          <SpaceNameField id="new-space-name" name={form.name} problem={form.problem} onChange={form.setName} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{spaceText.cancel}</DialogClose>
            <Button type="submit" disabled={form.busy}>
              {form.busy && <Spinner data-icon="inline-start" />}
              {spaceText.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
