// Where someone goes after signing in. The page that sent them to sign in writes its own address into the address
// of the sign-in page (?next=…), and they are taken back there.
// The address bar is something anyone can write a link for, so only an address of this app is taken: a link to the
// sign-in page that named another site would send the person there the moment they had signed in.

/**
 * The address inside this app that value names: its path, with its query and its fragment. Undefined when value is
 * anything else: not text, not starting with one slash, or leading to another site.
 */
export function nextPathFrom(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined;
  // Read against a site that is not ours: whatever a browser would take to another site (//host, /\host) ends up
  // with another origin than the one it was read against
  const base = 'https://app.invalid';
  if (!URL.canParse(value, base)) return undefined;
  const url = new URL(value, base);
  if (url.origin !== base) return undefined;
  return url.pathname + url.search + url.hash;
}
