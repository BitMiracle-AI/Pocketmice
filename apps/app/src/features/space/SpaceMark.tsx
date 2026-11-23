import { cn } from 'cn';
import { initials } from '@/lib/initials';

/** The square a space is known by: the first letter of its name, on the colour of the app. large is for its card */
export function SpaceMark({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center bg-primary leading-none font-semibold text-primary-foreground',
        large ? 'size-9 rounded-xl text-base' : 'size-5 rounded-md text-[11px]'
      )}
    >
      {initials(name, 1)}
    </span>
  );
}
