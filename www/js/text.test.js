import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSteps, sameSteps } from './text.js';

test('cleanSteps apara espaco em branco de cada passo', () => {
  assert.deepEqual(cleanSteps(['  Segure a barra  ', 'Desça devagar\n']), ['Segure a barra', 'Desça devagar']);
});

test('cleanSteps descarta passos vazios ou só com espaço', () => {
  assert.deepEqual(cleanSteps(['Primeiro', '', '   ', 'Segundo']), ['Primeiro', 'Segundo']);
});

test('cleanSteps preserva a ordem original', () => {
  assert.deepEqual(cleanSteps(['C', 'A', 'B']), ['C', 'A', 'B']);
});

test('cleanSteps com lista vazia devolve lista vazia', () => {
  assert.deepEqual(cleanSteps([]), []);
});

test('sameSteps: mesmo conteúdo na mesma ordem é igual', () => {
  assert.equal(sameSteps(['Agache', 'Suba'], ['Agache', 'Suba']), true);
});

test('sameSteps: conteúdo diferente não é igual', () => {
  assert.equal(sameSteps(['Agache', 'Suba'], ['Agache', 'Desça']), false);
});

test('sameSteps: mesma lista reordenada não é igual', () => {
  assert.equal(sameSteps(['Agache', 'Suba'], ['Suba', 'Agache']), false);
});

test('sameSteps: ignora espaço em branco e passos vazios', () => {
  assert.equal(sameSteps(['  Agache ', '', 'Suba'], ['Agache', 'Suba\n']), true);
});

test('sameSteps: quantidade diferente de passos não é igual', () => {
  assert.equal(sameSteps(['Agache'], ['Agache', 'Suba']), false);
});

test('sameSteps: duas listas vazias são iguais', () => {
  assert.equal(sameSteps([], []), true);
});
