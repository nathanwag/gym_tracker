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
 *  - Toque em qualquer ponto abre o detalhe daquela sessao.
 */

import { fmtNum, fmtDateShort } from './ui.js';
import { t } from './i18n.js';

const W = 340;
const H = 190;
const PAD = { top: 18, right: 12, bottom: 24, left: 38 };

const escXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Maior passo "humano" (1, 2, 2.5, 5, 10, 25, 50...) que cobre o intervalo
 *  em cerca de `divisoes` faixas. E o que faz o eixo cair em numeros redondos. */
function passoRedondo(intervalo, divisoes) {
  if (!(intervalo > 0)) return 1;
  const bruto = intervalo / divisoes;
  const magnitude = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / magnitude;
  const escala = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return escala * magnitude;
}

/**
 * @param {{
 *   pontos: {quando: string, valor: number, rotulo?: string}[],
 *   sufixo?: string,
 *   decimais?: number,
 *   aoTocar?: (ponto, indice) => void
 * }} opts
 * @returns {SVGElement|HTMLElement}
 */
export function lineChart({ pontos, sufixo = '', decimais = 0, aoTocar = null }) {
  if (!pontos || pontos.length === 0) {
    return elemento(`<div class="empty small">${t('charts.semDados')}</div>`);
  }

  const plot = {
    x0: PAD.left,
    x1: W - PAD.right,
    y0: PAD.top,
    y1: H - PAD.bottom,
  };

  const valores = pontos.map((p) => p.valor);
  const tempos = pontos.map((p) => new Date(p.quando).getTime());

  // Dominio Y: folga de 12% para a linha nao encostar nas bordas, depois
  // arredondado para fora em multiplos de um passo "redondo" — sem isso os
  // rotulos do eixo saem tortos (80, 81, 83) e o grafico parece quebrado.
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  if (min === max) { min = Math.max(0, min * 0.9); max = max * 1.1 || 1; }
  const folga = (max - min) * 0.12;
  const passo = passoRedondo((max + folga) - Math.max(0, min - folga), 3);
  min = Math.max(0, Math.floor((min - folga) / passo) * passo);
  max = Math.ceil((max + folga) / passo) * passo;

  const tMin = Math.min(...tempos);
  const tMax = Math.max(...tempos);
  const spanT = tMax - tMin;

  const sx = (i) => (spanT > 0
    ? plot.x0 + ((tempos[i] - tMin) / spanT) * (plot.x1 - plot.x0)
    : plot.x0 + (pontos.length === 1 ? (plot.x1 - plot.x0) / 2 : (i / (pontos.length - 1)) * (plot.x1 - plot.x0)));
  const sy = (v) => plot.y1 - ((v - min) / (max - min)) * (plot.y1 - plot.y0);

  const coords = pontos.map((p, i) => [sx(i), sy(p.valor)]);

  /* --- grade e rotulos do eixo Y, em valores redondos e recessivos --- */
  const marcas = [];
  for (let v = min; v <= max + 1e-9; v += passo) marcas.push(v);
  const linhas = marcas.map((valor) => {
    const y = sy(valor);
    return `<line class="chart__grid" x1="${plot.x0}" y1="${y.toFixed(1)}" x2="${plot.x1}" y2="${y.toFixed(1)}"/>
            <text class="chart__label" x="${plot.x0 - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${fmtNum(valor, decimais)}</text>`;
  }).join('');

  /* --- area e linha --- */
  const caminho = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const area = pontos.length > 1
    ? `<path class="chart__area" d="${caminho}L${coords[coords.length - 1][0].toFixed(1)},${plot.y1}L${coords[0][0].toFixed(1)},${plot.y1}Z"/>`
    : '';

  /* --- rotulos diretos: primeiro, ultimo e melhor --- */
  const iMax = valores.indexOf(Math.max(...valores));
  const destacados = new Set([0, pontos.length - 1, iMax]);
  const rotulos = [...destacados].map((i) => {
    const [x, y] = coords[i];
    const ancora = x < plot.x0 + 26 ? 'start' : x > plot.x1 - 26 ? 'end' : 'middle';
    // Ponto no alto ganha rotulo por baixo: acima ele encostaria na borda e,
    // no primeiro ponto, ficaria colado no rotulo do eixo Y.
    const alto = y < plot.y0 + (plot.y1 - plot.y0) * 0.45;
    const yTexto = alto ? y + 15 : y - 10;
    return `<text class="chart__label" x="${x.toFixed(1)}" y="${yTexto.toFixed(1)}" text-anchor="${ancora}" style="font-weight:700">${fmtNum(valores[i], decimais)}${escXml(sufixo)}</text>`;
  }).join('');

  /* --- eixo X: so as datas das pontas --- */
  const datasX = pontos.length > 1
    ? `<text class="chart__label" x="${plot.x0}" y="${H - 6}" text-anchor="start">${fmtDateShort(pontos[0].quando)}</text>
       <text class="chart__label" x="${plot.x1}" y="${H - 6}" text-anchor="end">${fmtDateShort(pontos[pontos.length - 1].quando)}</text>`
    : `<text class="chart__label" x="${W / 2}" y="${H - 6}" text-anchor="middle">${fmtDateShort(pontos[0].quando)}</text>`;

  const bolinhas = coords
    .map(([x, y], i) => `<circle class="chart__dot" data-i="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/>`)
    .join('');

  // Alvos de toque bem maiores que a bolinha: 8px de diametro e pequeno demais
  // para o dedo. Cada faixa cobre a metade da distancia ate o vizinho.
  const alvos = coords.map(([x], i) => {
    const anterior = i > 0 ? coords[i - 1][0] : x;
    const proximo = i < coords.length - 1 ? coords[i + 1][0] : x;
    const esq = i > 0 ? (x + anterior) / 2 : plot.x0 - 8;
    const dir = i < coords.length - 1 ? (x + proximo) / 2 : plot.x1 + 8;
    return `<rect class="chart__hit" data-i="${i}" x="${esq.toFixed(1)}" y="${plot.y0 - 10}" width="${Math.max(8, dir - esq).toFixed(1)}" height="${(plot.y1 - plot.y0 + 20).toFixed(1)}"/>`;
  }).join('');

  const svg = elemento(`
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
         aria-label="${escXml(t('charts.ariaLabel', {
           n: pontos.length,
           inicio: fmtNum(valores[0], decimais),
           fim: fmtNum(valores[valores.length - 1], decimais) + sufixo,
         }))}">
      ${linhas}
      ${area}
      <path class="chart__line" d="${caminho}"/>
      ${bolinhas}
      ${rotulos}
      ${datasX}
      <g data-tooltip style="display:none"></g>
      ${alvos}
    </svg>
  `);

  ligarInteracao(svg, { pontos, coords, plot, sufixo, decimais, aoTocar });
  return svg;
}

/* ---------- Tooltip e selecao ---------- */

function ligarInteracao(svg, { pontos, coords, plot, sufixo, decimais, aoTocar }) {
  const grupo = svg.querySelector('[data-tooltip]');
  let selecionado = null;

  const limpar = () => {
    // display:none em vez do atributo hidden: em SVG o atributo nao esconde nada.
    grupo.style.display = 'none';
    grupo.innerHTML = '';
    svg.querySelectorAll('.chart__dot--active').forEach((d) => d.classList.remove('chart__dot--active'));
    selecionado = null;
  };

  const mostrar = (i) => {
    if (selecionado === i) { limpar(); return; }
    limpar();
    selecionado = i;

    svg.querySelector(`.chart__dot[data-i="${i}"]`)?.classList.add('chart__dot--active');

    const ponto = pontos[i];
    const [x, y] = coords[i];
    const texto = `${fmtNum(ponto.valor, decimais)}${sufixo}`;
    const data = fmtDateShort(ponto.quando);
    const detalhe = ponto.rotulo || '';

    const largura = Math.max(58, texto.length * 6.4, data.length * 5.4, detalhe.length * 5.2) + 14;
    const altura = detalhe ? 46 : 34;
    const cx = Math.min(Math.max(x - largura / 2, plot.x0 - 6), plot.x1 - largura + 6);
    const cy = Math.max(plot.y0 - 12, y - altura - 10);

    grupo.innerHTML = `
      <rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${largura.toFixed(1)}" height="${altura}"
            rx="8" fill="var(--surface)" stroke="var(--border)" stroke-width="1"/>
      <text x="${(cx + 8).toFixed(1)}" y="${(cy + 16).toFixed(1)}" fill="var(--text)"
            style="font-size:12px;font-weight:700" stroke="none">${escXml(texto)}</text>
      <text x="${(cx + 8).toFixed(1)}" y="${(cy + 28).toFixed(1)}" fill="var(--muted)"
            style="font-size:10px" stroke="none">${escXml(data)}</text>
      ${detalhe ? `<text x="${(cx + 8).toFixed(1)}" y="${(cy + 40).toFixed(1)}" fill="var(--muted)"
            style="font-size:10px" stroke="none">${escXml(detalhe)}</text>` : ''}
    `;
    grupo.style.display = '';
    aoTocar?.(ponto, i);
  };

  svg.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-i]');
    if (alvo) mostrar(Number(alvo.dataset.i));
    else limpar();
  });
}

function elemento(markup) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = markup.trim();
  return wrapper.firstElementChild;
}
