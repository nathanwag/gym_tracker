/* O dominio Y de um grafico de linha. Puro, sem DOM.
 *
 * Separado de charts.js porque era aqui que o risco morava e nao dava pra
 * testar: charts.js importa ui.js. curve.js ja tinha sido extraido pelo mesmo
 * motivo, mas ficou com a metade facil — ele desenha a curva DADAS as
 * coordenadas, e quem decide qual e o intervalo, e se o zero esta nele, e esta
 * conta.
 */

/** Maior passo "humano" (1, 2, 2.5, 5, 10, 25, 50...) que cobre o intervalo
 *  em cerca de `divisions` faixas. E o que faz o eixo cair em numeros redondos
 *  em vez de 80, 81, 83 — o grafico parece quebrado com rotulos tortos. */
export function roundStep(range, divisions) {
  if (!(range > 0)) return 1;
  const raw = range / divisions;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const n = raw / magnitude;
  const scale = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return scale * magnitude;
}

/** Piso, teto, passo e os ticks do eixo Y para `values`.
 *
 *  Folga de 12% pra linha nao encostar nas bordas, depois arredondada pra fora
 *  em multiplos de um passo redondo. O piso e preso em zero: carga e tempo nao
 *  sao negativos, e uma folga que descesse abaixo dele desenharia area de
 *  volume negativo sob a curva.
 *
 *  Valores todos iguais abrem um intervalo em volta — sem isso a divisao por
 *  (max - min) = 0 poe a linha no infinito. */
export function yScale(values, { divisions = 3, marginRatio = 0.12 } = {}) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min = Math.max(0, min * 0.9); max = max * 1.1 || 1; }

  const margin = (max - min) * marginRatio;
  const step = roundStep((max + margin) - Math.max(0, min - margin), divisions);
  min = Math.max(0, Math.floor((min - margin) / step) * step);
  max = Math.ceil((max + margin) / step) * step;

  const ticks = [];
  // A folga de 1e-9 fecha o ultimo tick quando o passo e fracionario e a soma
  // repetida para um fio abaixo de `max`.
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(v);

  return { min, max, step, ticks };
}
