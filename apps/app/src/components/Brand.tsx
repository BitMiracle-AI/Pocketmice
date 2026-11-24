import { Link } from '@tanstack/react-router';

/**
 * The mark of the product and its name, on a page that has no sidebar. It leads to the start. Such a page is on
 * the frame, where the folder of the mark would not show: the mark stands on a tile of its own.
 */
export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 self-center font-heading text-lg font-bold">
      <span className="flex size-9 items-center justify-center rounded-xl bg-white">
        <img src="/favicon.svg" alt="" className="size-7" />
      </span>
      Pocketmice
    </Link>
  );
}
