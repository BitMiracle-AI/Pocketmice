import { cn } from 'cn';
import { type CSSProperties, type ReactNode, useEffect, useReducer, useRef } from 'react';
import { gaze, type Point, typingPoint } from '@/lib/gaze';
import {
  type Act,
  type Happening,
  live,
  type Mouse,
  type Posture,
  postureOf,
  SLEEPS_AFTER,
  SPOTS,
  START
} from '@/lib/mouseLife';
import { playMouseSound, unlockMouseSounds } from '@/lib/mouseSounds';

// The card of a page that is one card is the pocket of the product's mark: the back of the folder stands behind
// it, the mouse looks out between the two, and its paws hold on to the edge of the card. The measures are the
// mark's own (public/favicon.svg), in units of the face, which is 26 across there: the edge crosses the face 4.4
// below its middle, the back of the folder ends 6.5 above the edge and its tab 9.5 above, and the paws hang 1.9
// over it. The mouse is drawn as the mark draws it, and no finer.
//
// The mouse is alive. What it does and when is in lib/mouseLife.ts; this file tells it what happens on the page
// and draws what it is doing:
// - when the page opens it takes hold of the edge and climbs up, once: a card that follows another (the code
//   after the address) finds it where and how the last left it;
// - it blinks, and an ear twitches now and then;
// - it looks at the pointer, and at what is typed while a field of the card is typed into;
// - it does not look at a password: while one is typed it sinks until only its ears and forehead show;
// - when what was entered is refused, it shakes its head;
// - pressed, it squeaks and drops out of sight, and comes up at another place along the edge. Pressed five times
//   in a row, it comes up dizzy;
// - stroked with the pointer, it shuts its eyes and its ears go;
// - left alone for long, it falls asleep, and starts awake when the person moves.
// None of it where the system asks for less motion: there the mouse is the drawing it is in the mark, and is
// silent. It is decoration either way: it says nothing a person needs to know, and nothing is done by pressing it.

/** How wide the face is drawn, in pixels, and one unit of the mark at that size */
const FACE = 112;
const UNIT = FACE / 26;
/** How far the tab of the folder stands above the card, and how far the rest of its back is below the tab */
const RISE = 9.5 * UNIT;
const STEP = 3 * UNIT;
/** The colour of the back of the folder: the ground the page has, a third of the way to white */
const BACK = 'color-mix(in srgb, white 30%, var(--background))';
const HONEY = '#f3b866';
const NAVY = '#162456';

/** Where the head is in each posture, in units under its place: sunk, the eyes are under the edge; peeking, the
 *  nose is. Dropping out of sight it is squashed a little, as something that lands is */
const HELD: Record<Posture, string> = {
  up: 'translateY(0px)',
  shy: 'translateY(9.4px)',
  peek: 'translateY(4.6px)',
  ducked: 'translateY(19px) scale(1.07, 0.88)'
};
/** How the head gets there. Up, it waits a moment for the paws to take hold, and overshoots as a jump does */
const MOVE: Record<Posture, string> = {
  up: 'transform 520ms cubic-bezier(0.34, 1.56, 0.64, 1) 140ms',
  shy: 'transform 260ms cubic-bezier(0.3, 0, 0.2, 1)',
  peek: 'transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  ducked: 'transform 150ms cubic-bezier(0.5, 0, 1, 0.5)'
};
/** How the whole head moves for what it is doing (the keyframes are in index.css) */
const MOTION: Partial<Record<Act, string>> = {
  no: 'animate-mouse-no',
  dizzy: 'animate-mouse-sway',
  happy: 'animate-mouse-rock',
  asleep: 'animate-mouse-doze',
  startled: 'animate-mouse-start'
};

/** Where the eyes are in the drawing, from its top, as a part of its height; a point this far off turns them fully */
const EYES = (12.5 - 2.6) / 24;
const FAR = 260;
/** A part of the face follows the look by so many units each way: the eyes most, the ears against it */
const follow = (x: number, y: number): CSSProperties => ({
  transform: `translate(calc(var(--look-x, 0) * ${x}px), calc(var(--look-y, 0) * ${y}px))`,
  transition: 'transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1)'
});

/** It is stroked once the pointer has gone this far over it without a pause, in pixels, and again for each
 *  stretch of the second length after that; a pause this long, in ms, and the count starts anew */
const STROKE = 200;
const STROKE_MORE = 70;
const STROKE_PAUSE = 400;

// What outlives one card, so that the next finds the mouse as the last left it: whether it has climbed up on this
// page yet, where it was looking, and what it was doing
const kept = { climbed: false, looking: { x: 0, y: 0 } as Point, mouse: START };

const clock = () => performance.now();
const tick = (mouse: Mouse, told: Happening & { at: number }) => live(mouse, told, told.at);

/** A line of the face: an eye that is shut */
const LINE = { fill: 'none', stroke: NAVY, strokeWidth: 0.9, strokeLinecap: 'round' } as const;

/** The eyes, for what it is doing: open, larger when it is surprised, shut in two ways, and spinning */
function Eyes({ act }: { act: Act }) {
  if (act === 'happy') return <path d="M-6.1 -2Q-4.4 -4.2 -2.7 -2M2.7 -2Q4.4 -4.2 6.1 -2" {...LINE} />;
  if (act === 'asleep') return <path d="M-6 -2.9Q-4.4 -1.4 -2.8 -2.9M2.8 -2.9Q4.4 -1.4 6 -2.9" {...LINE} />;
  if (act === 'dizzy') {
    return [-4.4, 4.4].map((x) => (
      // Three half circles, each wider than the last: a spiral, turning about the middle of the eye
      <path
        key={x}
        className="animate-spin"
        style={{ transformOrigin: `${x}px -2.6px` }}
        d={`M${x - 0.45} -2.6a.45 .45 0 0 1 .9 0a.9 .9 0 0 1 -1.8 0a1.35 1.35 0 0 1 2.7 0`}
        {...LINE}
        strokeWidth={0.62}
      />
    ));
  }
  const r = act === 'startled' || act === 'peeking' ? 2 : 1.7;
  return (
    <g className="origin-center [transform-box:fill-box] motion-safe:animate-mouse-blink">
      <circle fill={NAVY} cx="-4.4" cy="-2.6" r={r} />
      <circle fill={NAVY} cx="4.4" cy="-2.6" r={r} />
    </g>
  );
}

/** children is the card. It has to be the corner of 4xl that a Card has: the back is as tall as that corner */
export function Pocket({ children }: { children: ReactNode }) {
  const pocket = useRef<HTMLDivElement>(null);
  const face = useRef<SVGSVGElement>(null);
  // Whether this is the card the mouse climbs up on: the first of the page
  const climbs = useRef(!kept.climbed).current;
  const [mouse, tell] = useReducer(tick, kept.mouse);
  // For what listens to the page: what the mouse is doing as of the last drawing
  const doing = useRef(mouse.act);
  const posture = postureOf(mouse);
  const holds = posture === 'up' || posture === 'shy';
  const at = `${(SPOTS[mouse.spot] ?? 0.58) * 100}%`;

  useEffect(() => {
    kept.mouse = mouse;
    doing.current = mouse.act;
  });

  // What it is doing ends by itself
  useEffect(() => {
    if (mouse.until === null) return;
    const timer = setTimeout(() => tell({ is: 'time', at: clock() }), Math.max(0, mouse.until - clock()));
    return () => clearTimeout(timer);
  }, [mouse.until]);

  // What can be heard of it. All of it follows a press, which is what lets the page sound
  useEffect(() => {
    if (mouse.act === 'away') playMouseSound('squeak');
    else if (mouse.act === 'peeking') playMouseSound('pop');
    else if (mouse.act === 'dizzy') playMouseSound('dizzy');
  }, [mouse.act]);

  useEffect(() => {
    kept.climbed = true;
    const root = pocket.current;
    const drawing = face.current;
    if (!root || !drawing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // The person moved or typed: it does not fall asleep, and wakes if it has
    let stirredAt = clock();
    const stir = () => {
      stirredAt = clock();
      if (doing.current === 'asleep') tell({ is: 'stirred', at: stirredAt });
    };
    const nap = setInterval(() => {
      if (document.visibilityState !== 'visible' || doing.current !== 'idle') return;
      if (clock() - stirredAt >= SLEEPS_AFTER) tell({ is: 'left alone', at: clock() });
    }, 1000);

    // Turning the eyes, at most once for each frame the browser draws
    let frame = 0;
    let target: Point | null = null;
    const turn = () => {
      frame = 0;
      if (target === null) return;
      const box = drawing.getBoundingClientRect();
      kept.looking = gaze({ x: box.left + box.width / 2, y: box.top + box.height * EYES }, target, FAR);
      root.style.setProperty('--look-x', kept.looking.x.toFixed(3));
      root.style.setProperty('--look-y', kept.looking.y.toFixed(3));
    };
    const lookAt = (point: Point) => {
      target = point;
      if (frame === 0) frame = requestAnimationFrame(turn);
    };

    // The pointer over the mouse itself strokes it, once it has gone far enough: passing over it is not that
    let stroked = 0;
    let strokedAt = 0;
    let last: Point | null = null;
    const onPointer = (event: PointerEvent) => {
      stir();
      const point = { x: event.clientX, y: event.clientY };
      lookAt(point);
      const over =
        event.pointerType !== 'touch' && event.target instanceof Element && event.target.closest('[data-mouse]');
      if (!over || clock() - strokedAt > STROKE_PAUSE) stroked = 0;
      else if (last !== null) stroked += Math.hypot(point.x - last.x, point.y - last.y);
      last = over ? point : null;
      strokedAt = clock();
      if (stroked < STROKE) return;
      stroked -= STROKE_MORE;
      tell({ is: 'petted', at: clock() });
    };

    // A field of the card that is entered or typed into: whichever happened last, this or the pointer moving,
    // is what the mouse looks at
    const onField = (event: Event) => {
      stir();
      const field = event.target;
      if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement)) return;
      const secret = field.type === 'password';
      tell({ is: 'secret', on: secret, at: clock() });
      if (secret) return;
      const style = getComputedStyle(field);
      lookAt(
        typingPoint(field.getBoundingClientRect(), field.value.length, {
          // A field that takes a few characters is a code, drawn as so many boxes
          boxes: field.maxLength > 0 && field.maxLength <= 12 ? field.maxLength : null,
          characterWidth: Number.parseFloat(style.fontSize) * 0.55,
          inset: Number.parseFloat(style.paddingLeft)
        })
      );
    };
    const onFieldLeft = () => tell({ is: 'secret', on: false, at: clock() });

    // What was entered is refused: the card says so under a field, in a line that appears or changes
    const inRefusal = (node: Node) =>
      (node instanceof Element ? node : node.parentElement)?.closest('[data-slot=field-error]') != null ||
      (node instanceof Element && node.querySelector('[data-slot=field-error]') !== null);
    const refusals = new MutationObserver((changes) => {
      const refused = changes.some((change) =>
        change.type === 'characterData' ? inRefusal(change.target) : [...change.addedNodes].some(inRefusal)
      );
      if (refused) tell({ is: 'refused', at: clock() });
    });
    refusals.observe(root, { childList: true, subtree: true, characterData: true });

    // The drawing is hidden from a screen reader and is no button: there is nothing here to do with keys
    const onPress = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-mouse]')) return;
      unlockMouseSounds();
      tell({ is: 'pressed', chance: Math.random(), at: clock() });
    };

    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    window.addEventListener('keydown', stir);
    root.addEventListener('focusin', onField);
    root.addEventListener('input', onField);
    root.addEventListener('focusout', onFieldLeft);
    root.addEventListener('click', onPress);
    return () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', stir);
      root.removeEventListener('focusin', onField);
      root.removeEventListener('input', onField);
      root.removeEventListener('focusout', onFieldLeft);
      root.removeEventListener('click', onPress);
      refusals.disconnect();
      clearInterval(nap);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    // z-0 makes this the frame the three are ordered in, so the back does not go behind the page
    <div
      ref={pocket}
      className="relative z-0"
      style={{ '--look-x': kept.looking.x, '--look-y': kept.looking.y } as CSSProperties}
    >
      {/* The back shows above the card and in its two top corners, and nowhere down its sides. Its left end is a
          drawing, for the tab that runs down into it in a curve; the rest is as wide as the card happens to be */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -z-20 flex items-start overflow-hidden"
        style={{ top: -RISE, height: `calc(${RISE}px + var(--radius) * 2.6)` }}
      >
        {/* No viewBox: a unit is a pixel, and what is below the height of the box is cut off */}
        <svg width="168" height="100%" className="shrink-0" style={{ fill: BACK }} aria-hidden="true">
          <path d={`M0 400V24A24 24 0 0 1 24 0H136C152 0 152 ${STEP} 168 ${STEP}V400Z`} />
        </svg>
        <div className="-ml-px h-full flex-1 rounded-tr-3xl" style={{ marginTop: STEP, background: BACK }} />
      </div>
      {/* Whatever of the mouse is under the edge is behind the card: sinking is all it takes to hide. A unit of
          the drawing is a pixel to a transform written here, and 0 0 is the middle of the face */}
      <svg
        ref={face}
        viewBox="-13 -12.5 26 24"
        width={FACE}
        height={(FACE * 24) / 26}
        className="absolute overflow-visible [-webkit-tap-highlight-color:transparent]"
        style={{ left: at, top: -16.9 * UNIT, marginLeft: -FACE / 2, zIndex: -10 }}
        aria-hidden="true"
      >
        <g className={climbs ? 'motion-safe:animate-mouse-rise' : undefined}>
          <g data-mouse="" style={{ transform: HELD[posture], transition: MOVE[posture] }}>
            {/* It sways and rocks about its chin. Asleep it looks at nothing */}
            <g
              className={MOTION[mouse.act]}
              style={
                {
                  transformOrigin: '0px 9px',
                  ...(mouse.act === 'asleep' && { '--look-x': 0, '--look-y': 0.5 })
                } as CSSProperties
              }
            >
              <g style={follow(0.5, 0.35)}>
                <g style={follow(-0.35, -0.2)}>
                  <g
                    className={
                      mouse.act === 'happy'
                        ? 'origin-bottom-right [transform-box:fill-box] animate-mouse-wiggle'
                        : undefined
                    }
                  >
                    <circle fill={HONEY} cx="-7.6" cy="-7.6" r="4.1" />
                    <circle fill="#ff9cab" cx="-7.6" cy="-7.6" r="2.1" />
                  </g>
                  <g
                    className={cn(
                      'origin-bottom-left [transform-box:fill-box]',
                      mouse.act === 'happy' ? 'animate-mouse-wiggle' : 'motion-safe:animate-mouse-twitch'
                    )}
                  >
                    <circle fill={HONEY} cx="7.6" cy="-7.6" r="4.1" />
                    <circle fill="#ff9cab" cx="7.6" cy="-7.6" r="2.1" />
                  </g>
                </g>
                <circle fill={HONEY} cx="0" cy="-1.5" r="8.6" />
                <g style={follow(0.25, 0.2)}>
                  <circle fill="#fff2dc" cx="-6" cy="4.4" r="6.4" />
                  <circle fill="#fff2dc" cx="6" cy="4.4" r="6.4" />
                  <ellipse fill="#fff2dc" cx="0" cy="6.2" rx="4" ry="3.2" />
                </g>
                <g style={follow(1.15, 0.95)}>
                  <Eyes act={mouse.act} />
                </g>
                <ellipse style={follow(0.7, 0.55)} fill="#ef6f88" cx="0" cy="1.5" rx="1.4" ry="1.05" />
              </g>
            </g>
          </g>
          {/* Above its head, in the ink of the page: the z of one that sleeps, the stars of one that is dizzy */}
          {mouse.act === 'asleep' &&
            posture === 'up' &&
            [0, 0.9, 1.8].map((delay) => (
              <path
                key={delay}
                className="animate-mouse-z"
                style={{ animationDelay: `${delay}s`, transformOrigin: '10px -10px' }}
                d="M9 -11.2h2.2l-2.2 2.6h2.2"
                fill="none"
                stroke="#fff"
                strokeWidth={0.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          {mouse.act === 'dizzy' &&
            [
              [-10.5, -10.5, 0],
              [0, -14.5, 0.2],
              [10.5, -10.5, 0.4]
            ].map(([x, y, delay]) => (
              <g key={x} transform={`translate(${x} ${y})`}>
                <path
                  className="animate-mouse-star"
                  style={{ animationDelay: `${delay}s` }}
                  d="M0 -1.7Q.3 -.3 1.7 0Q.3 .3 0 1.7Q-.3 .3 -1.7 0Q-.3 -.3 0 -1.7Z"
                  fill="#fff"
                />
              </g>
            ))}
        </g>
      </svg>
      <div className="relative">{children}</div>
      {[-1, 1].map((side) => (
        <span
          key={side}
          data-mouse=""
          aria-hidden="true"
          className={cn('absolute', climbs && 'motion-safe:animate-paw-grab')}
          style={{
            left: at,
            zIndex: 10,
            top: -1.9 * UNIT,
            marginLeft: side * 5.24 * UNIT - 2.26 * UNIT,
            width: 4.52 * UNIT,
            height: 4.17 * UNIT,
            borderRadius: 2.1 * UNIT,
            background: HONEY,
            // The paws let go a moment after the head is gone, and take hold before it comes back
            transform: `scale(${holds ? 1 : 0})`,
            transition: holds ? 'transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)' : 'transform 110ms ease-in 40ms',
            animationDelay: `${side < 0 ? 150 : 230}ms`
          }}
        />
      ))}
    </div>
  );
}
