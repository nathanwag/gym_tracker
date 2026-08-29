import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smoothPath } from './curve.js';

test('smoothPath comeca no primeiro ponto e termina no ultimo', () => {
  const d = smoothPath([[0, 100], [50, 60], [100, 20]]);
  assert.match(d, /^M0,100/);
  assert.match(d, /100,20$/);
});

/** Avalia a cubica de Bezier em t — formula padrao, independente da
 *  implementacao, pra o teste nao recalcular a curva do mesmo jeito que ela. */
function bezierY(y0, c1, c2, y1, t) {
  const u = 1 - t;
  return u * u * u * y0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * y1;
}

/** Quebra o path em trechos [y0, c1y, c2y, y1] pra amostrar cada um. */
function segments(d) {
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const out = [];
  let y = nums[1]; // depois do M x,y
  for (let i = 2; i < nums.length; i += 6) {
    const [, c1y, , c2y, , y1] = nums.slice(i, i + 6);
    out.push([y, c1y, c2y, y1]);
    y = y1;
  }
  return out;
}

test('smoothPath nao ultrapassa os proprios pontos num salto do zero', () => {
  // Duas semanas sem treino e uma cheia: com spline comum a barriga da curva
  // desce abaixo do eixo e o grafico mostra volume negativo.
  const d = smoothPath([[0, 180], [50, 180], [100, 40], [150, 20]]);
  for (const [y0, c1, c2, y1] of segments(d)) {
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    for (let t = 0; t <= 1; t += 0.05) {
      const y = bezierY(y0, c1, c2, y1, t);
      assert.ok(y >= lo - 1e-6 && y <= hi + 1e-6, `y=${y} fora de [${lo}, ${hi}]`);
    }
  }
});

test('smoothPath nao produz NaN quando dois pontos caem no mesmo x', () => {
  const d = smoothPath([[0, 100], [50, 60], [50, 40], [100, 20]]);
  assert.ok(!d.includes('NaN'), d);
});
