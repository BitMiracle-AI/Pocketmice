import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/initials';

/** A person: a circle with the first letters of their name. size is the avatar's own: sm is for a line of a list */
export function PersonAvatar({ name, size }: { name: string; size?: 'sm' | 'default' | 'lg' }) {
  return (
    <Avatar size={size}>
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
