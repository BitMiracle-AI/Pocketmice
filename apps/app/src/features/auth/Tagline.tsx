import { FieldDescription } from '@/components/ui/field';
import { authText } from './text';

/** What Pocketmice is, in one line, under the card a person signs in or signs up in */
export function Tagline() {
  return <FieldDescription className="px-6 text-center">{authText.tagline}</FieldDescription>;
}
