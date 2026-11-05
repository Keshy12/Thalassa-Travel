type Dir = 1 | -1;

export interface StepOptions {
  root: HTMLElement;
  active(): boolean;
  canStep(dir: Dir): boolean;
  step(dir: Dir): void;
  leave(): void;
}

const GESTURE_GAP = 200;
const WHEEL_STEP = 30;
const SWIPE_STEP = 40;

const isField = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || el.matches('input, textarea, select'));
const isControl = (el: EventTarget | null) => el instanceof Element && !!el.closest('a[href], button, summary');

export function attachSteps({ root, active, canStep, step, leave }: StepOptions): () => void {
  let last = -Infinity;
  let lastAbs = 0;
  let stepAt = 0;
  let dir: Dir = 1;
  let acc = 0;
  let hijack = false;
  let stepped = false;

  const onWheel = (e: WheelEvent) => {
    const now = performance.now();
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      if (hijack && now - last <= GESTURE_GAP) {
        if (e.cancelable) e.preventDefault();
        last = now;
      }
      return;
    }
    const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1);
    const abs = Math.abs(dy);
    const d: Dir = dy > 0 ? 1 : -1;
    const renewed = stepped && now - stepAt > 300 && abs > lastAbs * 2 && abs > 12;
    if (now - last > GESTURE_GAP || d !== dir || renewed) {
      dir = d;
      acc = 0;
      stepped = false;
      hijack = active() && canStep(d);
    }
    last = now;
    lastAbs = abs;
    if (!hijack) return;
    if (e.cancelable) e.preventDefault();
    if (stepped) return;
    acc += abs;
    if (acc < WHEEL_STEP) return;
    stepped = true;
    stepAt = now;
    step(d);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isField(e.target)) return;
    const down = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey);
    const up = e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);
    if ((!down && !up) || (e.key === ' ' && isControl(e.target))) return;
    const d: Dir = down ? 1 : -1;
    if (!active() || !canStep(d)) return;
    e.preventDefault();
    if (!e.repeat) step(d);
  };

  let touch: { x: number; y: number } | null = null;
  const onTouchStart = (e: TouchEvent) => {
    touch = e.touches.length === 1 && active() ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!touch || e.touches.length !== 1) return;
    const dx = touch.x - e.touches[0].clientX;
    const dy = touch.y - e.touches[0].clientY;
    if (Math.abs(dx) > SWIPE_STEP && Math.abs(dx) > Math.abs(dy)) touch = null;
    if (!touch || Math.abs(dy) < SWIPE_STEP) return;
    touch = null;
    const d: Dir = dy > 0 ? 1 : -1;
    if (canStep(d)) step(d);
    else if (d > 0) leave();
  };
  const onTouchEnd = () => {
    touch = null;
  };

  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('touchstart', onTouchStart, { passive: true });
  root.addEventListener('touchmove', onTouchMove, { passive: true });
  root.addEventListener('touchend', onTouchEnd, { passive: true });
  root.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('keydown', onKey);

  return () => {
    root.removeEventListener('wheel', onWheel);
    root.removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchmove', onTouchMove);
    root.removeEventListener('touchend', onTouchEnd);
    root.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('keydown', onKey);
  };
}
