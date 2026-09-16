import test from 'node:test';
import assert from 'node:assert/strict';

import { needsOnboarding, ensureOnboarded, cleanName, MAX_NAME } from './onboarding.js';

test('sem carimbo de primeiro acesso, o app abre nas boas-vindas', () => {
  assert.equal(needsOnboarding({ onboardedAt: null }), true);
});

/* O carimbo e o que impede quem ja usa o app de cair no wizard: a migracao v9
 * o grava em todo banco que ja existia. Qualquer valor presente conta — o
 * conteudo so serve pra saber QUANDO foi. */
test('com o carimbo gravado, o app abre normalmente', () => {
  assert.equal(needsOnboarding({ onboardedAt: '2026-09-14T12:00:00.000Z' }), false);
});

/* O nome vai pro avatar do Perfil via initials() e pro cabecalho da tela. Quem
 * digita no celular erra o espaco: "  Nathan   Wagner " nao pode virar duas
 * iniciais erradas nem um titulo com buraco no meio. */
test('cleanName tira as pontas e colapsa o espaco do meio', () => {
  assert.equal(cleanName('  Nathan   Wagner '), 'Nathan Wagner');
});

/* O nome e desenhado numa linha so, ao lado do avatar (.phead). O input leva
 * maxlength, mas o corte mora aqui tambem: colar um paragrafo no campo e o que
 * o teclado do celular faz de mais facil. */
test('cleanName corta no limite que a tela do Perfil aguenta', () => {
  assert.equal(cleanName('a'.repeat(MAX_NAME + 20)).length, MAX_NAME);
});

/* Nome so com espaco tem que sair vazio, e nao virar " ": profileName vazio e
 * o que faz o Perfil cair no avatar sem iniciais (ver DEFAULT_SETTINGS). */
test('cleanName devolve vazio pro que nao tem letra nenhuma', () => {
  assert.equal(cleanName('   '), '');
  assert.equal(cleanName(null), '');
  assert.equal(cleanName(undefined), '');
});

/* ensureOnboarded() e a rede pros dois casos que a migracao v9 nao alcanca: o
 * backup gerado ANTES dela (replaceAll troca o store de settings inteiro) e o
 * banco que ja tinha dado por outro caminho. O banco entra por parametro
 * porque e um boundary — o mesmo seam do demo.test.js. */
function fakeStore({ onboardedAt = null, exercises = [], workouts = [] } = {}) {
  const cfg = { onboardedAt };
  const lidas = [];
  return {
    cfg,
    lidas,
    settings: () => cfg,
    listExercises: async () => { lidas.push('exercises'); return exercises; },
    listWorkouts: async () => { lidas.push('workouts'); return workouts; },
    setSetting: async (key, value) => { cfg[key] = value; },
  };
}

/* Quem troca de celular e importa 8 meses de treino nao pode cair no wizard. */
test('banco com historico ganha o carimbo sem passar pelo wizard', async () => {
  const store = fakeStore({ workouts: [{ id: 1 }] });

  await ensureOnboarded({ store });

  assert.ok(store.cfg.onboardedAt, 'ficou sem carimbo: o app abriria nas boas-vindas');
});

/* O outro lado: banco vazio e exatamente quem DEVE ver o wizard. Carimbar aqui
 * faria o primeiro acesso nunca acontecer. */
test('banco vazio segue sem carimbo, que e quem ve as boas-vindas', async () => {
  const store = fakeStore();

  await ensureOnboarded({ store });

  assert.equal(store.cfg.onboardedAt, null);
});

/* Roda em toda abertura do app: com o carimbo no lugar nao pode custar duas
 * leituras de tabela inteira. */
test('com o carimbo gravado, nem chega a ler o banco', async () => {
  const store = fakeStore({ onboardedAt: '2026-09-14T12:00:00.000Z' });

  await ensureOnboarded({ store });

  assert.deepEqual(store.lidas, []);
});
