import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_GROUPS, groupSlug, uniqueGroupSlug, groupSlugFor, themeVariant, FALLBACK_GROUP, GROUP_LABELS_EN, groupsForRestore,
  inkOn, groupInitials,
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

test('todo grupo canonico tem rotulo em ingles', () => {
  for (const g of CANONICAL_GROUPS) {
    assert.ok(GROUP_LABELS_EN[g.slug], `${g.slug} sem rotulo EN`);
  }
});

/* O catalogo e imutavel e grava o nome em portugues ('Peito'); os exercicios
 * gravam slug. As duas telas chamam a mesma funcao de rotulo e cor, entao a
 * normalizacao tem que aceitar os dois. */
test('groupSlugFor casa nome do catalogo e slug no mesmo grupo', () => {
  assert.equal(groupSlugFor('Peito'), groupSlugFor('peito'));
  assert.equal(groupSlugFor('Quadríceps'), groupSlugFor('quadriceps'));
});

/* Restaurar backup exportado antes da v7: ele nao tem grupos, e o banco nao
 * pode ficar sem nenhum — sem grupo, todo exercicio perde cor, rotulo e a
 * linha do Progresso. */
test('groupsForRestore semeia os 17 quando o backup nao tras grupos', () => {
  const out = groupsForRestore(undefined, [{ muscleGroup: 'Peito' }]);
  assert.equal(out.length, CANONICAL_GROUPS.length);
  assert.ok(out.some((g) => g.slug === 'peito'));
});

test('groupsForRestore cria grupo pro que so aparece nos exercicios', () => {
  const out = groupsForRestore(undefined, [{ muscleGroup: 'Adutores' }, { muscleGroup: 'Adutores' }]);
  const adutores = out.filter((g) => g.slug === 'adutores');
  assert.equal(adutores.length, 1, 'nao pode duplicar');
  assert.equal(adutores[0].name, 'Adutores');
});

test('groupsForRestore preserva os grupos que o backup tras', () => {
  const out = groupsForRestore(
    [{ slug: 'adutores', name: 'Adutores', colorLight: '#111111', colorDark: '#222222', usesDuration: true, order: 3 }],
    [],
  );
  const found = out.find((g) => g.slug === 'adutores');
  assert.equal(found.colorLight, '#111111');
  assert.equal(found.usesDuration, true);
});

test('groupsForRestore devolve ordens contiguas a partir de zero', () => {
  const out = groupsForRestore(undefined, [{ muscleGroup: 'Adutores' }]);
  assert.deepEqual(out.map((g) => g.order), out.map((_, i) => i));
});

/* ---------- inkOn: a tinta do pictograma sobre a anilha ----------
 *
 * Contraste WCAG calculado aqui de proposito, a partir da formula da norma:
 * o teste precisa de uma fonte de verdade independente do que o modulo faz,
 * senao ele so repete a conta da implementacao e nunca discorda dela. */
function relLuminance(hex) {
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a, b) {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('inkOn devolve tinta clara sobre cor escura e escura sobre cor clara', () => {
  assert.equal(inkOn('#000000'), '#ffffff');
  assert.equal(inkOn('#ffffff'), '#16171a');
});

/* Exemplos trabalhados a mao a partir da norma, nao recalculados pelo modulo:
 * em #ec6154 a tinta escura da 5.47 contra 3.28 da clara, entao a escura
 * ganha mesmo a cor parecendo "forte"; em #1c3a63 e o inverso, 11.5 a 1.62. */
test('inkOn escolhe pela conta, nao pela aparencia da cor', () => {
  assert.equal(inkOn('#ec6154'), '#16171a');
  assert.equal(inkOn('#1c3a63'), '#ffffff');
  assert.equal(inkOn('#9aa1ab'), '#16171a');
});

/* 3:1 e o piso da WCAG 1.4.11 (contraste de elemento nao-textual), que e a
 * regra que rege um pictograma. Nao e 4.5: esse e o piso de TEXTO, e com ele
 * #1e8b92 (quadriceps claro) reprovaria por 4.41 sem que exista tinta capaz
 * de salva-lo — a cor vive no meio da faixa de luminancia. Quem escolhe a
 * paleta e o DESIGN.md, nao este teste. */
test('a tinta escolhida passa em 1.4.11 nos 17 grupos, nos dois temas', () => {
  for (const g of CANONICAL_GROUPS) {
    for (const key of ['colorLight', 'colorDark']) {
      const ratio = contrast(inkOn(g[key]), g[key]);
      assert.ok(ratio >= 3, `${g.slug}.${key}: ${ratio.toFixed(2)} abaixo de 3`);
    }
  }
});

test('inkOn aceita a cor que o usuario escolher no picker', () => {
  for (const hex of ['#7f7f7f', '#00ff00', '#123456', '#fedcba']) {
    assert.match(inkOn(hex), /^#[0-9a-f]{6}$/);
  }
});

/* ---------- groupInitials: a sigla da anilha sem pose ----------
 *
 * So o grupo criado pelo usuario chega aqui — os 17 tem pictograma. Mas ela
 * sai do ROTULO EXIBIDO, entao muda de idioma junto com o app, e por isso
 * precisa desempatar sozinha. */

test('groupInitials pega as tres primeiras letras, sem acento', () => {
  assert.equal(groupInitials('Peito'), 'PEI');
  assert.equal(groupInitials('Glúteos'), 'GLU');
  assert.equal(groupInitials('Trapézio'), 'TRA');
  assert.equal(groupInitials('Tríceps'), 'TRI');
});

test('groupInitials desempata pela inicial da palavra seguinte', () => {
  assert.equal(groupInitials('Peitoral superior', ['PEI']), 'PES');
  assert.equal(groupInitials('Peitoral inferior', ['PEI', 'PES']), 'PEI2');
});

test('groupInitials cai em digito quando nao ha segunda palavra', () => {
  assert.equal(groupInitials('Peito', ['PEI']), 'PEI2');
  assert.equal(groupInitials('Peito', ['PEI', 'PEI2']), 'PEI3');
});

test('groupInitials aguenta rotulo curto ou so com simbolo', () => {
  assert.equal(groupInitials('Ab'), 'AB');
  assert.ok(groupInitials('!!!').length > 0);
  assert.ok(groupInitials('').length > 0);
});

test('os 17 rotulos dao 17 siglas distintas, em portugues e em ingles', () => {
  for (const labels of [
    CANONICAL_GROUPS.map((g) => g.name),
    CANONICAL_GROUPS.map((g) => GROUP_LABELS_EN[g.slug]),
  ]) {
    const taken = [];
    for (const label of labels) taken.push(groupInitials(label, taken));
    assert.equal(new Set(taken).size, 17, `colidiu: ${taken.join(' ')}`);
  }
});
