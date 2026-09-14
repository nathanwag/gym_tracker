import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyReason } from './set-composer.js';

/* O composer ja sabia o que e uma serie vazia, mas so respondia sim ou nao: a
 * escolha da mensagem ("digite o tempo" vs "digite as reps") era re-derivada
 * por quem chamava, com o mesmo `'durationSec' in values` que ele usa por
 * dentro. Eram quatro copias identicas entre session.js e history.js. Agora a
 * razao vem junto, e o discriminante fica atras do seam. */

test('serie por duracao: vazia quando nao ha tempo', () => {
  assert.equal(emptyReason({ durationSec: 0 }), 'session.enterDuration');
  assert.equal(emptyReason({ durationSec: -1 }), 'session.enterDuration');
});

test('serie por duracao: preenchida quando ha tempo', () => {
  assert.equal(emptyReason({ durationSec: 30 }), null);
});

/* Unilateral vale por um lado so: quem treina o lado machucado sozinho ainda
 * registrou serie. */
test('serie unilateral: basta um lado ter reps', () => {
  assert.equal(emptyReason({ weight: 20, repsLeft: 10, repsRight: 0 }), null);
  assert.equal(emptyReason({ weight: 20, repsLeft: 0, repsRight: 10 }), null);
});

test('serie unilateral: vazia so quando nenhum lado tem reps', () => {
  assert.equal(emptyReason({ weight: 20, repsLeft: 0, repsRight: 0 }), 'session.enterReps');
});

test('serie comum: vazia quando nao ha reps', () => {
  assert.equal(emptyReason({ weight: 20, reps: 0 }), 'session.enterReps');
});

/* Peso zero e serie legitima — barra vazia, peso do corpo, flexao. O que faz
 * a serie existir e a repeticao. */
test('serie comum com peso zero e valida, se ha reps', () => {
  assert.equal(emptyReason({ weight: 0, reps: 8 }), null);
});
