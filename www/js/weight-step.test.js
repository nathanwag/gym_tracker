import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWeightStep, weightStep, MIN_STEP, MAX_STEP } from './weight-step.js';

test('aceita vírgula decimal, como o teclado do celular oferece', () => {
  assert.equal(parseWeightStep('1,5'), 1.5);
});

test('devolve null para o que não é um passo utilizável', () => {
  // Passo 0 congela os botoes +/- e passo negativo os inverte.
  assert.equal(parseWeightStep(''), null);
  assert.equal(parseWeightStep('   '), null);
  assert.equal(parseWeightStep('abc'), null);
  assert.equal(parseWeightStep('0'), null);
  assert.equal(parseWeightStep('-2,5'), null);
  assert.equal(parseWeightStep(undefined), null);
});

test('recusa passo fora do intervalo utilizável', () => {
  assert.equal(parseWeightStep('0,05'), null);
  assert.equal(parseWeightStep('100'), null);
  assert.equal(parseWeightStep(String(MIN_STEP)), MIN_STEP);
  assert.equal(parseWeightStep(String(MAX_STEP)), MAX_STEP);
});

test('arredonda em 2 casas: o passo é uma anilha, não uma conversão', () => {
  // 5 lb em kg; sem arredondar, todo peso da sessao herdaria as 5 casas.
  assert.equal(parseWeightStep('2,2679'), 2.27);
  assert.equal(parseWeightStep('1,25'), 1.25);
});

test('aceita o número já gravado, para sanear o que veio de um backup', () => {
  assert.equal(parseWeightStep(2.5), 2.5);
  assert.equal(parseWeightStep(-1), null);
});

test('weightStep cai no padrão quando o que está gravado não serve', () => {
  assert.equal(weightStep(undefined), 2.5);
  assert.equal(weightStep(0), 2.5);
  assert.equal(weightStep('1,5'), 1.5);
});
