import { destinations } from '../data/destinations';

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

async function init() {
  const stage = document.querySelector<HTMLElement>('[data-stage]');
  const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]');
  const live = document.querySelector<HTMLElement>('[data-live]');
  const pause = document.querySelector<HTMLButtonElement>('[data-pause]');
  const pauseLabel = document.querySelector<HTMLElement>('[data-pause-label]');
  if (!stage || !canvas) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gotoButtons = [...stage.querySelectorAll<HTMLElement>('[data-goto]')];

  const scrollToDestination = (i: number) => {
    document.getElementById(`destination-${destinations[i].id}`)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  if (!hasWebGL2()) {
    stage.classList.add('is-static');
    gotoButtons.forEach((b) => b.addEventListener('click', () => scrollToDestination(Number(b.dataset.goto))));
    return;
  }

  const { createGreeceMap } = await import('./map/GreeceMap');
  let map;
  try {
    map = await createGreeceMap({
      root: stage,
      canvas,
      reducedMotion,
      stops: destinations.map(({ lon, lat, view }) => ({ lon, lat, view })),
      onReady: () => stage.classList.add('is-ready'),
    });
  } catch (err) {
    console.error(err);
    stage.classList.add('is-static');
    return;
  }

  const announce = (i: number) => {
    if (live) live.textContent = `Showing ${destinations[i].name} on the map`;
  };

  gotoButtons.forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.goto);
      map.goTo(i);
      announce(i);
    }),
  );

  const setPaused = (paused: boolean) => {
    map.setPaused(paused);
    pause?.setAttribute('aria-pressed', String(paused));
    if (pauseLabel) pauseLabel.textContent = paused ? 'Resume map tour' : 'Pause map tour';
  };
  if (reducedMotion && pause) pause.hidden = true;
  pause?.addEventListener('click', () => setPaused(!map.paused));

  window.addEventListener('thalassa:goto', (e) => {
    const id = (e as CustomEvent<string>).detail;
    const i = destinations.findIndex((d) => d.id === id);
    if (i < 0) return;
    document.getElementById('top')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    map.goTo(i);
    announce(i);
  });
}

init();
