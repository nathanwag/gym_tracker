/* Calculos derivados das series. Nada aqui e gravado no banco: recordes e
 * metricas sao sempre recalculados a partir das series, o que evita ficar com
 * um PR "fantasma" apontando para uma serie que foi editada ou apagada. */

/**
 * 1RM estimado pela formula de Epley: peso x (1 + reps/30).
 * E a metrica que permite comparar 8x60 kg com 5x70 kg — sem ela, "evolui ou
 * nao?" fica ambiguo sempre que carga e repeticoes mudam juntas.
 */
export function e1rm(peso, reps) {
  const p = Number(peso) || 0;
  const r = Number(reps) || 0;
  if (p <= 0 || r <= 0) return 0;
  return r === 1 ? p : p * (1 + r / 30);
}

export const setE1rm = (s) => e1rm(s.peso, s.reps);
export const setVolume = (s) => (Number(s.peso) || 0) * (Number(s.reps) || 0);

/** Series que contam para estatisticas: fora aquecimento e series vazias. */
export const workingSets = (sets) => sets.filter((s) => !s.aquecimento && s.reps > 0 && s.peso >= 0);

export const totalVolume = (sets) => workingSets(sets).reduce((acc, s) => acc + setVolume(s), 0);

/* ---------- Recordes ---------- */

/**
 * Melhores marcas de um conjunto de series.
 * @returns {{peso: number, e1rm: number, setPeso: object|null, setE1rm: object|null}}
 */
export function bests(sets) {
  let peso = 0;
  let melhor1rm = 0;
  let setPeso = null;
  let setE1rmRef = null;

  for (const s of workingSets(sets)) {
    if (s.peso > peso) { peso = s.peso; setPeso = s; }
    const v = setE1rm(s);
    if (v > melhor1rm) { melhor1rm = v; setE1rmRef = s; }
  }
  return { peso, e1rm: melhor1rm, setPeso, setE1rm: setE1rmRef };
}

/**
 * Verifica se `serie` bate recorde em relacao ao que veio antes dela.
 * Compara apenas com series anteriores (id menor), para que reavaliar o
 * historico inteiro produza sempre o mesmo resultado.
 * @returns {{peso: boolean, e1rm: boolean, algum: boolean}}
 */
export function evaluatePR(serie, historico) {
  if (serie.aquecimento || !serie.reps || serie.peso <= 0) {
    return { peso: false, e1rm: false, algum: false };
  }
  const anteriores = historico.filter((s) => s.id !== serie.id && s.id < serie.id);
  const previo = bests(anteriores);
  const pr = {
    peso: serie.peso > previo.peso,
    e1rm: setE1rm(serie) > previo.e1rm,
  };
  pr.algum = pr.peso || pr.e1rm;
  return pr;
}

/** Ids das series que foram recorde no momento em que foram registradas. */
export function prSetIds(sets) {
  const ordenadas = [...sets].sort((a, b) => a.id - b.id);
  const ids = new Set();
  let maxPeso = 0;
  let max1rm = 0;

  for (const s of ordenadas) {
    if (s.aquecimento || !s.reps || s.peso <= 0) continue;
    const v = setE1rm(s);
    if (s.peso > maxPeso || v > max1rm) ids.add(s.id);
    maxPeso = Math.max(maxPeso, s.peso);
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
 * @returns {{workoutId, data, quando, maxPeso, melhor1rm, volume, series}[]} em ordem cronologica
 */
export function sessionSummaries(sets, workoutsById) {
  const porTreino = new Map();

  for (const s of workingSets(sets)) {
    if (!porTreino.has(s.workoutId)) porTreino.set(s.workoutId, []);
    porTreino.get(s.workoutId).push(s);
  }

  const resumo = [];
  for (const [workoutId, series] of porTreino) {
    const treino = workoutsById.get(workoutId);
    const quando = treino?.iniciadoEm || series[0].criadoEm;
    const b = bests(series);
    resumo.push({
      workoutId,
      quando,
      data: treino?.data || quando.slice(0, 10),
      maxPeso: b.peso,
      melhor1rm: b.e1rm,
      volume: series.reduce((acc, s) => acc + setVolume(s), 0),
      series,
    });
  }

  resumo.sort((a, b) => a.quando.localeCompare(b.quando));
  return resumo;
}

/** Melhor volume de uma unica sessao (o terceiro tipo de recorde). */
export function bestSessionVolume(resumos) {
  return resumos.reduce((max, r) => Math.max(max, r.volume), 0);
}

/**
 * Variacao percentual entre a primeira e a ultima sessao de uma metrica.
 * Retorna null quando ha menos de duas sessoes.
 */
export function progressPct(resumos, campo = 'melhor1rm') {
  if (resumos.length < 2) return null;
  const inicio = resumos[0][campo];
  const fim = resumos[resumos.length - 1][campo];
  if (!inicio) return null;
  return ((fim - inicio) / inicio) * 100;
}

/** Resumo de um treino inteiro para os cartoes de historico. */
export function workoutSummary(sets) {
  const validas = workingSets(sets);
  const exercicios = new Set(validas.map((s) => s.exerciseId));
  return {
    series: validas.length,
    exercicios: exercicios.size,
    volume: validas.reduce((acc, s) => acc + setVolume(s), 0),
    reps: validas.reduce((acc, s) => acc + s.reps, 0),
  };
}
