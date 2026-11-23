import { initials } from '@/lib/initials';

/** The square a space is known by: the first letter of its name, on the colour of the app */
export function SpaceMark({ name }: { name: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground"
    >
      {initials(name, 1)}
    </div>
  );
}
