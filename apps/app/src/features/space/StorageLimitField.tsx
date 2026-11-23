import type { ReactNode } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { LIMIT_UNITS, type LimitUnit, type TypedLimit } from './storageLimit';
import { spaceText } from './text';

/**
 * The field a storage limit is typed in: an amount, and the unit it is in. Empty is no limit, which the empty
 * field says. What the limit is, is read from what it holds with limitOf (storageLimit.ts).
 * The field keeps nothing itself: typed is what it shows, and onTyped is told what the person made of it. hint is
 * said under it while nothing is wrong, and problem in its place when something is. children come after the unit,
 * on the same line: the button that saves, where the field is saved by itself.
 */
export function StorageLimitField({
  id,
  hint,
  problem,
  typed,
  onTyped,
  autoFocus = false,
  children
}: {
  id: string;
  hint: string;
  problem: string | null;
  typed: TypedLimit;
  onTyped: (typed: TypedLimit) => void;
  autoFocus?: boolean;
  children?: ReactNode;
}) {
  return (
    <Field data-invalid={problem !== null || undefined}>
      <FieldLabel htmlFor={id}>{spaceText.limitLabel}</FieldLabel>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          maxLength={20}
          value={typed.amount}
          placeholder={spaceText.noLimit}
          aria-invalid={problem !== null || undefined}
          onChange={(event) => onTyped({ ...typed, amount: event.target.value })}
        />
        <NativeSelect
          aria-label={spaceText.limitUnit}
          value={typed.unit}
          onChange={(event) => onTyped({ ...typed, unit: event.target.value as LimitUnit })}
          className="shrink-0"
        >
          {LIMIT_UNITS.map((unit) => (
            <NativeSelectOption key={unit} value={unit}>
              {unit}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {children}
      </div>
      {problem !== null ? <FieldError>{problem}</FieldError> : <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}
