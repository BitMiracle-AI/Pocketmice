import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { commonText } from '@/lib/text';

/**
 * One thing of a settings page that is saved by itself, as a card: what it is and what it is for, a field holding
 * what is there now, and a button that saves what was typed over it. The button is off while there is nothing to
 * save: what is typed is what is there, give or take the spaces around it.
 * save is handed what was typed and answers null when it is saved, or the sentence that says why it is not: the
 * sentence is shown under the field, and what was typed stays.
 */
export function SavedCard({
  id,
  title,
  hint,
  value,
  maxLength,
  autoComplete = 'off',
  save
}: {
  id: string;
  /** What the field holds: the title of the card, and the name of the field */
  title: string;
  /** What it is for, under the title */
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
    <Card>
      <form onSubmit={submit} noValidate className="contents">
        <CardHeader>
          <CardTitle id={`${id}-title`}>{title}</CardTitle>
          <CardDescription>{hint}</CardDescription>
        </CardHeader>
        <CardContent>
          <Field data-invalid={problem !== null || undefined}>
            <Input
              id={id}
              aria-labelledby={`${id}-title`}
              autoComplete={autoComplete}
              maxLength={maxLength}
              value={typed}
              aria-invalid={problem !== null || undefined}
              onChange={(event) => {
                setTyped(event.target.value);
                setProblem(null);
              }}
            />
            {problem !== null && <FieldError>{problem}</FieldError>}
          </Field>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={busy || unchanged}>
            {busy && <Spinner data-icon="inline-start" />}
            {commonText.save}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
