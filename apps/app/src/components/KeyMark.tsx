import { Key01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

/**
 * An API key, and so an agent: where a person has their avatar with their letters, an agent has this one, with a
 * key. What an agent wrote is what this drive shows and others do not.
 */
export function KeyMark({ size }: { size?: 'sm' | 'default' | 'lg' }) {
  return (
    <Avatar size={size} aria-hidden="true">
      <AvatarFallback>
        <HugeiconsIcon icon={Key01Icon} strokeWidth={2} className="size-3.5" />
      </AvatarFallback>
    </Avatar>
  );
}
