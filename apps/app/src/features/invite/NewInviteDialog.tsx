import { grantableRole } from '@pocketmice/contract/spaceRole';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { StorageLimitField } from '@/features/space/StorageLimitField';
import { limitOf, typedOf } from '@/features/space/storageLimit';
import { spaceText } from '@/features/space/text';
import { type Invite, makeInvite } from './invites';
import { inviteText } from './text';

/** The roles an invite can give, in the order they are offered: the one that may do more first */
const OFFERED = [...grantableRole.options].reverse();

/**
 * The dialog an invite link is made in: the role it gives, and how much whoever joins with it may hold in the
 * space, which is nothing to begin with: no limit. Once the invite is made the dialog closes, and onCreated is
 * told the invite.
 */
export function NewInviteDialog({
  spaceId,
  open,
  onOpenChange,
  onCreated
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (invite: Invite) => void;
}) {
  const [role, setRole] = useState<Invite['role']>('editor');
  const [typed, setTyped] = useState(() => typedOf(null));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setRole('editor');
    setTyped(typedOf(null));
    setProblem(null);
    onOpenChange(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const limit = limitOf(typed);
    if (limit === 'invalid') return setProblem(spaceText.limitInvalid);
    setBusy(true);
    const result = await makeInvite(spaceId, role, limit);
    setBusy(false);
    if ('problem' in result) return setProblem(result.problem);
    onCreated(result.invite);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>{inviteText.newLink}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">{inviteText.roleLabel}</FieldLegend>
              <RadioGroup value={role} onValueChange={(value) => setRole(value as Invite['role'])}>
                {OFFERED.map((each) => (
                  <FieldLabel key={each} htmlFor={`new-invite-${each}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{spaceText.roles[each]}</FieldTitle>
                        <FieldDescription>{spaceText.roleHints[each]}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={each} id={`new-invite-${each}`} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </FieldSet>

            <StorageLimitField
              id="new-invite-limit"
              hint={inviteText.limitHint}
              problem={problem}
              typed={typed}
              onTyped={(next) => {
                setTyped(next);
                setProblem(null);
              }}
            />
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="secondary" />}>{inviteText.cancel}</DialogClose>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {inviteText.createLink}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
