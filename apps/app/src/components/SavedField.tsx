import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { commonText } from '@/lib/text';

/**
 * One line of a settings page that is saved by itself: a field holding what is there now, and a button that saves
 * what was typed over it. The button is off while there is nothing to save: what is typed is what is there, give
 * or take the spaces around it.
 * save is handed what was typed and answers null when it is saved, or the sentence that says why it is not: the
 * sentence is shown under the field, and what was typed stays.
 */
export function SavedField({
  id,
  label,
  hint,
  value,
  maxLength,
  autoComplete = 'off',
  save
}: {
  id: string;
  label: string;
  /** What is said under the field while nothing is wrong */
  hint: string;
  /** What is there now */
  value: string;
  maxLength: number;
  autoComplete?: string;
  save: (typed: string) => Promise<string | null>;
}) {
  const [typed, setTyped] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unchanged = typed.trim() === value;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || unchanged) return;
    setBusy(true);
    const failed = await save(typed);
    setBusy(false);
    if (failed !== null) return setProblem(failed);
    // What the field holds is what was taken: without the spaces around it
    setTyped(typed.trim());
  };

  return (
    <form onSubmit={submit} noValidate>
      <Field data-invalid={problem !== null || undefined}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <div className="flex gap-2">
          <Input
            id={id}
            autoComplete={autoComplete}
            maxLength={maxLength}
            value={typed}
            aria-invalid={problem !== null || undefined}
            onChange={(event) => {
              setTyped(event.target.value);
              setProblem(null);
            }}
          />
          <Button type="submit" disabled={busy || unchanged} className="shrink-0">
            {busy && <Spinner data-icon="inline-start" />}
            {commonText.save}
          </Button>
        </div>
        {problem !== null ? <FieldError>{problem}</FieldError> : <FieldDescription>{hint}</FieldDescription>}
      </Field>
    </form>
  );
}
