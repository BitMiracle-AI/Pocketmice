import { SPACE_NAME_MAX_LENGTH } from '@pocketmice/contract/domains/space';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { spaceText } from './text';

/** The field a new space is named in. problem is what is wrong with the name, said under it */
export function SpaceNameField({
  id,
  name,
  problem,
  onChange
}: {
  id: string;
  name: string;
  problem: string | null;
  onChange: (name: string) => void;
}) {
  return (
    <Field data-invalid={problem !== null || undefined}>
      <FieldLabel htmlFor={id}>{spaceText.nameLabel}</FieldLabel>
      <Input
        id={id}
        autoFocus
        autoComplete="off"
        maxLength={SPACE_NAME_MAX_LENGTH}
        value={name}
        placeholder={spaceText.namePlaceholder}
        aria-invalid={problem !== null || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {problem !== null && <FieldError>{problem}</FieldError>}
    </Field>
  );
}
