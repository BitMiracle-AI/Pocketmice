import { cn } from 'cn';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/initials';

/** A person: a circle with the first letters of their name. small is for a line of a list */
export function PersonAvatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <Avatar size="sm" className={cn(small && 'size-5')}>
      <AvatarFallback className={cn('font-medium', small ? 'text-[9px]' : 'text-[10px]')}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
