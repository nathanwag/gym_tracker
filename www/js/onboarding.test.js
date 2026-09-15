import test from 'node:test';
import assert from 'node:assert/strict';

import { needsOnboarding, cleanName, MAX_NAME } from './onboarding.js';

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

/* O carimbo cobre quem atualiza o app (migracao v9) e quem passa pelo wizard,
 * mas nao quem RESTAURA um backup gerado antes da v9: replaceAll troca o store
 * de settings inteiro, e o backup antigo nao tem a chave. Sem esta rede, quem
 * troca de celular e importa 8 meses de treino cai no wizard. */
test('banco com historico nao abre o wizard, mesmo sem o carimbo', () => {
  assert.equal(needsOnboarding({ onboardedAt: null }, { used: true }), false);
});
