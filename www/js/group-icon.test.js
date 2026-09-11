import test from 'node:test';
import assert from 'node:assert/strict';

import { CANONICAL_GROUPS } from './groups.js';
import { POSES, plateIcon } from './group-icon.js';

/* Amarra os dois modulos: `group-icon.js` nao importa nada de proposito (e o
 * que o deixa rodar sob node --test), entao quem cobra que os 17 estao
 * cobertos e o teste, nao o codigo. Grupo novo na semente sem pictograma
 * quebra aqui em vez de aparecer mudo na tela. */
test('todo grupo canonico tem pictograma', () => {
  for (const g of CANONICAL_GROUPS) {
    assert.ok(POSES[g.slug], `${g.slug} sem pictograma`);
  }
});

/* Pictograma repetido e o bug que o conjunto antigo tinha: 17 desenhos que
 * liam igual. Se dois slugs compartilham o mesmo caminho, foi copia e cola. */
test('os 17 pictogramas sao desenhos distintos', () => {
  const desenhos = CANONICAL_GROUPS.map((g) => POSES[g.slug]);
  assert.equal(new Set(desenhos).size, desenhos.length);
});

test('todo pictograma e fragmento SVG fechado', () => {
  for (const [slug, d] of Object.entries(POSES)) {
    assert.match(d, /^</, `${slug} nao comeca em tag`);
    assert.equal(d.split('"').length % 2, 1, `${slug} tem aspas impares`);
    assert.equal((d.match(/</g) || []).length, (d.match(/>/g) || []).length,
      `${slug} tem tags desbalanceadas`);
  }
});

/* ---------- plateIcon: a anilha montada ----------
 *
 * `color` e `ink` chegam prontos como string porque quem sabe deles e o CSS:
 * `ui.js` passa `var(--m-peito)` e `var(--ink-peito)`, e trocar de tema segue
 * sendo coisa da cascata, nao do JS — a mesma razao que faz `groupColor()`
 * devolver var() em vez de hex. */
const anilha = (over = {}) => plateIcon({
  slug: 'peito', color: 'var(--m-peito)', ink: 'var(--ink-peito)', ...over,
});

test('plateIcon devolve um svg fechado, com a anilha na cor do grupo', () => {
  const out = anilha();
  assert.match(out, /^<svg /);
  assert.match(out, /<\/svg>$/);
  assert.match(out, /<circle[^>]*fill="var\(--m-peito\)"/);
});

test('plateIcon vaza o pictograma do grupo na tinta', () => {
  const out = anilha();
  assert.ok(out.includes(POSES.peito), 'o pictograma de peito nao entrou');
  assert.match(out, /var\(--ink-peito\)/);
  assert.doesNotMatch(out, /<text/, 'com pose desenhada nao deve haver sigla');
});

/* A degradacao: grupo criado pelo usuario nao tem gesto, entao cai na sigla —
 * que era a vencedora da rodada anterior e vira o plano B do sistema. Isso e o
 * que apaga a excecao "grupo novo nao ganha desenho". */
test('plateIcon cai na sigla quando o grupo nao tem pictograma', () => {
  const out = anilha({ slug: 'adutores', initials: 'ADU' });
  assert.match(out, /<circle[^>]*fill="var\(--m-peito\)"/);
  assert.match(out, /<text[^>]*>ADU<\/text>/);
});

test('plateIcon desenha a anilha lisa se nao vier nem pose nem sigla', () => {
  const out = anilha({ slug: 'adutores' });
  assert.match(out, /<circle/);
  assert.doesNotMatch(out, /<text/);
});

/* A sigla nasce de um nome digitado pelo usuario. `groupInitials` ja so devolve
 * [A-Z0-9], mas este modulo nao pode depender disso pra nao ser a unica peca do
 * app que confia na entrada — `ui.js` escapa toda interpolacao por padrao. */
test('plateIcon escapa a sigla que recebe', () => {
  const out = anilha({ slug: 'adutores', initials: '<script>x</script>' });
  assert.doesNotMatch(out, /<script/);
  assert.match(out, /&lt;script&gt;/);
});
