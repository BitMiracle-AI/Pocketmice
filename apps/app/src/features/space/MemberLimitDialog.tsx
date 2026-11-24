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
import { Spinner } from '@/components/ui/spinner';
import { useLastGiven } from '@/hooks/useLastGiven';
import { formatSize } from '@/lib/format';
import { commonText } from '@/lib/text';
import { type Member, setMemberLimit } from './members';
import { StorageLimitField } from './StorageLimitField';
import { limitOf, typedOf } from './storageLimit';
import { spaceText } from './text';

/**
 * The dialog the owner sets in how much a member may hold in the space. It is open while there is a member to set
 * it for, who may be the owner themselves; onClose is called when it was set, and when the owner gave up.
 */
export function MemberLimitDialog({
  spaceId,
  member,
  onClose
}: {
  spaceId: string;
  member: Member | null;
  onClose: () => void;
}) {
  const shown = useLastGiven(member);
  return (
    <Dialog open={member !== null} onOpenChange={(open) => !open && onClose()}>
      {/* What is typed is kept inside the dialog: closed, it is gone, and the next member starts from their own limit */}
      <DialogContent>{shown && <MemberLimitForm spaceId={spaceId} member={shown} onDone={onClose} />}</DialogContent>
    </Dialog>
  );
}

function MemberLimitForm({ spaceId, member, onDone }: { spaceId: string; member: Member; onDone: () => void }) {
  const [typed, setTyped] = useState(() => typedOf(member.storageLimit));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const limit = limitOf(typed);
    if (limit === 'invalid') return setProblem(spaceText.limitInvalid);
    setBusy(true);
    const failed = await setMemberLimit(spaceId, member.userId, limit);
    setBusy(false);
    if (failed !== null) return setProblem(failed);
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="contents">
      <DialogHeader>
        <DialogTitle className="break-words">{spaceText.memberLimitTitle(member.name)}</DialogTitle>
        <DialogDescription className="break-words">
          {spaceText.memberHoldsNow(member.name, formatSize(member.storageSize))}
        </DialogDescription>
      </DialogHeader>
      <StorageLimitField
        id="member-limit"
        autoFocus
        hint={spaceText.memberLimitHint}
        problem={problem}
        typed={typed}
        onTyped={(next) => {
          setTyped(next);
          setProblem(null);
        }}
      />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="secondary" />}>{spaceText.cancel}</DialogClose>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {commonText.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
