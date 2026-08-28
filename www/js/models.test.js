import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isUnilateralSet, totalReps, effectiveReps, setVolume, setE1rm, workingSets, evaluatePR, prSetIds, workoutSummary,
  orderedWorkoutExercises, workoutHighlights,
} from './models.js';

test('isUnilateralSet reconhece serie com reps por lado', () => {
  assert.equal(isUnilateralSet({ weight: 20, repsLeft: 8, repsRight: 10 }), true);
});

test('isUnilateralSet nao reconhece serie normal (reps unico)', () => {
  assert.equal(isUnilateralSet({ weight: 20, reps: 10 }), false);
});

test('totalReps soma os dois lados numa serie unilateral', () => {
  assert.equal(totalReps({ weight: 20, repsLeft: 8, repsRight: 10 }), 18);
});

test('totalReps usa reps direto numa serie normal', () => {
  assert.equal(totalReps({ weight: 20, reps: 10 }), 10);
});

test('effectiveReps usa a media dos lados arredondada pra baixo numa serie unilateral', () => {
  assert.equal(effectiveReps({ weight: 20, repsLeft: 7, repsRight: 10 }), 8);
});

test('effectiveReps usa reps direto numa serie normal', () => {
  assert.equal(effectiveReps({ weight: 20, reps: 10 }), 10);
});

test('setVolume soma os dois lados numa serie unilateral', () => {
  // 20kg x (7 + 10) reps = 340
  assert.equal(setVolume({ weight: 20, repsLeft: 7, repsRight: 10 }), 340);
});

test('setE1rm usa a media dos lados (arredondada pra baixo) numa serie unilateral', () => {
  // media(7, 10) = 8 (floor de 8.5); Epley: 20 x (1 + 8/30) = 25.33
  assert.equal(setE1rm({ weight: 20, repsLeft: 7, repsRight: 10 }).toFixed(2), '25.33');
});

test('workingSets inclui serie unilateral com apenas um lado preenchido', () => {
  const sets = [{
    id: 1, weight: 20, repsLeft: 0, repsRight: 8, warmup: false,
  }];
  assert.equal(workingSets(sets).length, 1);
});

test('workingSets exclui serie unilateral sem reps em nenhum lado', () => {
  const sets = [{
    id: 1, weight: 20, repsLeft: 0, repsRight: 0, warmup: false,
  }];
  assert.equal(workingSets(sets).length, 0);
});

test('evaluatePR reconhece recorde numa serie unilateral valida (sem campo reps)', () => {
  const set = {
    id: 1, weight: 20, repsLeft: 8, repsRight: 10, warmup: false,
  };
  const pr = evaluatePR(set, []);
  assert.equal(pr.any, true);
  assert.equal(pr.weight, true);
});

test('prSetIds marca serie unilateral valida (sem campo reps) como recorde', () => {
  const sets = [{
    id: 1, weight: 20, repsLeft: 8, repsRight: 10, warmup: false,
  }];
  assert.deepEqual(prSetIds(sets), new Set([1]));
});

test('orderedWorkoutExercises mantem a ordem salva em exerciseIds', () => {
  assert.deepEqual(orderedWorkoutExercises([3, 1, 2], []), [3, 1, 2]);
});

test('orderedWorkoutExercises anexa no fim exercicio com serie fora de exerciseIds', () => {
  const sets = [{ exerciseId: 1 }, { exerciseId: 9 }, { exerciseId: 9 }];
  assert.deepEqual(orderedWorkoutExercises([1, 2], sets), [1, 2, 9]);
});

test('orderedWorkoutExercises lida com exerciseIds nulo', () => {
  assert.deepEqual(orderedWorkoutExercises(null, [{ exerciseId: 5 }, { exerciseId: 5 }]), [5]);
});

test('workoutSummary soma reps de serie normal e unilateral no mesmo treino', () => {
  const sets = [
    {
      id: 1, exerciseId: 1, weight: 20, reps: 10, warmup: false,
    },
    {
      id: 2, exerciseId: 2, weight: 15, repsLeft: 8, repsRight: 10, warmup: false,
    },
  ];
  assert.equal(workoutSummary(sets).reps, 28);
});

/* ---------- workoutHighlights: o que o cartao de compartilhar mostra ---------- */

test('workoutHighlights devolve a melhor serie de cada exercicio na ordem da sessao', () => {
  const sets = [
    { id: 1, exerciseId: 7, weight: 60, reps: 10, warmup: false },
    { id: 2, exerciseId: 7, weight: 80, reps: 8, warmup: false },
    { id: 3, exerciseId: 3, weight: 40, reps: 12, warmup: false },
  ];
  const out = workoutHighlights({ exerciseIds: [7, 3] }, sets);
  assert.deepEqual(out.map((h) => h.exerciseId), [7, 3]);
  assert.equal(out[0].topSet.weight, 80);
  assert.equal(out[0].sets, 2);
  assert.equal(out[1].topSet.weight, 40);
});

test('workoutHighlights ignora aquecimento', () => {
  const sets = [
    { id: 1, exerciseId: 7, weight: 100, reps: 5, warmup: true },
    { id: 2, exerciseId: 7, weight: 60, reps: 10, warmup: false },
  ];
  const out = workoutHighlights({ exerciseIds: [7] }, sets);
  assert.equal(out[0].sets, 1);
  assert.equal(out[0].topSet.weight, 60);
});

test('workoutHighlights marca pr quando a serie do treino bateu recorde no historico', () => {
  const antiga = { id: 1, exerciseId: 7, weight: 70, reps: 8, warmup: false };
  const hoje = { id: 2, exerciseId: 7, weight: 90, reps: 8, warmup: false };
  const out = workoutHighlights({ exerciseIds: [7] }, [hoje], [antiga, hoje]);
  assert.equal(out[0].pr, true);
});

test('workoutHighlights nao marca pr quando a carga ficou abaixo do historico', () => {
  const antiga = { id: 1, exerciseId: 7, weight: 90, reps: 10, warmup: false };
  const hoje = { id: 2, exerciseId: 7, weight: 70, reps: 8, warmup: false };
  const out = workoutHighlights({ exerciseIds: [7] }, [hoje], [antiga, hoje]);
  assert.equal(out[0].pr, false);
});

test('workoutHighlights sem historico devolve pr false em vez de quebrar', () => {
  const sets = [{ id: 1, exerciseId: 7, weight: 90, reps: 8, warmup: false }];
  assert.equal(workoutHighlights({ exerciseIds: [7] }, sets)[0].pr, false);
});

test('workoutHighlights deixa de fora exercicio sem serie valida', () => {
  const sets = [
    { id: 1, exerciseId: 7, weight: 60, reps: 10, warmup: false },
    { id: 2, exerciseId: 9, weight: 50, reps: 0, warmup: false },
  ];
  assert.deepEqual(workoutHighlights({ exerciseIds: [7, 9] }, sets).map((h) => h.exerciseId), [7]);
});
