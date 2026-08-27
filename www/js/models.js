/* Calculos derivados das series. Nada aqui e gravado no banco: recordes e
 * metricas sao sempre recalculados a partir das series, o que evita ficar com
 * um PR "fantasma" apontando para uma serie que foi editada ou apagada. */

/**
 * 1RM estimado pela formula de Epley: peso x (1 + reps/30).
 * E a metrica que permite comparar 8x60 kg com 5x70 kg — sem ela, "evolui ou
 * nao?" fica ambiguo sempre que carga e repeticoes mudam juntas.
 */
export function e1rm(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

export const setDuration = (s) => Number(s.durationSec) || 0;

/** Series de exercicio unilateral guardam repsLeft/repsRight em vez de reps
 *  (ver session.js compositor()) — peso e o mesmo dos dois lados. */
export const isUnilateralSet = (s) => (Number(s.repsLeft) || 0) > 0 || (Number(s.repsRight) || 0) > 0;

export const totalReps = (s) => (isUnilateralSet(s)
  ? (Number(s.repsLeft) || 0) + (Number(s.repsRight) || 0)
  : Number(s.reps) || 0);

/** e1RM/PR de serie unilateral usa a media dos lados arredondada pra baixo:
 *  mais conservador que somar, sem descartar o lado que rendeu mais. */
export const effectiveReps = (s) => (isUnilateralSet(s) ? Math.floor(totalReps(s) / 2) : Number(s.reps) || 0);

export const setE1rm = (s) => e1rm(s.weight, effectiveReps(s));
export const setVolume = (s) => (Number(s.weight) || 0) * totalReps(s);

/** Series de Cardio/Alongamento guardam durationSec em vez de peso/reps (ver
 *  session.js compositor()) — peso e reps ficam 0 nelas, e vice-versa. */
export const isDurationSet = (s) => setDuration(s) > 0;

/** Series que contam para estatisticas: fora aquecimento e series vazias
 *  (peso/reps para exercicio de forca, duracao para cardio/alongamento). */
export const workingSets = (sets) => sets.filter((s) => !s.warmup && s.weight >= 0 && (totalReps(s) > 0 || isDurationSet(s)));

export const totalVolume = (sets) => workingSets(sets).reduce((acc, s) => acc + setVolume(s), 0);
export const totalDuration = (sets) => workingSets(sets).reduce((acc, s) => acc + setDuration(s), 0);

/* ---------- Recordes ---------- */

/**
 * Melhores marcas de um conjunto de series. `duration` e o analogo de
 * `weight` pras series de cardio/alongamento (recorde de tempo em vez de
 * carga).
 * @returns {{weight: number, e1rm: number, duration: number, setWeight: object|null, setE1rm: object|null, setDuration: object|null}}
 */
export function bests(sets) {
  let weight = 0;
  let bestE1rm = 0;
  let duration = 0;
  let setWeight = null;
  let setE1rmRef = null;
  let setDurationRef = null;

  for (const s of workingSets(sets)) {
    if (isDurationSet(s)) {
      const d = setDuration(s);
      if (d > duration) { duration = d; setDurationRef = s; }
      continue;
    }
    if (s.weight > weight) { weight = s.weight; setWeight = s; }
    const v = setE1rm(s);
    if (v > bestE1rm) { bestE1rm = v; setE1rmRef = s; }
  }
  return {
    weight, e1rm: bestE1rm, duration, setWeight, setE1rm: setE1rmRef, setDuration: setDurationRef,
  };
}

/**
 * Verifica se `set` bate recorde em relacao ao que veio antes dele.
 * Compara apenas com series anteriores (id menor), para que reavaliar o
 * historico inteiro produza sempre o mesmo resultado. Series de duracao so
 * competem por recorde de tempo; series de peso/reps so por peso/e1rm.
 * @returns {{weight: boolean, e1rm: boolean, duration: boolean, any: boolean}}
 */
export function evaluatePR(set, history) {
  if (set.warmup) return {
    weight: false, e1rm: false, duration: false, any: false,
  };

  const earlier = history.filter((s) => s.id !== set.id && s.id < set.id);

  if (isDurationSet(set)) {
    const previous = bests(earlier);
    const pr = { weight: false, e1rm: false, duration: setDuration(set) > previous.duration };
    pr.any = pr.duration;
    return pr;
  }

  if (!totalReps(set) || set.weight <= 0) {
    return {
      weight: false, e1rm: false, duration: false, any: false,
    };
  }
  const previous = bests(earlier);
  const pr = {
    weight: set.weight > previous.weight,
    e1rm: setE1rm(set) > previous.e1rm,
    duration: false,
  };
  pr.any = pr.weight || pr.e1rm;
  return pr;
}

/** Ids das series que foram recorde no momento em que foram registradas. */
export function prSetIds(sets) {
  const sorted = [...sets].sort((a, b) => a.id - b.id);
  const ids = new Set();
  let maxWeight = 0;
  let max1rm = 0;
  let maxDuration = 0;

  for (const s of sorted) {
    if (s.warmup) continue;
    if (isDurationSet(s)) {
      const d = setDuration(s);
      if (d > maxDuration) ids.add(s.id);
      maxDuration = Math.max(maxDuration, d);
      continue;
    }
    if (!totalReps(s) || s.weight <= 0) continue;
    const v = setE1rm(s);
    if (s.weight > maxWeight || v > max1rm) ids.add(s.id);
    maxWeight = Math.max(maxWeight, s.weight);
    max1rm = Math.max(max1rm, v);
  }
  return ids;
}

/* ---------- Series historicas por sessao ---------- */

/**
 * Agrupa as series de um exercicio por treino e resume cada sessao.
 * Base tanto do grafico quanto do historico da tela de exercicio.
 * @param {object[]} sets series do exercicio
 * @param {Map<number, object>} workoutsById treinos indexados por id
 * @returns {{workoutId, date, when, maxWeight, bestE1rm, bestDuration, volume, totalDuration, sets}[]} em ordem cronologica
 */
export function sessionSummaries(sets, workoutsById) {
  const byWorkout = new Map();

  for (const s of workingSets(sets)) {
    if (!byWorkout.has(s.workoutId)) byWorkout.set(s.workoutId, []);
    byWorkout.get(s.workoutId).push(s);
  }

  const summaries = [];
  for (const [workoutId, workoutSets] of byWorkout) {
    const workout = workoutsById.get(workoutId);
    const when = workout?.startedAt || workoutSets[0].createdAt;
    const b = bests(workoutSets);
    summaries.push({
      workoutId,
      when,
      date: workout?.date || when.slice(0, 10),
      maxWeight: b.weight,
      bestE1rm: b.e1rm,
      bestDuration: b.duration,
      volume: workoutSets.reduce((acc, s) => acc + setVolume(s), 0),
      totalDuration: workoutSets.reduce((acc, s) => acc + setDuration(s), 0),
      sets: workoutSets,
    });
  }

  summaries.sort((a, b) => a.when.localeCompare(b.when));
  return summaries;
}

/** Melhor volume de uma unica sessao (o terceiro tipo de recorde). */
export function bestSessionVolume(summaries) {
  return summaries.reduce((max, r) => Math.max(max, r.volume), 0);
}

/** Equivalente a bestSessionVolume para exercicios de cardio/alongamento. */
export function bestSessionDuration(summaries) {
  return summaries.reduce((max, r) => Math.max(max, r.totalDuration), 0);
}

/**
 * Variacao percentual entre a primeira e a ultima sessao de uma metrica.
 * Retorna null quando ha menos de duas sessoes.
 */
export function progressPct(summaries, field = 'bestE1rm') {
  if (summaries.length < 2) return null;
  const start = summaries[0][field];
  const end = summaries[summaries.length - 1][field];
  if (!start) return null;
  return ((end - start) / start) * 100;
}

/** Ordem de exibicao dos exercicios de um treino: primeiro a ordem gravada em
 *  `exerciseIds`; quem tem serie mas ficou de fora dela (dado antigo ou
 *  importado) entra no fim, sem repetir. */
export function orderedWorkoutExercises(exerciseIds, sets) {
  const order = [...(exerciseIds || [])];
  for (const s of sets) if (!order.includes(s.exerciseId)) order.push(s.exerciseId);
  return order;
}

/** Resumo de um treino inteiro para os cartoes de historico. */
export function workoutSummary(sets) {
  const valid = workingSets(sets);
  const exercises = new Set(valid.map((s) => s.exerciseId));
  return {
    sets: valid.length,
    exercises: exercises.size,
    volume: valid.reduce((acc, s) => acc + setVolume(s), 0),
    reps: valid.reduce((acc, s) => acc + totalReps(s), 0),
    totalDuration: valid.reduce((acc, s) => acc + setDuration(s), 0),
  };
}

/* ---------- Resumo semanal por grupo muscular ---------- */

/** Segunda-feira 00:00:00.000 (hora local) da semana que contem `date`. */
export function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=domingo .. 6=sabado
  const daysSinceMonday = (day + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

/**
 * Series validas da semana de calendario (segunda a domingo) que contem
 * `referenceDate`, totalizadas e agrupadas por grupo muscular do exercicio.
 * Series de exercicio apagado (sem entrada em `exercisesById`) contam nos
 * totais gerais mas ficam fora de `byGroup`, ja que nao ha grupo pra somar.
 * @param {object[]} sets todas as series (de qualquer exercicio/treino)
 * @param {Map<number, object>} workoutsById treinos indexados por id
 * @param {Map<number, object>} exercisesById exercicios indexados por id
 * @param {Date} referenceDate qualquer data dentro da semana desejada
 * @returns {{start: Date, end: Date, workouts: number, sets: number, volume: number, byGroup: {group: string, sets: number, volume: number, duration: number}[]}}
 */
export function weekMuscleGroupSummary(sets, workoutsById, exercisesById, referenceDate = new Date()) {
  const start = mondayOf(referenceDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setMilliseconds(-1); // domingo 23:59:59.999

  const thisWeek = workingSets(sets).filter((s) => {
    const workout = workoutsById.get(s.workoutId);
    const when = new Date(workout?.startedAt || s.createdAt).getTime();
    return when >= start.getTime() && when <= end.getTime();
  });

  const byGroupMap = new Map();
  for (const s of thisWeek) {
    const ex = exercisesById.get(s.exerciseId);
    if (!ex) continue;
    let g = byGroupMap.get(ex.muscleGroup);
    if (!g) {
      g = {
        group: ex.muscleGroup, sets: 0, volume: 0, duration: 0,
      };
      byGroupMap.set(ex.muscleGroup, g);
    }
    g.sets += 1;
    g.volume += setVolume(s);
    g.duration += setDuration(s);
  }

  return {
    start,
    end,
    workouts: new Set(thisWeek.map((s) => s.workoutId)).size,
    sets: thisWeek.length,
    volume: thisWeek.reduce((acc, s) => acc + setVolume(s), 0),
    byGroup: [...byGroupMap.values()].sort((a, b) => b.sets - a.sets),
  };
}

/* ---------- Tendencia semanal ---------- */

/**
 * Series, volume e treinos por semana de calendario, das ultimas `weeks`
 * semanas (incluindo a atual), em ordem cronologica. Semanas sem nenhuma
 * serie aparecem com os totais zerados (nao sao omitidas), pra manter a
 * cadencia semanal do grafico de tendencia.
 * @param {object[]} sets todas as series (de qualquer exercicio/treino)
 * @param {Map<number, object>} workoutsById treinos indexados por id
 * @param {number} weeks quantas semanas incluir (a mais recente e a semana de `referenceDate`)
 * @param {Date} referenceDate qualquer data dentro da semana mais recente da janela
 * @returns {{start: Date, workouts: number, sets: number, volume: number, duration: number}[]}
 */
export function weeklyTrend(sets, workoutsById, weeks = 8, referenceDate = new Date()) {
  const currentWeek = mondayOf(referenceDate);
  const buckets = new Map();
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - i * 7);
    buckets.set(d.getTime(), {
      start: d, workoutIds: new Set(), sets: 0, volume: 0, duration: 0,
    });
  }
  const firstWindow = [...buckets.keys()][0];

  for (const s of workingSets(sets)) {
    const workout = workoutsById.get(s.workoutId);
    const when = new Date(workout?.startedAt || s.createdAt);
    const weekStart = mondayOf(when).getTime();
    if (weekStart < firstWindow) continue;
    const bucket = buckets.get(weekStart);
    if (!bucket) continue; // fora da janela (ex: semana futura, relogio errado)
    bucket.workoutIds.add(s.workoutId);
    bucket.sets += 1;
    bucket.volume += setVolume(s);
    bucket.duration += setDuration(s);
  }

  return [...buckets.values()].map((b) => ({
    start: b.start, workouts: b.workoutIds.size, sets: b.sets, volume: b.volume, duration: b.duration,
  }));
}
