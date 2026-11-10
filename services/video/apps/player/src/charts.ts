import { el, fmtTime } from './dom';

const NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Curva de retenção: espectadores por trecho de `bucketSeconds` ao longo da aula. */
export function retentionChart(
  points: { bucketS: number; viewers: number }[],
  bucketSeconds: number,
  label: string,
): SVGSVGElement {
  const W = 640;
  const H = 220;
  const pad = { l: 36, r: 12, t: 10, b: 24 };
  const peak = Math.max(1, ...points.map((p) => p.viewers));
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / peak) * (H - pad.t - pad.b);

  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart',
    role: 'img',
    'aria-label': label,
  });
  root.append(svg('title'));
  root.querySelector('title')!.textContent = label;
  // grade e rótulos de eixo
  for (const f of [0, 0.5, 1]) {
    const gy = pad.t + (1 - f) * (H - pad.t - pad.b);
    root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: gy, y2: gy, class: 'grid' }));
    const t = svg('text', { x: pad.l - 6, y: gy + 4, class: 'axis', 'text-anchor': 'end' });
    t.textContent = String(Math.round(peak * f));
    root.append(t);
  }
  if (points.length) {
    const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.viewers).toFixed(1)}`).join(' ');
    root.append(
      svg('polygon', {
        points: `${x(0)},${y(0)} ${line} ${x(points.length - 1)},${y(0)}`,
        class: 'area',
      }),
      svg('polyline', { points: line, class: 'line' }),
    );
    const ends: [number, string][] = [
      [0, 'start'],
      [points.length - 1, 'end'],
    ];
    for (const [i, anchor] of ends) {
      const t = svg('text', { x: x(i), y: H - 6, class: 'axis', 'text-anchor': anchor });
      t.textContent = fmtTime(i * bucketSeconds);
      root.append(t);
    }
  }
  return root;
}

/** Barras por dia (visualizações): uma barra por dia, com título para leitores de tela. */
export function dailyChart(days: { day: string; views: number }[], label: string): SVGSVGElement {
  const W = 640;
  const H = 140;
  const pad = { l: 28, r: 8, t: 8, b: 20 };
  const peak = Math.max(1, ...days.map((d) => d.views));
  const slot = (W - pad.l - pad.r) / Math.max(1, days.length);
  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart',
    role: 'img',
    'aria-label': label,
  });
  const top = svg('text', { x: pad.l - 4, y: pad.t + 8, class: 'axis', 'text-anchor': 'end' });
  top.textContent = String(peak);
  root.append(top);
  days.forEach((d, i) => {
    const h = (d.views / peak) * (H - pad.t - pad.b);
    const bar = svg('rect', {
      x: pad.l + i * slot + slot * 0.15,
      y: H - pad.b - h,
      width: Math.max(1, slot * 0.7),
      height: h,
      class: 'bar',
    });
    const title = svg('title');
    title.textContent = `${d.day}: ${d.views} visualizações`;
    bar.append(title);
    root.append(bar);
  });
  for (const [i, anchor] of [
    [0, 'start'],
    [days.length - 1, 'end'],
  ] as const) {
    if (!days[i]) continue;
    const t = svg('text', {
      x: i === 0 ? pad.l : W - pad.r,
      y: H - 5,
      class: 'axis',
      'text-anchor': anchor,
    });
    t.textContent = days[i].day.slice(5);
    root.append(t);
  }
  return root;
}

/** Lista de barras horizontais (velocidade, qualidade, dispositivo): rótulo, barra e valor. */
export function barList(items: { label: string; percent: number; detail: string }[]): HTMLElement {
  return el(
    'ul',
    { class: 'bars' },
    ...(items.length
      ? items.map((i) =>
          el(
            'li',
            {},
            el('span', { class: 'bars-label', text: i.label }),
            el(
              'span',
              { class: 'bars-track', attrs: { 'aria-hidden': 'true' } },
              el('span', {
                class: 'bars-fill',
                attrs: { style: `width:${Math.min(100, i.percent)}%` },
              }),
            ),
            el('span', { class: 'bars-detail', text: i.detail }),
          ),
        )
      : [el('li', { class: 'muted', text: 'Sem dados no período.' })]),
  );
}
