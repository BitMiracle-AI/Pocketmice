// What the mouse of the pocket does, and when (components/Pocket.tsx draws it and tells it what happens). It does
// one thing at a time:
// - idle: it holds on to the edge of the card and looks about;
// - away, peeking: pressed, it drops out of sight, and comes up somewhere else along the edge, eyes first;
// - dizzy: pressed five times in a row, it comes up seeing stars;
// - no: something the person entered was refused, and it shakes its head;
// - happy: it is stroked;
// - asleep, startled: left alone for long it dozes off, and wakes with a start.
// Beside these it is shy while a password is typed: it sinks until it cannot see.

/** The places along the edge of the card it can be at, from the left, as parts of the card's width */
export const SPOTS = [0.24, 0.41, 0.58, 0.75] as const;
/** Where it is when a page opens: where the mark has it */
const HOME = 2;

export type Act = 'idle' | 'away' | 'peeking' | 'dizzy' | 'no' | 'happy' | 'asleep' | 'startled';

export type Mouse = {
  act: Act;
  /** When the act ends by itself, on the clock the happenings are timed by; null: it lasts until something happens */
  until: number | null;
  /** Which of the places it is at, and the one it comes up at next: it moves while it is out of sight */
  spot: number;
  goes: number;
  /** Whether a password is being typed */
  shy: boolean;
  /** How many presses in a row it has had, and when the last was */
  streak: number;
  pressedAt: number;
};

export const START: Mouse = {
  act: 'idle',
  until: null,
  spot: HOME,
  goes: HOME,
  shy: false,
  streak: 0,
  pressedAt: -Infinity
};

/** How long each act lasts, in ms */
export const LASTS = { away: 520, peeking: 460, dizzy: 2600, no: 520, happy: 1000, startled: 450 };
/** A press is one more of a row when it comes this soon after the one before; so many in a row make it dizzy */
export const ROW_WITHIN = 3500;
export const DIZZY_AT = 5;
/** How long it is left alone before it dozes off, in ms */
export const SLEEPS_AFTER = 40_000;

export type Happening =
  /** chance is a number from 0 to 1 that is not 1: which of the other places it comes up at */
  | { is: 'pressed'; chance: number }
  /** A password is typed into, or no longer */
  | { is: 'secret'; on: boolean }
  | { is: 'refused' }
  | { is: 'petted' }
  | { is: 'left alone' }
  /** The person moved or typed */
  | { is: 'stirred' }
  /** The time of the act it is in ran out */
  | { is: 'time' };

/** The mouse after something happened at `now`. The same mouse when it makes no difference to it */
export function live(mouse: Mouse, happening: Happening, now: number): Mouse {
  const during = (act: keyof typeof LASTS): Mouse => ({ ...mouse, act, until: now + LASTS[act] });
  const atRest = mouse.act === 'idle' || mouse.act === 'happy';

  switch (happening.is) {
    case 'pressed': {
      // It is not there to be pressed, or too far gone to notice
      if (mouse.act === 'away' || mouse.act === 'dizzy') return mouse;
      const others = SPOTS.map((_, spot) => spot).filter((spot) => spot !== mouse.spot);
      const goes = others[Math.min(others.length - 1, Math.floor(happening.chance * others.length))] ?? mouse.spot;
      const streak = now - mouse.pressedAt <= ROW_WITHIN ? mouse.streak + 1 : 1;
      return { ...during('away'), goes, streak, pressedAt: now };
    }
    case 'time':
      if (mouse.until === null) return mouse;
      if (mouse.act !== 'away') return { ...mouse, act: 'idle', until: null };
      // Out of sight, it has gone along the edge
      return mouse.streak >= DIZZY_AT
        ? { ...during('dizzy'), spot: mouse.goes, streak: 0 }
        : { ...during('peeking'), spot: mouse.goes };
    case 'secret':
      return mouse.shy === happening.on ? mouse : { ...mouse, shy: happening.on };
    case 'refused':
      return atRest ? during('no') : mouse;
    case 'petted':
      return atRest && !mouse.shy ? during('happy') : mouse;
    case 'left alone':
      return mouse.act === 'idle' && !mouse.shy ? { ...mouse, act: 'asleep', until: null } : mouse;
    case 'stirred':
      return mouse.act === 'asleep' ? during('startled') : mouse;
  }
}

/** How it holds itself: up, sunk while a password is typed, looking over the edge, or out of sight */
export type Posture = 'up' | 'shy' | 'peek' | 'ducked';

export function postureOf(mouse: Mouse): Posture {
  if (mouse.act === 'away') return 'ducked';
  if (mouse.act === 'peeking') return 'peek';
  return mouse.shy ? 'shy' : 'up';
}
