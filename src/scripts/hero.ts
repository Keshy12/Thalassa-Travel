import { destinations } from '../data/destinations';
import route from '../data/route.json';
import type { RouteData } from './map/path';

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

async function init() {
  const section = document.querySelector<HTMLElement>('[data-hero]');
  const stage = document.querySelector<HTMLElement>('[data-stage]');
  const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]');
  const live = document.querySelector<HTMLElement>('[data-live]');
  const skip = document.querySelector<HTMLButtonElement>('[data-skip]');
  if (!section || !stage || !canvas) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth';
  const gotoButtons = [...stage.querySelectorAll<HTMLElement>('[data-goto]')];

  const goStatic = () => {
    section.classList.add('is-static');
    gotoButtons.forEach((b) =>
      b.addEventListener('click', () =>
        document.getElementById(`destination-${destinations[Number(b.dataset.goto)].id}`)?.scrollIntoView({ behavior }),
      ),
    );
  };

  if (!hasWebGL2()) return goStatic();

  const { createGreeceMap } = await import('./map/GreeceMap');
  let map: Awaited<ReturnType<typeof createGreeceMap>>;
  try {
    map = await createGreeceMap({
      root: stage,
      section,
      canvas,
      reducedMotion,
      route: route as RouteData,
      stops: destinations.map(({ name, lon, lat, view }) => ({ name, lon, lat, view })),
      onReady: () => stage.classList.add('is-ready'),
      onArrive: (i) => {
        if (live) live.textContent = `Arrived in ${destinations[i].name}`;
      },
    });
  } catch (err) {
    console.error(err);
    return goStatic();
  }

  const goTo = (i: number) => window.scrollTo({ top: map.scrollYFor(i), behavior });
  gotoButtons.forEach((b) => b.addEventListener('click', () => goTo(Number(b.dataset.goto))));
  skip?.addEventListener('click', () => window.scrollTo({ top: map.scrollYEnd(), behavior }));

  window.addEventListener('thalassa:goto', (e) => {
    const i = destinations.findIndex((d) => d.id === (e as CustomEvent<string>).detail);
    if (i >= 0) goTo(i);
  });
}

init();
