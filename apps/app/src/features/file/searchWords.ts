import { searchQuery } from '@pocketmice/contract/domains/file';

/**
 * The words the address of the search page says are looked for (its ?q=); undefined when it says none.
 * The router reads 2026 there as a number and true as a yes: what it made of words the page wrote itself is taken
 * as those words again. (Someone who writes 1e3 into the address by hand gets 1000.)
 * What the api would not look for is no words: nothing, a list, or more than the api takes.
 */
export function wordsOf(q: unknown): string | undefined {
  if (typeof q !== 'string' && typeof q !== 'number' && typeof q !== 'boolean') return undefined;
  const checked = searchQuery.safeParse(String(q));
  return checked.success ? checked.data : undefined;
}
