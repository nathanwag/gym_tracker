import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isUnilateralSet, totalReps, effectiveReps, setVolume, setE1rm, workingSets, evaluatePR, prSetIds, workoutSummary,
  orderedWorkoutExercises, workoutHighlights, workoutGroupBreakdown, allPrIds, weekMuscleGroupSummary,
  progressPct, moveInOrder, existingInOrder,
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

test('workoutGroupBreakdown ordena os grupos do treino por numero de series', () => {
  const sets = [
    { id: 1, exerciseId: 7, weight: 60, reps: 10, warmup: false },
    { id: 2, exerciseId: 7, weight: 60, reps: 10, warmup: false },
    { id: 3, exerciseId: 3, weight: 40, reps: 12, warmup: false },
  ];
  const exercises = new Map([
    [7, { id: 7, muscleGroup: 'Peito' }],
    [3, { id: 3, muscleGroup: 'Tríceps' }],
  ]);
  const out = workoutGroupBreakdown(sets, exercises);
  assert.deepEqual(out.map((g) => [g.group, g.sets]), [['Peito', 2], ['Tríceps', 1]]);
});

test('allPrIds junta os recordes de todos os exercicios, cada um contra o proprio historico', () => {
  const sets = [
    // Exercicio 7: a segunda serie e recorde de carga.
    { id: 1, exerciseId: 7, weight: 60, reps: 10, warmup: false },
    { id: 2, exerciseId: 7, weight: 80, reps: 10, warmup: false },
    // Exercicio 3: carga menor que a do 7, mas recorde dentro do proprio.
    { id: 3, exerciseId: 3, weight: 40, reps: 12, warmup: false },
    { id: 4, exerciseId: 3, weight: 30, reps: 12, warmup: false },
  ];
  assert.deepEqual([...allPrIds(sets)].sort(), [1, 2, 3]);
});

test('weekMuscleGroupSummary soma o tempo de academia dos treinos da semana', () => {
  const workouts = new Map([
    [1, { id: 1, startedAt: '2026-08-26T10:00:00', finishedAt: '2026-08-26T11:00:00' }],
    [2, { id: 2, startedAt: '2026-08-28T10:00:00', finishedAt: '2026-08-28T10:30:00' }],
    // Semana anterior: nao entra na conta.
    [3, { id: 3, startedAt: '2026-08-19T10:00:00', finishedAt: '2026-08-19T12:00:00' }],
  ]);
  const exercises = new Map([[7, { id: 7, muscleGroup: 'Peito' }]]);
  const sets = [
    { id: 1, workoutId: 1, exerciseId: 7, weight: 60, reps: 10, warmup: false },
    { id: 2, workoutId: 2, exerciseId: 7, weight: 60, reps: 10, warmup: false },
    { id: 3, workoutId: 3, exerciseId: 7, weight: 60, reps: 10, warmup: false },
  ];
  const out = weekMuscleGroupSummary(sets, workouts, exercises, new Date('2026-08-26T12:00:00'));
  assert.equal(out.gymSeconds, 3600 + 1800);
});

test('weekMuscleGroupSummary ignora treino em aberto no tempo de academia', () => {
  const workouts = new Map([[1, { id: 1, startedAt: '2026-08-26T10:00:00', finishedAt: null }]]);
  const exercises = new Map([[7, { id: 7, muscleGroup: 'Peito' }]]);
  const sets = [{ id: 1, workoutId: 1, exerciseId: 7, weight: 60, reps: 10, warmup: false }];
  const out = weekMuscleGroupSummary(sets, workouts, exercises, new Date('2026-08-26T12:00:00'));
  assert.equal(out.gymSeconds, 0);
});

test('progressPct mede a partir da primeira semana COM dado, nao do zero inicial', () => {
  // Janela de 8 semanas quase sempre comeca antes do primeiro treino: sem
  // isso a home nunca mostrava percentual nenhum.
  const trend = [{ sets: 0 }, { sets: 0 }, { sets: 10 }, { sets: 12 }];
  assert.equal(progressPct(trend, 'sets'), 20);
});

test('progressPct ignora a semana vazia no fim da janela', () => {
  // A semana corrente entra na janela mesmo antes do primeiro treino dela —
  // contar esse zero como "fim" dava -100% toda segunda-feira.
  const trend = [{ sets: 10 }, { sets: 12 }, { sets: 0 }];
  assert.equal(progressPct(trend, 'sets'), 20);
});

test('progressPct devolve null quando so uma semana tem dado', () => {
  assert.equal(progressPct([{ sets: 0 }, { sets: 10 }, { sets: 0 }], 'sets'), null);
});

test('moveInOrder desce o item uma posicao', () => {
  assert.deepEqual(moveInOrder([1, 2, 3], 0, 1), [2, 1, 3]);
});

test('moveInOrder devolve a lista intacta quando o destino fica fora da lista', () => {
  const ids = [1, 2, 3];
  assert.deepEqual(moveInOrder(ids, 0, -1), [1, 2, 3]);
  assert.deepEqual(moveInOrder(ids, 2, 1), [1, 2, 3]);
  assert.deepEqual(ids, [1, 2, 3], 'nao muta a lista recebida');
});

test('existingInOrder tira o exercicio que sumiu da biblioteca e mantem a ordem', () => {
  assert.deepEqual(existingInOrder([7, 3, 9], new Set([9, 7])), [7, 9]);
});

test('existingInOrder aceita modelo sem lista de exercicios', () => {
  assert.deepEqual(existingInOrder(undefined, new Set([1])), []);
});
