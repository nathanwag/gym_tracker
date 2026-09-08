import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_GROUPS, groupSlug, uniqueGroupSlug, groupSlugFor, themeVariant, FALLBACK_GROUP,
} from './groups.js';

/* Os slugs dos 17 nao podem mudar: a rota #/progresso/<slug> ja os serve, e
 * exercicios gravados vao passar a apontar pra eles. Lista literal de
 * proposito — e a especificacao, nao um recalculo do que o modulo faz. */
const SLUGS = [
  'peito', 'costas', 'lombar', 'ombros', 'trapezio', 'pescoco',
  'biceps', 'triceps', 'quadriceps', 'posterior', 'gluteos',
  'panturrilha', 'abdomen', 'antebraco', 'cardio', 'alongamento', 'outros',
];

test('CANONICAL_GROUPS traz os 17 grupos na ordem anatomica', () => {
  assert.deepEqual(CANONICAL_GROUPS.map((g) => g.slug), SLUGS);
});

test('cada grupo canonico tem nome em portugues e as duas cores', () => {
  for (const g of CANONICAL_GROUPS) {
    assert.ok(g.name && typeof g.name === 'string', `${g.slug} sem nome`);
    assert.match(g.colorLight, /^#[0-9a-f]{6}$/, `${g.slug}: colorLight`);
    assert.match(g.colorDark, /^#[0-9a-f]{6}$/, `${g.slug}: colorDark`);
  }
});

test('so Cardio e Alongamento sao medidos em tempo', () => {
  const byTime = CANONICAL_GROUPS.filter((g) => g.usesDuration).map((g) => g.slug);
  assert.deepEqual(byTime, ['cardio', 'alongamento']);
});

test('groupSlug tira acento, caixa e pontuacao', () => {
  assert.equal(groupSlug('Quadríceps'), 'quadriceps');
  assert.equal(groupSlug('Adutores'), 'adutores');
  assert.equal(groupSlug('  Glúteos  '), 'gluteos');
  assert.equal(groupSlug('Peito!!'), 'peito');
});

test('groupSlug junta palavras com hifen', () => {
  assert.equal(groupSlug('Cadeia posterior'), 'cadeia-posterior');
  assert.equal(groupSlug('Core   profundo'), 'core-profundo');
});

/* Amarra o seam 1 ao 2: se alguem editar um nome da semente sem editar o slug,
 * ou vice-versa, isto acusa. */
test('o nome de cada grupo canonico gera o proprio slug', () => {
  for (const g of CANONICAL_GROUPS) assert.equal(groupSlug(g.name), g.slug);
});

test('nome sem nenhuma letra cai num fallback utilizavel', () => {
  assert.equal(groupSlug('   '), 'grupo');
  assert.equal(groupSlug('!!!'), 'grupo');
});

test('uniqueGroupSlug numera a partir do segundo homonimo', () => {
  assert.equal(uniqueGroupSlug('Adutores', []), 'adutores');
  assert.equal(uniqueGroupSlug('Peito', ['peito']), 'peito-2');
  assert.equal(uniqueGroupSlug('Peito', ['peito', 'peito-2']), 'peito-3');
});

test('uniqueGroupSlug aceita Set e e deterministico', () => {
  const existing = new Set(['peito', 'peito-2']);
  assert.equal(uniqueGroupSlug('Peito', existing), 'peito-3');
  assert.equal(uniqueGroupSlug('Peito', existing), 'peito-3');
});

/* Buraco no meio nao e reaproveitado: 'peito-2' apagado nao deve ser
 * reatribuido, senao um exercicio orfao volta a apontar pro grupo errado. */
test('uniqueGroupSlug nao reusa buraco deixado por grupo apagado', () => {
  assert.equal(uniqueGroupSlug('Peito', ['peito', 'peito-3']), 'peito-4');
});

test('groupSlugFor converte os 17 valores gravados hoje', () => {
  for (const g of CANONICAL_GROUPS) assert.equal(groupSlugFor(g.name), g.slug);
});

/* Grupo que nao esta na semente (backup antigo, dado de borda) vira o slug
 * DELE, nao 'outros': fundir tudo em Outros misturaria exercicios de grupos
 * diferentes num so, e isso nao tem volta. */
test('groupSlugFor preserva grupo desconhecido em vez de fundir em Outros', () => {
  assert.equal(groupSlugFor('Adutores'), 'adutores');
  assert.equal(groupSlugFor('Cadeia posterior'), 'cadeia-posterior');
});

test('groupSlugFor manda exercicio sem grupo pra Outros', () => {
  assert.equal(groupSlugFor(null), 'outros');
  assert.equal(groupSlugFor(undefined), 'outros');
  assert.equal(groupSlugFor(''), 'outros');
});

/* Migracao que aborta roda de novo na proxima abertura, entao ela precisa
 * atravessar valor ja convertido sem estraga-lo. */
test('groupSlugFor e idempotente sobre valor ja convertido', () => {
  assert.equal(groupSlugFor('peito'), 'peito');
  assert.equal(groupSlugFor('cadeia-posterior'), 'cadeia-posterior');
});

/* Instrumento de medida do teste, nao copia da implementacao: le matiz e
 * luminosidade de um hex pra poder cobrar propriedades do resultado. */
function hsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const l = (max + min) / 2; const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
    : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

test('themeVariant devolve hex de 6 digitos', () => {
  assert.match(themeVariant('#c94435', 'dark'), /^#[0-9a-f]{6}$/);
  assert.match(themeVariant('#ec6154', 'light'), /^#[0-9a-f]{6}$/);
});

test('themeVariant clareia pro escuro e escurece pro claro', () => {
  assert.ok(hsl(themeVariant('#c94435', 'dark')).l > hsl('#c94435').l);
  assert.ok(hsl(themeVariant('#ec6154', 'light')).l < hsl('#ec6154').l);
});

/* A paleta feita a mao so desvia ate 2.9 graus de matiz entre os dois temas —
 * a derivacao nao pode desviar mais que isso, senao muda a cor, nao o tema. */
test('themeVariant preserva o matiz', () => {
  for (const g of CANONICAL_GROUPS) {
    const derived = themeVariant(g.colorLight, 'dark');
    assert.ok(hueGap(hsl(derived).h, hsl(g.colorLight).h) <= 3,
      `${g.slug}: matiz andou ${hueGap(hsl(derived).h, hsl(g.colorLight).h).toFixed(1)} graus`);
  }
});

/* O valor esperado vem das 17 cores escuras que foram desenhadas a mao, nao da
 * formula: se a derivacao passar longe delas, ela nao esta reproduzindo a
 * direcao de design, so inventando outra. */
test('derivar as 17 claras chega perto das escuras reais', () => {
  const erros = CANONICAL_GROUPS.map((g) => Math.abs(
    hsl(themeVariant(g.colorLight, 'dark')).l - hsl(g.colorDark).l,
  ));
  const media = erros.reduce((a, b) => a + b) / erros.length;
  assert.ok(media < 0.04, `erro medio de luminosidade ${media.toFixed(3)}`);
  assert.ok(Math.max(...erros) < 0.09, `pior erro ${Math.max(...erros).toFixed(3)}`);
});

test('themeVariant nao estoura nos extremos', () => {
  assert.match(themeVariant('#ffffff', 'dark'), /^#[0-9a-f]{6}$/);
  assert.match(themeVariant('#000000', 'light'), /^#[0-9a-f]{6}$/);
});

/* Se alguem renomear o slug 'outros' na semente, o destino de quem perde o
 * grupo deixa de existir e os exercicios somem de toda tela que agrupa. */
test('FALLBACK_GROUP aponta pra um grupo que existe na semente', () => {
  assert.ok(CANONICAL_GROUPS.some((g) => g.slug === FALLBACK_GROUP));
  assert.equal(groupSlugFor(null), FALLBACK_GROUP);
});
