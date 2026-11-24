import { Key01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { cn } from 'cn';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

/**
 * An API key, and so an agent: where a person has their avatar with their letters, an agent has this one, with a
 * key, in the violet that is an agent's and nothing else's. What an agent wrote is what this drive shows and
 * others do not.
 */
export function KeyMark({ size }: { size?: 'sm' | 'default' | 'lg' }) {
  return (
    <Avatar size={size} aria-hidden="true">
      <AvatarFallback className="bg-agent text-agent-foreground">
        <HugeiconsIcon icon={Key01Icon} strokeWidth={2} className="size-[55%]" />
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * An agent by name: the mark of a key and what the key is called, as one piece on the pale of the agent's violet.
 * It is cut to one line where there is no room for the name.
 */
export function KeyChip({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-agent-soft py-0.5 pr-2.5 pl-0.5 font-medium text-agent-soft-foreground',
        className
      )}
    >
      <KeyMark size="sm" />
      <span className="truncate">{name}</span>
    </span>
  );
}
