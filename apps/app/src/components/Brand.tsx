import { Link } from '@tanstack/react-router';

/** The mark of the product and its name, on a page that has no sidebar. It leads to the start */
export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2 self-center font-medium">
      <img src="/favicon.svg" alt="" className="size-6" />
      Pocketmice
    </Link>
  );
}
