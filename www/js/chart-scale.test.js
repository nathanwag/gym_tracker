import test from 'node:test';
import assert from 'node:assert/strict';

import { yScale, roundStep } from './chart-scale.js';

/* O dominio Y do grafico. Morava dentro de lineChart (charts.js), que importa
 * ui.js e nunca teve teste — enquanto curve.js, que so desenha a curva DADAS
 * as coordenadas, tinha tres. Mas quem decide se o zero esta na tela e esta
 * conta, nao a curva.
 *
 * Os numeros esperados aqui foram calculados a mao a partir da regra (folga de
 * 12%, passo "humano", arredonda pra fora), nao rodando o codigo. */

test('roundStep escolhe o passo humano que cobre o intervalo', () => {
  assert.equal(roundStep(37.2, 3), 20);
  assert.equal(roundStep(2.48, 3), 1);
  assert.equal(roundStep(19.84, 3), 10);
});

/* Intervalo degenerado: sem isto, dividir por (max - min) = 0 poe a linha
 * no infinito. */
test('roundStep devolve 1 quando nao ha intervalo', () => {
  assert.equal(roundStep(0, 3), 1);
  assert.equal(roundStep(-5, 3), 1);
});

test('o eixo cai em numeros redondos, com folga acima e abaixo', () => {
  assert.deepEqual(yScale([100, 130]), {
    min: 80, max: 140, step: 20, ticks: [80, 100, 120, 140],
  });
});

/* Carga e tempo nao sao negativos: uma folga que descesse abaixo de zero
 * desenharia area de volume negativo sob a curva. */
test('o piso nunca desce abaixo de zero', () => {
  const { min, ticks } = yScale([1, 3]);
  assert.equal(min, 0);
  assert.equal(ticks[0], 0);
});

/* Uma medicao so, ou todas iguais: sem abrir o intervalo a linha fica colada
 * numa borda e o eixo nao tem o que rotular. */
test('valores todos iguais abrem um intervalo em volta', () => {
  const { min, max, ticks } = yScale([80, 80]);
  assert.ok(min < 80 && max > 80, `nao abriu: ${min}..${max}`);
  assert.deepEqual(ticks, [70, 80, 90]);
});

/* O ultimo tick, quando o passo e fracionario.
 *
 * Somar 0.01 cinco vezes chega em 0.060000000000000005, um fio ACIMA do
 * teto 0.06 — sem a folga de 1e-9 na condicao do laco, a linha de topo do
 * grafico fica sem grade e sem rotulo. Este caso falha se a folga sair. */
test('o tick do teto sobrevive a soma de um passo fracionario', () => {
  const { ticks } = yScale([0.03, 0.05]);
  assert.deepEqual(
    ticks.map((t) => Math.round(t * 1000) / 1000),
    [0.02, 0.03, 0.04, 0.05, 0.06],
  );
});
