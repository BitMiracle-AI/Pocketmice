// The sounds the mouse of the pocket makes when it is pressed (components/Pocket.tsx says when). They are made
// here out of a few tones, so no file is fetched for them, and they are quiet: a squeak, not an alarm.
// A browser lets a page sound only once the person has pressed something on it. The press on the mouse is that
// (unlockMouseSounds): nothing sounds before it, and a page nobody presses the mouse on stays silent.

export type MouseSound = 'squeak' | 'pop' | 'dizzy';

/** One tone: how loud it gets (1 is the loudest the mouse is), and the pitch it glides through over its length */
type Tone = {
  wave: OscillatorType;
  /** In seconds */
  length: number;
  level: number;
  /** Each is how far into the tone, from 0 to 1, and the pitch there, in hertz. The first is at 0 */
  pitch: [number, number][];
  /** The pitch trembles so many times a second, by so many hertz each way */
  tremble?: { rate: number; by: number };
};

/** Each sound is a few tones, each so many seconds after the sound starts */
const SOUNDS: Record<MouseSound, { after: number; tone: Tone }[]> = {
  // Two short chirps that rise and fall back, the second higher
  squeak: [
    {
      after: 0,
      tone: {
        wave: 'triangle',
        length: 0.12,
        level: 1,
        pitch: [
          [0, 1500],
          [0.3, 2600],
          [1, 1900]
        ]
      }
    },
    {
      after: 0.13,
      tone: {
        wave: 'triangle',
        length: 0.1,
        level: 0.8,
        pitch: [
          [0, 1750],
          [0.3, 3000],
          [1, 2200]
        ]
      }
    }
  ],
  // It is back up: one low note that slides up
  pop: [
    {
      after: 0,
      tone: {
        wave: 'sine',
        length: 0.18,
        level: 0.9,
        pitch: [
          [0, 300],
          [0.45, 720],
          [1, 720]
        ]
      }
    }
  ],
  // A whistle that slides down and trembles, then three small bells: the stars
  dizzy: [
    {
      after: 0,
      tone: {
        wave: 'sine',
        length: 0.6,
        level: 0.7,
        pitch: [
          [0, 1150],
          [1, 360]
        ],
        tremble: { rate: 11, by: 45 }
      }
    },
    { after: 0.4, tone: { wave: 'sine', length: 0.16, level: 0.45, pitch: [[0, 2093]] } },
    { after: 0.52, tone: { wave: 'sine', length: 0.16, level: 0.45, pitch: [[0, 2637]] } },
    { after: 0.64, tone: { wave: 'sine', length: 0.22, level: 0.45, pitch: [[0, 3136]] } }
  ]
};

/** How loud the loudest of it is, where 1 is as loud as a page can be */
const VOLUME = 0.2;

function sing(audio: BaseAudioContext, out: AudioNode, start: number, tone: Tone): void {
  const end = start + tone.length;
  const voice = audio.createOscillator();
  voice.type = tone.wave;
  for (const [part, hertz] of tone.pitch) {
    if (part === 0) voice.frequency.setValueAtTime(hertz, start);
    else voice.frequency.exponentialRampToValueAtTime(hertz, start + part * tone.length);
  }
  // It comes in over a few milliseconds and dies away to the end: cut off sharp at either end, a tone clicks
  const loudness = audio.createGain();
  loudness.gain.setValueAtTime(0.001, start);
  loudness.gain.exponentialRampToValueAtTime(tone.level, start + Math.min(0.012, tone.length / 4));
  loudness.gain.exponentialRampToValueAtTime(0.001, end);
  voice.connect(loudness).connect(out);
  if (tone.tremble) {
    const tremble = audio.createOscillator();
    tremble.frequency.value = tone.tremble.rate;
    const by = audio.createGain();
    by.gain.value = tone.tremble.by;
    tremble.connect(by).connect(voice.frequency);
    tremble.start(start);
    tremble.stop(end);
  }
  voice.start(start);
  voice.stop(end);
}

/** Has the sound played into `out` from `start` on, in the seconds of `audio`. Returns how long it is */
export function scheduleMouseSound(audio: BaseAudioContext, out: AudioNode, name: MouseSound, start: number): number {
  let length = 0;
  for (const { after, tone } of SOUNDS[name]) {
    sing(audio, out, start + after, tone);
    length = Math.max(length, after + tone.length);
  }
  return length;
}

let audio: AudioContext | null = null;
let out: GainNode | null = null;

/** To be called from the press itself: from then on the sounds can be heard */
export function unlockMouseSounds(): void {
  try {
    if (audio === null) {
      audio = new AudioContext();
      out = audio.createGain();
      out.gain.value = VOLUME;
      out.connect(audio.destination);
    }
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    // A browser that has no sound for a page, or refuses it: the mouse is silent
    audio = null;
    out = null;
  }
}

/** Plays the sound now. Nothing before the mouse was first pressed */
export function playMouseSound(name: MouseSound): void {
  if (audio === null || out === null) return;
  scheduleMouseSound(audio, out, name, audio.currentTime + 0.01);
}
