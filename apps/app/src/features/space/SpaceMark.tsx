import { initials } from '@/lib/initials';

/** The square a space is known by: the first letter of its name, on the colour of the app */
export function SpaceMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] leading-none font-semibold text-primary-foreground"
    >
      {initials(name, 1)}
    </span>
  );
}
