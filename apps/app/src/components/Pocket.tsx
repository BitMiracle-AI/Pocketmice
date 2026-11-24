import type { CSSProperties, ReactNode } from 'react';

// The card of a page that is one card is the pocket of the product's mark: the back of the folder stands behind
// it, the mouse looks out between the two, and its paws hold on to the edge of the card. The measures are the
// mark's own (public/favicon.svg), in units of the face, which is 26 across there: the edge crosses the face 4.4
// below its middle, the back of the folder ends 6.5 above the edge and its tab 9.5 above, and the paws hang 1.9
// over it.

/** How wide the face is drawn, in pixels, and one unit of the mark at that size */
const FACE = 112;
const UNIT = FACE / 26;
/** How far the tab of the folder stands above the card, and how far the rest of its back is below the tab */
const RISE = 9.5 * UNIT;
const STEP = 3 * UNIT;
/** The colour of the back of the folder: the ground the page has, a third of the way to white */
const BACK = 'color-mix(in srgb, white 30%, var(--background))';
/** Where the mouse is, from the left edge of the card */
const AT: CSSProperties = { position: 'absolute', left: '58%' };

/** children is the card. It has to be the corner of 4xl that a Card has: the back is as tall as that corner */
export function Pocket({ children }: { children: ReactNode }) {
  return (
    // z-0 makes this the frame the three are ordered in, so the back does not go behind the page
    <div className="relative z-0">
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
      <svg
        viewBox="-13 -12.5 26 24"
        width={FACE}
        height={(FACE * 24) / 26}
        style={{ ...AT, top: -16.9 * UNIT, marginLeft: -FACE / 2, zIndex: -10 }}
        aria-hidden="true"
      >
        <circle fill="#f3b866" cx="-7.6" cy="-7.6" r="4.1" />
        <circle fill="#f3b866" cx="7.6" cy="-7.6" r="4.1" />
        <circle fill="#ff9cab" cx="-7.6" cy="-7.6" r="2.1" />
        <circle fill="#ff9cab" cx="7.6" cy="-7.6" r="2.1" />
        <circle fill="#f3b866" cx="0" cy="-1.5" r="8.6" />
        <circle fill="#fff2dc" cx="-6" cy="4.4" r="6.4" />
        <circle fill="#fff2dc" cx="6" cy="4.4" r="6.4" />
        <ellipse fill="#fff2dc" cx="0" cy="6.2" rx="4" ry="3.2" />
        <circle fill="#162456" cx="-4.4" cy="-2.6" r="1.7" />
        <circle fill="#162456" cx="4.4" cy="-2.6" r="1.7" />
        <ellipse fill="#ef6f88" cx="0" cy="1.5" rx="1.4" ry="1.05" />
      </svg>
      <div className="relative">{children}</div>
      {[-1, 1].map((side) => (
        <span
          key={side}
          aria-hidden="true"
          style={{
            ...AT,
            zIndex: 10,
            top: -1.9 * UNIT,
            marginLeft: side * 5.24 * UNIT - 2.26 * UNIT,
            width: 4.52 * UNIT,
            height: 4.17 * UNIT,
            borderRadius: 2.1 * UNIT,
            background: '#f3b866'
          }}
        />
      ))}
    </div>
  );
}
