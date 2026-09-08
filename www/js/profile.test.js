import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initials, daysSince, weightLog, parseBodyWeight, todayISO, parseGoal,
} from './profile.js';

test('iniciais: primeiro e último nome', () => {
  assert.equal(initials('Nathan Wagner'), 'NW');
});

test('iniciais: nome do meio não conta, vazio não quebra', () => {
  assert.equal(initials('Nathan de Souza Wagner'), 'NW');
  assert.equal(initials('nathan'), 'N');
  assert.equal(initials('  '), '');
  assert.equal(initials(undefined), '');
});

test('dias desde: conta dias inteiros, null quando nunca aconteceu', () => {
  const now = new Date('2026-09-07T10:00:00');
  assert.equal(daysSince('2026-09-04T22:00:00', now), 3);
  assert.equal(daysSince('2026-09-07T01:00:00', now), 0);
  assert.equal(daysSince(null, now), null);
});

test('registro de peso: mais recente primeiro, com a variação desde a medição anterior', () => {
  const rows = [
    { id: 1, date: '2026-08-14', weight: 78.8 },
    { id: 3, date: '2026-09-04', weight: 78.4 },
    { id: 2, date: '2026-08-21', weight: 79.2 },
  ];
  assert.deepEqual(weightLog(rows), [
    { id: 3, date: '2026-09-04', weight: 78.4, delta: -0.8 },
    { id: 2, date: '2026-08-21', weight: 79.2, delta: 0.4 },
    { id: 1, date: '2026-08-14', weight: 78.8, delta: null },
  ]);
});

test('peso digitado: vírgula ou ponto, uma casa, e recusa o que não é peso de gente', () => {
  assert.equal(parseBodyWeight('78,45'), 78.5);
  assert.equal(parseBodyWeight('78.4'), 78.4);
  assert.equal(parseBodyWeight(''), null);
  assert.equal(parseBodyWeight('abc'), null);
  assert.equal(parseBodyWeight('0'), null);
  assert.equal(parseBodyWeight('-70'), null);
  assert.equal(parseBodyWeight('900'), null);
});

test('hoje é o dia local, não o UTC: pesar às 22h não pode cair no dia seguinte', () => {
  assert.equal(todayISO(new Date(2026, 8, 7, 22, 34)), '2026-09-07');
  assert.equal(todayISO(new Date(2026, 0, 5, 0, 10)), '2026-01-05');
});

test('dias desde: data sem hora é lida no fuso local, não em UTC', () => {
  assert.equal(daysSince('2026-09-07', new Date(2026, 8, 7, 10, 0)), 0);
  assert.equal(daysSince('2026-09-05', new Date(2026, 8, 7, 10, 0)), 2);
});

test('meta digitada: inteiro dentro do intervalo, ou null', () => {
  assert.equal(parseGoal('12', 1, 30), 12);
  assert.equal(parseGoal('12,7', 1, 30), 13);
  assert.equal(parseGoal('0', 1, 30), null);
  assert.equal(parseGoal('31', 1, 30), null);
  assert.equal(parseGoal('', 1, 30), null);
  assert.equal(parseGoal('abc', 1, 30), null);
});
