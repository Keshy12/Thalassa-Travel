export function journeyNodes(stops: number) {
  const outro = stops + 1;
  return {
    count: stops + 2,
    outro,
    ofStop: (stop: number) => stop + 1,
    stopAt: (node: number) => (node > 0 && node < outro ? node - 1 : -1),
    panel: (node: number) => (node <= 0 ? 'intro' : node >= outro ? 'outro' : `stop-${node - 1}`),
  };
}
