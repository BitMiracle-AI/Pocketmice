import { storageLimit } from '@pocketmice/contract/domains/space';

// How a storage limit is typed. The api takes a limit in bytes, or null for none. A person types an amount and
// picks its unit; an empty field is no limit, and 0 is a limit: nothing more may be added.

/** The units a limit is typed in. A step is 1024, as a size is written (formatSize) */
export const LIMIT_UNITS = ['MB', 'GB'] as const;

export type LimitUnit = (typeof LIMIT_UNITS)[number];

const BYTES: Record<LimitUnit, number> = { MB: 1024 ** 2, GB: 1024 ** 3 };

/** What the field of a limit holds: what was typed, and the unit it is in */
export interface TypedLimit {
  amount: string;
  unit: LimitUnit;
}

/**
 * The limit that was typed, in bytes. Null is no limit: nothing was typed. 'invalid' when what was typed is not an
 * amount (digits, with or without a point), or is more than a limit may be.
 */
export function limitOf(typed: TypedLimit): number | null | 'invalid' {
  const amount = typed.amount.trim();
  if (amount === '') return null;
  if (!/^(\d+\.?\d*|\.\d+)$/.test(amount)) return 'invalid';
  const checked = storageLimit.safeParse(Math.round(Number(amount) * BYTES[typed.unit]));
  return checked.success ? checked.data : 'invalid';
}

/**
 * What the field shows for the limit that is there: nothing for none, an amount in GB from 1 GB on and in MB under
 * it, with at most two digits after the point. A limit that is no such amount (one set through the api, in bytes)
 * is shown rounded.
 */
export function typedOf(limit: number | null): TypedLimit {
  if (limit === null) return { amount: '', unit: 'GB' };
  const unit: LimitUnit = limit >= BYTES.GB ? 'GB' : 'MB';
  return { amount: String(Math.round((limit / BYTES[unit]) * 100) / 100), unit };
}

/**
 * Whether what was typed is the limit that is there, however it is written: 1024 MB is 1 GB. A limit that is shown
 * rounded and left as it is shown is the one that is there: there is nothing to save.
 */
export function isLimit(typed: TypedLimit, limit: number | null): boolean {
  return limitOf(typed) === limitOf(typedOf(limit));
}

/**
 * How much of its limit something holds, from 0 to 100: for a bar next to the sentence that says the same. What
 * holds as much as it may, or more (a limit set under what is held, a limit of nothing), is full.
 */
export function shareOf(size: number, limit: number): number {
  return size >= limit ? 100 : (size / limit) * 100;
}
