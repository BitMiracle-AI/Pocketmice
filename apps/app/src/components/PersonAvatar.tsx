import type { CSSProperties } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/initials';
import { tintOf } from '@/lib/tint';

/**
 * A person: a circle of the colour that is theirs (lib/tint.ts, by their id), with the first letters of their
 * name. size is the avatar's own: sm is for a line of a list.
 */
export function PersonAvatar({ id, name, size }: { id: string; name: string; size?: 'sm' | 'default' | 'lg' }) {
  return (
    <Avatar size={size} style={{ '--tint': `var(--tint-${tintOf(id)})` } as CSSProperties}>
      <AvatarFallback className="bg-tint text-tint-foreground">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
