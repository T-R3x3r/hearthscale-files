/**
 * The way from a trigger to the popup it opened, which keeps open a popup
 * that closes when the pointer leaves it. The way is the band straight
 * between the two and the triangle from the point where the pointer left
 * the trigger to the popup's near edge, so a pointer that heads for any
 * part of the popup crosses no ground that closes it. On the trigger, on
 * the popup or on the way, the popup stays; anywhere else, off the page
 * included, it closes.
 *
 * A popup closes this way only once the pointer has been on the trigger or
 * on the popup, so one opened from the keyboard waits for the pointer.
 * While it is open, the frames of the page take no pointer
 * (`data-hover-popup` on the root), so the page hears every move over
 * them.
 */

interface Point {
  x: number;
  y: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const within = (b: Box, p: Point) =>
  p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;

/** Whether `p` lies in the triangle `a`, `b`, `c`, its edges included. */
function inTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const side = (u: Point, v: Point) => (p.x - v.x) * (u.y - v.y) - (u.x - v.x) * (p.y - v.y);
  const d1 = side(a, b);
  const d2 = side(b, c);
  const d3 = side(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** How far behind the point where the pointer left the trigger, away from
 *  the popup, the triangle starts. The page reads that point a whole move
 *  past the edge and in whole pixels, so a triangle with its tip right
 *  there would miss the next move on the way. */
const BEHIND = 4;

/** Whether `p` lies on the way from `trigger` to `popup`: the band
 *  straight between them, or the triangle from `from`, where the pointer
 *  left the trigger, to the popup's edge that faces the trigger. A popup
 *  that overlaps its trigger has no way. */
function onWay(trigger: Box, popup: Box, from: Point | null, p: Point): boolean {
  let edge: [Point, Point];
  let band: Box;
  let tip: Point | null;
  if (popup.top >= trigger.bottom || popup.bottom <= trigger.top) {
    const below = popup.top >= trigger.bottom;
    const y = below ? popup.top : popup.bottom;
    edge = [
      { x: popup.left, y },
      { x: popup.right, y },
    ];
    band = {
      left: Math.max(trigger.left, popup.left),
      right: Math.min(trigger.right, popup.right),
      top: below ? trigger.bottom : popup.bottom,
      bottom: below ? popup.top : trigger.top,
    };
    tip = from && { x: from.x, y: from.y + (below ? -BEHIND : BEHIND) };
  } else if (popup.left >= trigger.right || popup.right <= trigger.left) {
    const right = popup.left >= trigger.right;
    const x = right ? popup.left : popup.right;
    edge = [
      { x, y: popup.top },
      { x, y: popup.bottom },
    ];
    band = {
      left: right ? trigger.right : popup.right,
      right: right ? popup.left : trigger.left,
      top: Math.max(trigger.top, popup.top),
      bottom: Math.min(trigger.bottom, popup.bottom),
    };
    tip = from && { x: from.x + (right ? -BEHIND : BEHIND), y: from.y };
  } else return false;
  if (band.left <= band.right && band.top <= band.bottom && within(band, p)) return true;
  return tip !== null && inTriangle(p, tip, edge[0], edge[1]);
}

/** Watches the pointer's way from `trigger` to the popup's element, which
 *  `popup` gives as drawn now, and calls `onLeave` once the pointer is on
 *  neither and off the way between them. Returns the call that stops it. */
export function safeTriangle(
  trigger: HTMLElement,
  popup: () => HTMLElement,
  onLeave: () => void,
): () => void {
  let armed = trigger.matches(':hover');
  let onTrigger = armed;
  let from: Point | null = null;
  const check = (e: PointerEvent) => {
    const p = { x: e.clientX, y: e.clientY };
    const t = trigger.getBoundingClientRect();
    const m = popup().getBoundingClientRect();
    if (within(t, p)) {
      armed = onTrigger = true;
      return;
    }
    if (onTrigger) {
      onTrigger = false;
      from = p;
    }
    if (within(m, p)) {
      armed = true;
      from = null;
    } else if (armed && !onWay(t, m, from, p)) onLeave();
  };
  const away = () => {
    if (armed) onLeave();
  };
  const page = document.documentElement;
  page.dataset.hoverPopup = 'true';
  document.addEventListener('pointermove', check, true);
  page.addEventListener('mouseleave', away);
  return () => {
    delete page.dataset.hoverPopup;
    document.removeEventListener('pointermove', check, true);
    page.removeEventListener('mouseleave', away);
  };
}
