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

/**
 * A moment, written out to the second: Nov 23, 2026, 2:05:09 PM. For where two times close together have to be
 * told apart: an agent writes a file several times in a minute.
 */
export function formatMoment(time: string, of: Language = language): string {
  return new Intl.DateTimeFormat(languageTag(of), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(Date.parse(time));
}

/** A day, written out: Nov 23, 2026 */
export function formatDate(time: string, of: Language = language): string {
  return new Intl.DateTimeFormat(languageTag(of), { year: 'numeric', month: 'short', day: 'numeric' }).format(
    Date.parse(time)
  );
}

/** How many days a time is after the day of now, by the days where the person is: 0 today, -1 yesterday */
function daysFrom(now: number, time: string): number {
  const startOfDay = (moment: number) => new Date(moment).setHours(0, 0, 0, 0);
  // Rounded: a day on which the clocks change is an hour longer or shorter
  return Math.round((startOfDay(Date.parse(time)) - startOfDay(now)) / 86_400_000);
}

/** The first letter as a capital, where the language has them: what begins a line of its own */
function capitalised(text: string, tag: string): string {
  return text.charAt(0).toLocaleUpperCase(tag) + text.slice(1);
}

/** The time of day: 2:05 PM. For what is shown under its day */
export function formatTime(time: string, of: Language = language): string {
  return new Intl.DateTimeFormat(languageTag(of), { hour: 'numeric', minute: '2-digit' }).format(Date.parse(time));
}

/** The day a time is on, as a heading: Today, Yesterday, and before that the date */
export function formatDay(time: string, now: number = Date.now(), of: Language = language): string {
  const tag = languageTag(of);
  const days = daysFrom(now, time);
  if (days === 0 || days === -1) {
    return capitalised(new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }).format(days, 'day'), tag);
  }
  return formatDate(time, of);
}

/**
 * When something was, in as few letters as say it, for a narrow list: the time of day for today, Yesterday, then
 * the day and the month, and the year too when it is not this one.
 */
export function formatBrief(time: string, now: number = Date.now(), of: Language = language): string {
  const tag = languageTag(of);
  const days = daysFrom(now, time);
  if (days === 0) return formatTime(time, of);
  if (days === -1) return capitalised(new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }).format(-1, 'day'), tag);
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(tag, {
    year: sameYear ? undefined : 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(Date.parse(time));
}
