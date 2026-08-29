/* Interpolacao de curva para o grafico de linha.
 *
 * Modulo puro, sem import nenhum, pelo mesmo motivo de text.js: e geometria
 * que da pra errar sem perceber (uma curva que passa por baixo do zero
 * desenha volume negativo), e so assim ela roda sob `node --test`. Quem monta
 * o SVG e charts.js.
 */

/**
 * Caminho SVG suave passando por todos os pontos.
 *
 * Interpolacao cubica MONOTONA (Fritsch-Carlson), nao Catmull-Rom: uma spline
 * comum extrapola nas curvas e, numa serie que sai do zero (semana sem treino
 * seguida de uma cheia), a barriga da curva desce abaixo do eixo e o grafico
 * passa a mostrar valor negativo. A monotona nunca ultrapassa os proprios
 * pontos — entre dois pontos ela fica sempre entre os dois.
 *
 * @param {[number, number][]} coords pontos ja em coordenadas de tela, com x crescente
 * @returns {string} comandos de path (M/C), ou '' se nao houver ponto
 */
export function smoothPath(coords) {
  if (!coords || coords.length === 0) return '';
  const n = coords.length;
  const start = `M${fmt(coords[0][0])},${fmt(coords[0][1])}`;
  if (n === 1) return start;

  // Inclinacao de cada trecho. dx == 0 (dois pontos no mesmo x) daria divisao
  // por zero e contaminaria o path inteiro com NaN.
  const slopes = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0];
    slopes.push(dx === 0 ? 0 : (coords[i + 1][1] - coords[i][1]) / dx);
  }

  // Tangente em cada ponto: media das duas inclinacoes vizinhas.
  const tangents = new Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    // Mudanca de sentido (subia, passou a descer) vira topo plano: e isso que
    // impede a curva de estufar alem do ponto.
    tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  }

  // Limite de Fritsch-Carlson: encolhe as tangentes de um trecho quando elas
  // sao ingremes demais para caber entre os dois pontos sem ultrapassar.
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) { tangents[i] = 0; tangents[i + 1] = 0; continue; }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      tangents[i] = k * a * slopes[i];
      tangents[i + 1] = k * b * slopes[i];
    }
  }

  // Hermite -> Bezier: os controles ficam a um terco do trecho, na direcao da
  // tangente de cada ponta.
  let d = start;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[i + 1];
    const dx = (x1 - x0) / 3;
    d += `C${fmt(x0 + dx)},${fmt(y0 + tangents[i] * dx)}`
      + ` ${fmt(x1 - dx)},${fmt(y1 - tangents[i + 1] * dx)}`
      + ` ${fmt(x1)},${fmt(y1)}`;
  }
  return d;
}

const fmt = (v) => Number(v.toFixed(2));
