import type { SeaLife } from './sea/life';

const FULL = 0.62;
const SURGE = 2.2;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function init() {
  const root = document.querySelector<HTMLElement>('[data-dive]');
  const tank = root?.querySelector<HTMLElement>('[data-dive-tank]');
  const sea = root?.querySelector<HTMLElement>('[data-dive-sea]');
  const body = root?.querySelector<HTMLElement>('[data-dive-body]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-dive-canvas]');
  if (!root || !tank || !sea || !body || !canvas) return;

  const deep = root.querySelector<HTMLElement>('[data-dive-deep]');
  const light = root.querySelector<HTMLElement>('[data-dive-light]');
  const readout = root.querySelector<HTMLElement>('[data-dive-depth]');
  const intro = root.querySelector<HTMLElement>('[data-dive-intro]');
  const buddy = root.querySelector<HTMLElement>('[data-dive-buddy]');
  const beam = root.querySelector<SVGElement>('[data-dive-beam]');
  const marks = [...root.querySelectorAll<HTMLElement>('[data-depth]')];
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rest = parseFloat(getComputedStyle(root).getPropertyValue('--dive-rest')) || 0;

  root.classList.add('is-live');

  let life: SeaLife | null = null;
  let loading = false;
  let kicks: Animation[] | null = null;
  let level = NaN;
  let under = false;
  let shown = '';
  let tilt = 0;
  let pace = 1;
  let paced = 1;
  let lastY = window.scrollY;
  let lastNow = 0;
  let raf = 0;
  let near = false;
  let stale = true;

  const update = (dt: number) => {
    const view = window.innerHeight;
    const rect = body.getBoundingClientRect();
    const s = view - rect.top;
    const full = view * FULL;
    const max = view + rest;
    const floor = Math.min(s, max);
    const target = still || s <= 0 ? floor : s >= full ? max : s + (max - full) * (s / full) ** SURGE;
    const prev = level;
    level = still || Number.isNaN(level) ? target : Math.max(floor, level + (target - level) * (1 - Math.exp(-dt * 9)));
    sea.style.transform = `translate3d(0,${Math.round(Math.min(view + 80, view - level))}px,0)`;

    if (level >= view !== under) {
      under = !under;
      root.classList.toggle('is-under', under);
    }

    const q = clamp((s - full) / Math.max(1, rect.height - full), 0, 1);
    const depth = 1 - (1 - q) ** 2;
    if (deep) deep.style.opacity = depth.toFixed(3);
    if (light) light.style.opacity = (1 - depth * 0.82).toFixed(3);
    if (beam) beam.style.opacity = (0.18 + depth * 0.62).toFixed(3);

    const line = view * 0.5;
    let metres = 0;
    let fromY = rect.top;
    let fromD = 0;
    for (const mark of marks) {
      const r = mark.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const d = Number(mark.dataset.depth);
      metres = fromD + (d - fromD) * clamp((line - fromY) / Math.max(1, y - fromY), 0, 1);
      if (line <= y) break;
      fromY = y;
      fromD = d;
    }
    const text = `${Math.round(metres)} m`;
    if (readout && text !== shown) {
      readout.textContent = text;
      shown = text;
    }

    const y = window.scrollY;
    const speed = dt > 0 ? (y - lastY) / dt : 0;
    lastY = y;
    if (buddy && !still && dt > 0) {
      tilt += (clamp(-speed * 0.007, -12, 9) - tilt) * (1 - Math.exp(-dt * 4));
      buddy.style.setProperty('--tilt', `${tilt.toFixed(2)}deg`);
      pace += (1 + clamp(Math.abs(speed) / 700, 0, 1.6) - pace) * (1 - Math.exp(-dt * 3));
      if (Math.abs(pace - paced) > 0.02) {
        paced = pace;
        if (!kicks?.length) kicks = [...buddy.querySelectorAll('[data-dive-kick]')].flatMap((el) => el.getAnimations?.() ?? []);
        for (const k of kicks) k.playbackRate = pace;
      }
    }

    if (!life || (still && !stale)) return;
    stale = false;
    life.frame(dt, {
      cam: still ? 0 : clamp(s, full, rect.height - tank.offsetHeight + view) - full,
      depth,
      rise: dt > 0 && !Number.isNaN(prev) ? (level - prev) / dt : 0,
      level,
    });
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - lastNow) / 1000, 0.05);
    lastNow = now;
    update(dt);
  };

  let queued = false;
  const refresh = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update(0);
    });
  };

  const start = () => {
    if (raf) return;
    lastNow = performance.now();
    lastY = window.scrollY;
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const sync = () => (near && !document.hidden && !still ? start() : stop());

  const load = async () => {
    if (life || loading) return;
    loading = true;
    const { SeaLife } = await import('./sea/life');
    const scene = new SeaLife(canvas, still);
    new ResizeObserver(() => {
      scene.edge = (intro?.getBoundingClientRect().right ?? canvas.clientWidth * 0.48) + 28;
      scene.resize(canvas.clientWidth, canvas.clientHeight);
      stale = true;
      if (still) refresh();
    }).observe(canvas);
    life = scene;
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      if (!life || !near || e.pointerType !== 'mouse') return;
      const r = canvas.getBoundingClientRect();
      life.pointer.x = e.clientX - r.left;
      life.pointer.y = e.clientY - r.top;
      life.pointer.on = true;
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => {
    if (life) life.pointer.on = false;
  });

  if (still) {
    window.addEventListener('scroll', refresh, { passive: true });
    window.addEventListener('resize', refresh);
    refresh();
  }

  new IntersectionObserver(
    ([entry]) => {
      near = entry.isIntersecting;
      if (near) load().catch(console.error);
      sync();
    },
    { rootMargin: '50% 0px' },
  ).observe(root);
  document.addEventListener('visibilitychange', sync);
}

init();
