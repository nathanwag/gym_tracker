import test from 'node:test';
import assert from 'node:assert/strict';

import { stepperValue } from './stepper-value.js';

/* O nucleo numerico dos botoes +/- de peso e reps. Morava dentro de
 * createStepper (ui.js), junto do DOM, entao nunca teve teste — enquanto o
 * weight-step.js, que so valida o PASSO, tinha seis. O que o passo causa
 * valia menos que o passo. */

const peso = stepperValue({ min: 0, max: 9999, decimals: 1 });
const reps = stepperValue({ min: 0, max: 9999, decimals: 0 });

test('aceita virgula decimal, que e o que o teclado pt oferece', () => {
  assert.equal(peso.read('7,5'), 7.5);
  assert.equal(peso.read('7.5'), 7.5);
});

test('o que nao e numero le como zero, em vez de NaN na tela', () => {
  assert.equal(peso.read(''), 0);
  assert.equal(peso.read('abc'), 0);
});

test('prende no intervalo', () => {
  const r = stepperValue({ min: 0, max: 10, decimals: 0 });
  assert.equal(r.read('50'), 10);
  assert.equal(r.read('-5'), 0);
  assert.equal(r.format(50), '10');
});

/* O arredondamento existe pra somar passo repetidas vezes nao acumular lixo
 * binario: sem ele o peso chega em 2.4999999999999996 e a tela mostra isso. */
test('soma repetida nao acumula lixo de ponto flutuante', () => {
  let v = '0';
  for (let i = 0; i < 3; i += 1) v = peso.next(v, 0.1);
  assert.equal(v, '0.3');
});

test('next soma o passo e devolve texto pro input', () => {
  assert.equal(peso.next('7,5', 2.5), '10');
  assert.equal(reps.next('8', 1), '9');
});

test('next respeita o intervalo nos dois sentidos', () => {
  const r = stepperValue({ min: 0, max: 10, decimals: 0 });
  assert.equal(r.next('0', -1), '0');
  assert.equal(r.next('10', 1), '10');
});

test('format trata ausencia como zero', () => {
  assert.equal(peso.format(undefined), '0');
  assert.equal(peso.format(NaN), '0');
});
