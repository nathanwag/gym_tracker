import test from 'node:test';
import assert from 'node:assert/strict';

import { rememberAdded, takeAddedTo } from './exercise-picker.js';

/* A entrega do seletor pra tela que o chamou.
 *
 * Ela atravessa uma navegacao de hash, entao nao pode ser evento: quem le so
 * existe depois que o seletor saiu do ar. O que ela PODE ter e destinatario —
 * antes guardava so o id do exercicio, e quem lesse primeiro ficava com ele,
 * fosse ou nao o treino a que o exercicio foi adicionado. O `?.` do
 * querySelector fazia a entrega errada falhar sem ruido. */

test('sem nada pendente, ninguem recebe', () => {
  assert.equal(takeAddedTo(1), null);
});

test('o treino a que o exercicio foi adicionado recebe o id', () => {
  rememberAdded(7, 42);
  assert.equal(takeAddedTo(7), 42);
});

test('a leitura e destrutiva: rolar ate o exercicio acontece uma vez so', () => {
  rememberAdded(7, 42);
  assert.equal(takeAddedTo(7), 42);
  assert.equal(takeAddedTo(7), null);
});

/* Quem nao e o destinatario nao recebe — e tambem nao consome: a carta
 * continua esperando a tela certa. */
test('outro treino nao recebe, e nao consome a entrega alheia', () => {
  rememberAdded(7, 42);
  assert.equal(takeAddedTo(9), null);
  assert.equal(takeAddedTo(7), 42);
});
