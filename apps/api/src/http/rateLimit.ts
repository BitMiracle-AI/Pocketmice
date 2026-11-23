import { isIP } from 'node:net';

/**
 * A limit on how often one key (an IP, an email address) may come in a stretch of time.
 *
 * The counts are kept in the memory of this process, not in the database. So with several api processes each keeps
 * its own, and what is let through is at most "the limit times the number of processes"; and a process that starts
 * again counts from nothing. A limit is only ever looser than it was set, and never refuses someone who is under
 * it: enough to stop abuse.
 *
 * The window slides: for each key the times it last came are kept, and only those still inside the window count.
 */
export interface RateLimit {
  /** Whether this key may come once more now. It looks, and counts nothing */
  hasRoom: (key: string) => boolean;
  /** Counts that this key came once */
  record: (key: string) => void;
  /** How many keys are kept now. For seeing that the memory is given back */
  size: () => number;
}

/** When this many keys are kept, the ones with nothing left in the window are dropped, so the memory stops growing */
const SWEEP_EVERY_KEYS = 10_000;

/**
 * limit is how many times in a window, windowMs how long the window is. now tells the time: a test passes a clock
 * of its own.
 */
export function rateLimit(limit: number, windowMs: number, now: () => number = Date.now): RateLimit {
  /** When each key last came, the earliest first, at most limit of them */
  const seen = new Map<string, number[]>();
  let sweepAt = SWEEP_EVERY_KEYS;

  /** The times this key came that are still inside the window */
  function recent(key: string): number[] {
    const times = seen.get(key);
    if (!times) return [];
    const from = now() - windowMs;
    const kept = times.filter((time) => time > from);
    if (kept.length === 0) seen.delete(key);
    else if (kept.length !== times.length) seen.set(key, kept);
    return kept;
  }

  return {
    hasRoom: (key) => recent(key).length < limit,
    record(key) {
      const times = recent(key);
      times.push(now());
      // Only the last limit of them are kept: an earlier one changes nothing about whether the window is full
      seen.set(key, times.slice(-limit));
      if (seen.size >= sweepAt) {
        for (const other of [...seen.keys()]) recent(other);
        // Many are left after the sweep, so that many keys really are inside the window: the next sweep waits for
        // as many again, or every request would go through all of them
        sweepAt = seen.size + SWEEP_EVERY_KEYS;
      }
    },
    size: () => seen.size
  };
}

/**
 * The key an IP counts under. An IPv4 address is its own key. Of an IPv6 address only the first half (64 bits)
 * counts: a household or a machine is given a whole block and may use any address in it, so counted by the single
 * address, another address would be another allowance.
 * An IPv4 address written as IPv6 (::ffff:203.0.113.1) counts as that IPv4 address. What is not an IP is returned
 * as it is.
 */
export function ipLimitKey(ip: string): string {
  if (isIP(ip) !== 6) return ip;

  let groups: string[];
  try {
    // The parser of addresses writes it the standard way: lowercase, an IPv4 ending in hexadecimal, a run of zeros
    // as ::
    const [head = '', tail] = new URL(`http://[${ip}]`).hostname.slice(1, -1).split('::');
    const before = head === '' ? [] : head.split(':');
    const after = tail === undefined || tail === '' ? [] : tail.split(':');
    // The groups of zeros that :: stands for are put back, to make eight
    groups = [...before, ...Array<string>(8 - before.length - after.length).fill('0'), ...after];
  } catch {
    // One that names a network interface (fe80::1%eth0) cannot be parsed: used as it is
    return ip;
  }
  const [, , , , , mapped, high = '0', low = '0'] = groups;
  if (groups.slice(0, 5).every((group) => group === '0') && mapped === 'ffff') {
    const bits = (Number.parseInt(high, 16) << 16) | Number.parseInt(low, 16);
    return [bits >>> 24, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255].join('.');
  }
  return `${groups.slice(0, 4).join(':')}::/64`;
}

/**
 * Several limits used as one: the key may come when every one of them has room, and then every one counts it.
 * Returns whether it may come.
 * Looking at all of them comes first and counting second: when one is full none of them counts, so a request that
 * is refused takes nothing from the others.
 */
export function takeAll(limits: readonly RateLimit[], key: string): boolean {
  if (!limits.every((limit) => limit.hasRoom(key))) return false;
  for (const limit of limits) limit.record(key);
  return true;
}
