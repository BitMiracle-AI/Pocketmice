import { cn } from 'cn';
import type { CSSProperties } from 'react';
import { initials } from '@/lib/initials';
import { tintOf } from '@/lib/tint';

/**
 * The square a space is known by: the first letter of its name, on the colour that is the space's (lib/tint.ts,
 * by its id). large is for where the space is what the card is about: the start.
 */
export function SpaceMark({ id, name, large = false }: { id: string; name: string; large?: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{ '--tint': `var(--tint-${tintOf(id)})` } as CSSProperties}
      className={cn(
        'flex aspect-square shrink-0 items-center justify-center bg-tint font-heading font-bold text-tint-foreground',
        large ? 'size-12 rounded-2xl text-xl' : 'size-9 rounded-lg text-base'
      )}
    >
      {initials(name, 1)}
    </div>
  );
}
