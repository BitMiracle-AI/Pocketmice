import { language } from './language/language.ts';
import { type Language, languageTag } from './language/languages.ts';

// How a size and a time are written for a person, in the language of the page. Each takes the language as its last
// argument for a test to say which; everything else leaves it out.

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * How large something is: 512 B, 1.8 KB, 240 MB. A step is 1024, as file managers count. One digit after the point
 * below 100 of a unit, none from there on, and none for bytes.
 */
export function formatSize(bytes: number, of: Language = language): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  const written = new Intl.NumberFormat(languageTag(of), { maximumFractionDigits: digits }).format(value);
  return `${written} ${UNITS[unit]}`;
}

/**
 * How long ago something was, the way people say it: 12 minutes ago, yesterday. Older than a week, the date.
 * time is an ISO 8601 time, as the api writes one; now is the moment it is said at.
 */
export function formatWhen(time: string, now: number = Date.now(), of: Language = language): string {
  const tag = languageTag(of);
  const then = Date.parse(time);
  const minutes = Math.round((then - now) / 60_000);
  const relative = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
  if (Math.abs(minutes) < 1) return relative.format(0, 'second');
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return relative.format(days, 'day');
  return formatDate(time, of);
}

/** A day, written out: Nov 23, 2026 */
export function formatDate(time: string, of: Language = language): string {
  return new Intl.DateTimeFormat(languageTag(of), { year: 'numeric', month: 'short', day: 'numeric' }).format(
    Date.parse(time)
  );
}
