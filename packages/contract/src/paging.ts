import { z } from 'zod';

// Pages. A list that can grow without limit comes a page at a time: at most limit entries, and nextCursor when
// there are more. Pass nextCursor back as cursor, as it is, to get the next page.
// Every operation that answers with such a list takes limit and cursor and answers with nextCursor, written with
// what is here: the rule is the same whatever the list holds.

/** A page has at most this many entries, whatever limit asks for */
export const PAGE_SIZE_MAX = 1000;

/** How many entries a page has when limit is left out */
export const PAGE_SIZE_DEFAULT = 100;

/** How many entries to answer with at most */
export const limit = z.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT);

/** Where the page before ended: its nextCursor, as it was. Left out for the first page */
export const cursor = z.string().optional();

/** What to pass as cursor to get the page after this one. Null when this page is the last */
export const nextCursor = z.string().nullable();

/** How the description of an operation that answers with a page says so: the convention, in one sentence */
export const PAGED =
  'It comes a page at a time: at most limit entries, and when nextCursor is not null there are more: pass it back ' +
  'as cursor, as it is, to get the next page.';
