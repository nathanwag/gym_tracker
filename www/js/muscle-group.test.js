import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findGroup, groupLabel, usesDuration, groupMetric, exerciseMetric, groupOrder,
  groupColor, groupIcon, groupTokensCss,
} from './muscle-group.js';

/* Sem IndexedDB, db.groups() devolve CANONICAL_GROUPS — que e exatamente o
 * que o banco contem numa instalacao nova. Entao estes testes correm contra os
 * 17 grupos de verdade, sem mock nenhum. */

/* A invariante central do modulo: o catalogo grava `grupo: 'Peito'` e nunca
 * migra, enquanto o banco grava o slug desde a v7. Quem chama nao deveria
 * precisar saber disso — por isso a resolucao acontece uma vez, aqui dentro. */
test('resolve tanto o slug quanto o nome em portugues do catalogo', () => {
  assert.equal(findGroup('peito').slug, 'peito');
  assert.equal(findGroup('Peito').slug, 'peito');
  assert.equal(findGroup('Trapézio').slug, 'trapezio');
  assert.equal(findGroup('trapezio').slug, 'trapezio');
});

test('grupo desconhecido resolve pra null', () => {
  assert.equal(findGroup('nao-existe'), null);
  assert.equal(findGroup(''), null);
  assert.equal(findGroup(null), null);
});

test('groupLabel devolve o nome de exibicao, pelas duas chaves', () => {
  assert.equal(groupLabel('peito'), 'Peito');
  assert.equal(groupLabel('Peito'), 'Peito');
  assert.equal(groupLabel('abdomen'), 'Abdômen');
});

/* Rotulo de grupo que o app nao conhece e melhor que um vazio: e o que a
 * pessoa digitou, ou o que veio de um backup de outro aparelho. */
test('groupLabel devolve o proprio valor quando nao conhece o grupo', () => {
  assert.equal(groupLabel('Cadeia posterior'), 'Cadeia posterior');
});

test('usesDuration separa o que tem carga do que e medido em tempo', () => {
  assert.equal(usesDuration('cardio'), true);
  assert.equal(usesDuration('alongamento'), true);
  assert.equal(usesDuration('peito'), false);
  assert.equal(usesDuration('Cardio'), true);
});

test('usesDuration de grupo desconhecido e false, nao undefined', () => {
  assert.equal(usesDuration('nao-existe'), false);
});

/* As duas telas do Progresso perguntam coisas diferentes sobre a mesma
 * distincao: o indice do grupo compara volume, o do exercicio compara e1RM.
 * Ter as duas aqui e o que impede a linha do grupo e a do exercicio, que
 * aparecem uma embaixo da outra, de divergirem. */
test('groupMetric mede o grupo por volume, ou por tempo quando nao ha carga', () => {
  assert.equal(groupMetric('peito'), 'volume');
  assert.equal(groupMetric('cardio'), 'totalDuration');
});

test('exerciseMetric mede o exercicio por e1RM, ou por tempo quando nao ha carga', () => {
  assert.equal(exerciseMetric({ muscleGroup: 'peito' }), 'bestE1rm');
  assert.equal(exerciseMetric({ muscleGroup: 'cardio' }), 'totalDuration');
});

test('groupOrder devolve os slugs na ordem de uso, pra alimentar groupBy', () => {
  const order = groupOrder();
  assert.equal(order[0], 'peito');
  assert.equal(order[1], 'costas');
  assert.equal(order.at(-1), 'outros');
  assert.equal(order.length, 17);
});

/* O que motivou a reordenacao: eram o 5o e o 6o da lista, antes de Biceps. */
test('o que se treina de vez em quando fica no fim, nao no comeco', () => {
  const order = groupOrder();
  for (const slug of ['trapezio', 'pescoco', 'lombar', 'antebraco']) {
    assert.ok(order.indexOf(slug) > order.indexOf('abdomen'), `${slug} cedo demais`);
  }
  // ...mas ainda antes dos que nem tem carga.
  assert.ok(order.indexOf('pescoco') < order.indexOf('cardio'));
});

test('groupColor devolve o token, nao o hex, pelas duas chaves', () => {
  assert.equal(groupColor('peito'), 'var(--m-peito)');
  assert.equal(groupColor('Peito'), 'var(--m-peito)');
});

test('groupIcon veste a anilha com o pictograma do gesto', () => {
  const svg = groupIcon('peito');
  assert.match(svg, /<circle[^>]*fill="var\(--m-peito\)"/);
  assert.match(svg, /class="gicon__pose"/);
  assert.match(svg, /color:var\(--ink-peito\)/);
});

/* Grupo criado pelo usuario nao tem gesto: cai na anilha com a sigla, em vez
 * de ficar sem desenho. */
test('groupIcon de grupo sem pictograma cai na sigla', () => {
  const svg = groupIcon('cadeia-posterior');
  assert.match(svg, /class="gicon__sig"/);
  assert.doesNotMatch(svg, /class="gicon__pose"/);
});

/* A cascata tem que ser exatamente a mesma de styles.css — claro, escuro por
 * preferencia do sistema quando o tema nao esta travado em claro, e escuro
 * explicito. Errar um dos tres deixa a cor do grupo presa num tema so, sem
 * erro nenhum. Entrada literal de proposito: e a especificacao. */
test('groupTokensCss repete os tres blocos da cascata do styles.css', () => {
  const css = groupTokensCss([
    { slug: 'peito', colorLight: '#c94435', colorDark: '#ec6154' },
  ]);
  assert.equal(
    css,
    ':root{--m-peito:#c94435;--ink-peito:#ffffff}'
    + '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--m-peito:#ec6154;--ink-peito:#16171a}}'
    + ':root[data-theme="dark"]{--m-peito:#ec6154;--ink-peito:#16171a}',
  );
});

/* Dois tokens por grupo, nao um: a cor da anilha e a TINTA do pictograma
 * vazado nela. A tinta muda com o tema pelo mesmo motivo que a cor. */
test('groupTokensCss escreve cor e tinta pra cada grupo', () => {
  const css = groupTokensCss([
    { slug: 'a', colorLight: '#000000', colorDark: '#ffffff' },
    { slug: 'b', colorLight: '#ffffff', colorDark: '#000000' },
  ]);
  assert.match(css, /--m-a:#000000;--ink-a:#ffffff/);
  assert.match(css, /--m-b:#ffffff;--ink-b:#16171a/);
});
