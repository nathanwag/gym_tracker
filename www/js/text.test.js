import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSteps } from './text.js';

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
