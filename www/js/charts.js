/* Grafico de linha em SVG puro.
 *
 * Sem biblioteca: um Chart.js via CDN quebraria o modo offline e o
 * empacotamento nativo, e o que o app precisa e um unico tipo de grafico.
 *
 * Decisoes de leitura:
 *  - Uma serie so, entao nao ha legenda: o titulo acima do grafico ja diz o que
 *    e. Cor unica vinda do tema (--accent), que ja tem contraste nos dois modos.
 *  - Eixo X e temporal, nao por indice: um intervalo de dois meses sem treinar
 *    precisa aparecer como um vao, senao o grafico mente sobre o ritmo.
 *  - Rotulos so no primeiro, no ultimo e no melhor ponto. Numero em cima de todo
 *    ponto vira ruido e some com a tendencia, que e o que interessa.
 *  - Linha curva (ver curve.js) e sem bolinha em cada ponto: com 8 marcas a
 *    linha lia como serie de segmentos, nao como tendencia. A bolinha existe,
 *    invisivel, e aparece na ponta e no ponto tocado.
 *  - Toque em qualquer ponto abre o detalhe daquela sessao.
 */

import { smoothPath } from './curve.js';
import { fmtNum, fmtDateShort } from './ui.js';
import { t } from './i18n.js';

const W = 340;
const H = 190;
const PAD = { top: 18, right: 12, bottom: 24, left: 38 };

const escXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Maior passo "humano" (1, 2, 2.5, 5, 10, 25, 50...) que cobre o intervalo
 *  em cerca de `divisions` faixas. E o que faz o eixo cair em numeros redondos. */
function roundStep(range, divisions) {
  if (!(range > 0)) return 1;
  const raw = range / divisions;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const n = raw / magnitude;
  const scale = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return scale * magnitude;
}

/**
 * @param {{
 *   points: {when: string, value: number, label?: string}[],
 *   suffix?: string,
 *   decimals?: number,
 *   onTap?: (point, index) => void
 * }} opts
 * @returns {SVGElement|HTMLElement}
 */
export function lineChart({
  points, suffix = '', decimals = 0, onTap = null,
}) {
  if (!points || points.length === 0) {
    return element(`<div class="empty small">${t('charts.noData')}</div>`);
  }

  const plot = {
    x0: PAD.left,
    x1: W - PAD.right,
    y0: PAD.top,
    y1: H - PAD.bottom,
  };

  const values = points.map((p) => p.value);
  const times = points.map((p) => new Date(p.when).getTime());

  // Dominio Y: folga de 12% para a linha nao encostar nas bordas, depois
  // arredondado para fora em multiplos de um passo "redondo" — sem isso os
  // rotulos do eixo saem tortos (80, 81, 83) e o grafico parece quebrado.
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min = Math.max(0, min * 0.9); max = max * 1.1 || 1; }
  const margin = (max - min) * 0.12;
  const step = roundStep((max + margin) - Math.max(0, min - margin), 3);
  min = Math.max(0, Math.floor((min - margin) / step) * step);
  max = Math.ceil((max + margin) / step) * step;

  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const spanT = tMax - tMin;

  const sx = (i) => (spanT > 0
    ? plot.x0 + ((times[i] - tMin) / spanT) * (plot.x1 - plot.x0)
    : plot.x0 + (points.length === 1 ? (plot.x1 - plot.x0) / 2 : (i / (points.length - 1)) * (plot.x1 - plot.x0)));
  const sy = (v) => plot.y1 - ((v - min) / (max - min)) * (plot.y1 - plot.y0);

  const coords = points.map((p, i) => [sx(i), sy(p.value)]);

  /* --- grade e rotulos do eixo Y, em valores redondos e recessivos --- */
  const ticks = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(v);
  const gridLines = ticks.map((value) => {
    const y = sy(value);
    return `<line class="chart__grid" x1="${plot.x0}" y1="${y.toFixed(1)}" x2="${plot.x1}" y2="${y.toFixed(1)}"/>
            <text class="chart__label" x="${plot.x0 - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${fmtNum(value, decimals)}</text>`;
  }).join('');

  /* --- area e linha --- */
  const path = smoothPath(coords);
  const area = points.length > 1
    ? `<path class="chart__area" d="${path}L${coords[coords.length - 1][0].toFixed(1)},${plot.y1}L${coords[0][0].toFixed(1)},${plot.y1}Z"/>`
    : '';

  /* --- rotulos diretos: primeiro, ultimo e melhor --- */
  const maxIndex = values.indexOf(Math.max(...values));
  const highlighted = new Set([0, points.length - 1, maxIndex]);
  const labels = [...highlighted].map((i) => {
    const [x, y] = coords[i];
    const anchor = x < plot.x0 + 26 ? 'start' : x > plot.x1 - 26 ? 'end' : 'middle';
    // Ponto no alto ganha rotulo por baixo: acima ele encostaria na borda e,
    // no primeiro ponto, ficaria colado no rotulo do eixo Y.
    const isHigh = y < plot.y0 + (plot.y1 - plot.y0) * 0.45;
    const textY = isHigh ? y + 15 : y - 10;
    return `<text class="chart__label" x="${x.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="${anchor}" style="font-weight:700">${fmtNum(values[i], decimals)}${escXml(suffix)}</text>`;
  }).join('');

  /* --- eixo X: so as datas das pontas --- */
  const xAxisDates = points.length > 1
    ? `<text class="chart__label" x="${plot.x0}" y="${H - 6}" text-anchor="start">${fmtDateShort(points[0].when)}</text>
       <text class="chart__label" x="${plot.x1}" y="${H - 6}" text-anchor="end">${fmtDateShort(points[points.length - 1].when)}</text>`
    : `<text class="chart__label" x="${W / 2}" y="${H - 6}" text-anchor="middle">${fmtDateShort(points[0].when)}</text>`;

  // A bolinha fica no DOM mas invisivel: e o ancoradouro do estado "tocado".
  // So a ultima aparece sempre — e onde a leitura termina.
  const dots = coords
    .map(([x, y], i) => `<circle class="chart__dot${i === coords.length - 1 ? ' chart__dot--end' : ''}" data-i="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/>`)
    .join('');

  // Alvos de toque bem maiores que a bolinha: 8px de diametro e pequeno demais
  // para o dedo. Cada faixa cobre a metade da distancia ate o vizinho.
  const hitAreas = coords.map(([x], i) => {
    const prev = i > 0 ? coords[i - 1][0] : x;
    const next = i < coords.length - 1 ? coords[i + 1][0] : x;
    const left = i > 0 ? (x + prev) / 2 : plot.x0 - 8;
    const right = i < coords.length - 1 ? (x + next) / 2 : plot.x1 + 8;
    return `<rect class="chart__hit" data-i="${i}" x="${left.toFixed(1)}" y="${plot.y0 - 10}" width="${Math.max(8, right - left).toFixed(1)}" height="${(plot.y1 - plot.y0 + 20).toFixed(1)}"/>`;
  }).join('');

  const svg = element(`
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
         aria-label="${escXml(t('charts.ariaLabel', {
           n: points.length,
           start: fmtNum(values[0], decimals),
           end: fmtNum(values[values.length - 1], decimals) + suffix,
         }))}">
      ${gridLines}
      ${area}
      <path class="chart__line" d="${path}"/>
      ${dots}
      ${labels}
      ${xAxisDates}
      <g data-tooltip style="display:none"></g>
      ${hitAreas}
    </svg>
  `);

  wireInteraction(svg, {
    points, coords, plot, suffix, decimals, onTap,
  });
  return svg;
}

/* ---------- Tooltip e selecao ---------- */

function wireInteraction(svg, {
  points, coords, plot, suffix, decimals, onTap,
}) {
  const tooltipGroup = svg.querySelector('[data-tooltip]');
  let selected = null;

  const clear = () => {
    // display:none em vez do atributo hidden: em SVG o atributo nao esconde nada.
    tooltipGroup.style.display = 'none';
    tooltipGroup.innerHTML = '';
    svg.querySelectorAll('.chart__dot--active').forEach((d) => d.classList.remove('chart__dot--active'));
    selected = null;
  };

  const show = (i) => {
    if (selected === i) { clear(); return; }
    clear();
    selected = i;

    svg.querySelector(`.chart__dot[data-i="${i}"]`)?.classList.add('chart__dot--active');

    const point = points[i];
    const [x, y] = coords[i];
    const text = `${fmtNum(point.value, decimals)}${suffix}`;
    const date = fmtDateShort(point.when);
    const detail = point.label || '';

    const width = Math.max(58, text.length * 6.4, date.length * 5.4, detail.length * 5.2) + 14;
    const height = detail ? 46 : 34;
    const cx = Math.min(Math.max(x - width / 2, plot.x0 - 6), plot.x1 - width + 6);
    const cy = Math.max(plot.y0 - 12, y - height - 10);

    tooltipGroup.innerHTML = `
      <rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${width.toFixed(1)}" height="${height}"
            rx="8" fill="var(--surface)" stroke="var(--border)" stroke-width="1"/>
      <text x="${(cx + 8).toFixed(1)}" y="${(cy + 16).toFixed(1)}" fill="var(--text)"
            style="font-size:12px;font-weight:700" stroke="none">${escXml(text)}</text>
      <text x="${(cx + 8).toFixed(1)}" y="${(cy + 28).toFixed(1)}" fill="var(--muted)"
            style="font-size:10px" stroke="none">${escXml(date)}</text>
      ${detail ? `<text x="${(cx + 8).toFixed(1)}" y="${(cy + 40).toFixed(1)}" fill="var(--muted)"
            style="font-size:10px" stroke="none">${escXml(detail)}</text>` : ''}
    `;
    tooltipGroup.style.display = '';
    onTap?.(point, i);
  };

  svg.addEventListener('click', (e) => {
    const target = e.target.closest('[data-i]');
    if (target) show(Number(target.dataset.i));
    else clear();
  });
}

function element(markup) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = markup.trim();
  return wrapper.firstElementChild;
}
