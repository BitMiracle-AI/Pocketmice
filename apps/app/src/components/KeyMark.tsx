import { Key01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { cn } from 'cn';

/**
 * An API key, and so an agent: where a person has their avatar, an agent has this. It is the one place the colour
 * of the app is used outside a button: what an agent wrote is what this drive shows and others do not.
 */
export function KeyMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary/30 dark:text-chart-1',
        className
      )}
    >
      <HugeiconsIcon icon={Key01Icon} strokeWidth={2} className="size-[58%]" />
    </span>
  );
}
