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

/* ---------- Resumo semanal por grupo muscular ---------- */

/** Segunda-feira 00:00:00.000 (hora local) da semana que contem `data`. */
export function segundaFeira(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  const dia = d.getDay(); // 0=domingo .. 6=sabado
  const diasDesdeSegunda = (dia + 6) % 7;
  d.setDate(d.getDate() - diasDesdeSegunda);
  return d;
}

/**
 * Series validas da semana de calendario (segunda a domingo) que contem
 * `referenceDate`, totalizadas e agrupadas por grupo muscular do exercicio.
 * Series de exercicio apagado (sem entrada em `exercisesById`) contam nos
 * totais gerais mas ficam fora de `porGrupo`, ja que nao ha grupo pra somar.
 * @param {object[]} sets todas as series (de qualquer exercicio/treino)
 * @param {Map<number, object>} workoutsById treinos indexados por id
 * @param {Map<number, object>} exercisesById exercicios indexados por id
 * @param {Date} referenceDate qualquer data dentro da semana desejada
 * @returns {{inicio: Date, fim: Date, treinos: number, series: number, volume: number, porGrupo: {grupo: string, series: number, volume: number}[]}}
 */
export function weekMuscleGroupSummary(sets, workoutsById, exercisesById, referenceDate = new Date()) {
  const inicio = segundaFeira(referenceDate);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);
  fim.setMilliseconds(-1); // domingo 23:59:59.999

  const naSemana = workingSets(sets).filter((s) => {
    const treino = workoutsById.get(s.workoutId);
    const quando = new Date(treino?.iniciadoEm || s.criadoEm).getTime();
    return quando >= inicio.getTime() && quando <= fim.getTime();
  });

  const porGrupoMap = new Map();
  for (const s of naSemana) {
    const ex = exercisesById.get(s.exerciseId);
    if (!ex) continue;
    let g = porGrupoMap.get(ex.grupoMuscular);
    if (!g) { g = { grupo: ex.grupoMuscular, series: 0, volume: 0 }; porGrupoMap.set(ex.grupoMuscular, g); }
    g.series += 1;
    g.volume += setVolume(s);
  }

  return {
    inicio,
    fim,
    treinos: new Set(naSemana.map((s) => s.workoutId)).size,
    series: naSemana.length,
    volume: naSemana.reduce((acc, s) => acc + setVolume(s), 0),
    porGrupo: [...porGrupoMap.values()].sort((a, b) => b.series - a.series),
  };
}

/* ---------- Tendencia semanal ---------- */

/**
 * Series, volume e treinos por semana de calendario, das ultimas `semanas`
 * semanas (incluindo a atual), em ordem cronologica. Semanas sem nenhuma
 * serie aparecem com os totais zerados (nao sao omitidas), pra manter a
 * cadencia semanal do grafico de tendencia.
 * @param {object[]} sets todas as series (de qualquer exercicio/treino)
 * @param {Map<number, object>} workoutsById treinos indexados por id
 * @param {number} semanas quantas semanas incluir (a mais recente e a semana de `referenceDate`)
 * @param {Date} referenceDate qualquer data dentro da semana mais recente da janela
 * @returns {{inicio: Date, treinos: number, series: number, volume: number}[]}
 */
export function weeklyTrend(sets, workoutsById, semanas = 8, referenceDate = new Date()) {
  const semanaAtual = segundaFeira(referenceDate);
  const baldes = new Map();
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(semanaAtual);
    d.setDate(d.getDate() - i * 7);
    baldes.set(d.getTime(), { inicio: d, treinoIds: new Set(), series: 0, volume: 0 });
  }
  const primeiraJanela = [...baldes.keys()][0];

  for (const s of workingSets(sets)) {
    const treino = workoutsById.get(s.workoutId);
    const quando = new Date(treino?.iniciadoEm || s.criadoEm);
    const inicioSemana = segundaFeira(quando).getTime();
    if (inicioSemana < primeiraJanela) continue;
    const balde = baldes.get(inicioSemana);
    if (!balde) continue; // fora da janela (ex: semana futura, relogio errado)
    balde.treinoIds.add(s.workoutId);
    balde.series += 1;
    balde.volume += setVolume(s);
  }

  return [...baldes.values()].map((b) => ({
    inicio: b.inicio, treinos: b.treinoIds.size, series: b.series, volume: b.volume,
  }));
}
