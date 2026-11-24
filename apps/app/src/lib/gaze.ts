// Where something with eyes looks, when it looks at a point of the page.

/** A point of the page, in pixels */
export type Point = { x: number; y: number };

/**
 * How far the eyes at `from` are turned to look at `to`: a direction, each part between -1 and 1 and the two
 * together no longer than 1. A point that is `far` pixels away or more turns them all the way; a nearer one turns
 * them less, so that they come to rest looking ahead when the point is on the eyes themselves.
 */
export function gaze(from: Point, to: Point, far: number): Point {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const distance = Math.hypot(x, y);
  if (distance === 0) return { x: 0, y: 0 };
  const turn = Math.min(1, distance / far);
  return { x: (x / distance) * turn, y: (y / distance) * turn };
}

/**
 * The point of a field that is being typed into: where its text ends. For a field that takes a few characters
 * in boxes of one width (a code), the box that is typed next; for any other, as far into the field as text of
 * that many characters reaches, and no further than the field goes.
 */
export function typingPoint(
  box: { left: number; top: number; width: number; height: number },
  typed: number,
  field: { boxes: number | null; characterWidth: number; inset: number }
): Point {
  const y = box.top + box.height / 2;
  if (field.boxes !== null) {
    return { x: box.left + (box.width * (Math.min(typed, field.boxes - 1) + 0.5)) / field.boxes, y };
  }
  const room = Math.max(0, box.width - field.inset * 2);
  return { x: box.left + field.inset + Math.min(room, typed * field.characterWidth), y };
}
