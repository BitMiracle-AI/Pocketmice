import {
  API_KEY_NAME_MAX_LENGTH,
  API_KEY_PERMISSIONS,
  type ApiKeyPermission
} from '@pocketmice/contract/domains/apiKey';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { type ApiKey, makeApiKey } from './apiKeys';
import { apiKeyText } from './text';

/** The order the two permissions are offered in: the one a key usually needs first */
const OFFERED = [...API_KEY_PERMISSIONS].reverse();

/**
 * The dialog a key is made in: what it is called, and what it may do. Once it is made the dialog closes, and
 * onCreated is told the key.
 */
export function NewKeyDialog({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (apiKey: ApiKey) => void;
}) {
  const [name, setName] = useState('');
  const [permission, setPermission] = useState<ApiKeyPermission>('write');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setName('');
    setPermission('write');
    setProblem(null);
    onOpenChange(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const result = await makeApiKey(name, permission);
    setBusy(false);
    if ('problem' in result) return setProblem(result.problem);
    onCreated(result.apiKey);
    toast.add({ type: 'success', title: apiKeyText.createdToast(result.apiKey.name) });
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>{apiKeyText.dialogTitle}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={problem !== null || undefined}>
              <FieldLabel htmlFor="new-key-name">{apiKeyText.nameLabel}</FieldLabel>
              <Input
                id="new-key-name"
                autoFocus
                autoComplete="off"
                maxLength={API_KEY_NAME_MAX_LENGTH}
                value={name}
                placeholder={apiKeyText.namePlaceholder}
                aria-invalid={problem !== null || undefined}
                onChange={(event) => {
                  setName(event.target.value);
                  setProblem(null);
                }}
              />
              {problem === null ? (
                <FieldDescription>{apiKeyText.nameHint}</FieldDescription>
              ) : (
                <FieldError>{problem}</FieldError>
              )}
            </Field>

            <FieldSet>
              <FieldLegend variant="label">{apiKeyText.permissionLabel}</FieldLegend>
              <RadioGroup value={permission} onValueChange={(value) => setPermission(value as ApiKeyPermission)}>
                {OFFERED.map((each) => (
                  <FieldLabel key={each} htmlFor={`new-key-${each}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{apiKeyText.permissions[each]}</FieldTitle>
                        <FieldDescription>{apiKeyText.permissionHints[each]}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={each} id={`new-key-${each}`} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </FieldSet>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{apiKeyText.cancel}</DialogClose>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {apiKeyText.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
