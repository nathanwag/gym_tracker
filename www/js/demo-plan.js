/* O plano dos dados de exemplo: 12 semanas de push/pull/legs com carga
 * progressiva, os tres modelos desse plano e os exercicios que ele usa.
 *
 * Puro: devolve a ESTRUTURA e nao grava nada — quem escreve no banco e
 * demo.js. Foi o que tornou o gerador testavel: ele nasceu dentro de uma
 * string de HTML no bs-config.cjs, so rodava no `npm run dev` e nunca teve
 * teste nenhum.
 *
 * `today` entra por parametro pelo mesmo motivo: o plano conta as semanas pra
 * tras a partir de hoje, e com o relogio por dentro o teste mudaria de
 * resultado todo dia.
 *
 * As sessoes de cada exercicio sao calibradas de proposito pra por cada estado
 * do Progresso lado a lado na mesma tela — e o ponto de mostrar o app cheio:
 *   12, 8 — indice firme, janelas cheias
 *    6    — firme, exatamente em SESSIONS_FOR_FIRM_INDEX (models.js)
 *    5..2 — indice raso: barra listrada, ponto no numero, "N de 6"
 *    1    — groupIndex() devolve null; nao ha contra o que comparar
 *    0    — grupo com exercicio na biblioteca e nenhuma sessao
 *
 * A "forma" existe pra tela ter o que mostrar: com todo exercicio subindo
 * linear, o indice por grupo sai chapado em ~110 e o Progresso nao prova nada.
 * As fases sao relativas ao proprio numero de sessoes — com um teto fixo, quem
 * tem 3 sessoes nunca chegaria na fase final.
 *   linear — sobe toda sessao, 3 series (o caso comum)
 *   stall  — para de subir na metade e perde uma serie no fim
 *   surge  — ganha uma serie no fim */

import { SEED_EXERCISES } from './seed.js';

const WEEKS = 12;
const REPS = [10, 9, 8];
// Teto de sessoes finais que mudam o numero de series.
const LATE_SESSIONS = 3;
const DAYS = ['push', 'pull', 'legs'];
// Nome do modelo de cada dia. Em portugues, como todo valor gravado no banco.
const DAY_NAME = { push: 'Empurrar', pull: 'Puxar', legs: 'Pernas' };
// Dias atras dentro da semana, pra os tres dias nao cairem na mesma data.
const DAY_OFFSET = { push: 4, pull: 2, legs: 0 };
// Quanto dura cada sessao de exemplo.
const DURATION = 55 * 60000;

// [dia, grupo, nome (de SEED_EXERCISES), carga inicial, incremento/sessao,
//  sessoes, forma]. Tudo aqui e privado: buildDemo() e a unica porta, e e o
// seam que o teste usa — helper exportado viraria teste preso a implementacao.
const PLAN = [
  ['push', 'Peito', 'Supino reto com barra', 60, 2.5, 12, 'linear'],
  ['push', 'Ombros', 'Desenvolvimento com halteres', 20, 1, 8, 'surge'],
  ['push', 'Tríceps', 'Tríceps na polia (corda)', 25, 1.5, 2, 'linear'],
  ['pull', 'Costas', 'Puxada frontal (pulley)', 45, 2.5, 6, 'stall'],
  ['pull', 'Costas', 'Remada curvada com barra', 50, 2.5, 6, 'linear'],
  ['pull', 'Bíceps', 'Rosca direta com barra', 30, 1, 1, 'linear'],
  ['legs', 'Quadríceps', 'Agachamento livre', 80, 5, 3, 'linear'],
  ['legs', 'Posterior', 'Levantamento terra romeno', 70, 5, 4, 'stall'],
  ['legs', 'Panturrilha', 'Panturrilha em pé', 90, 2.5, 5, 'linear'],
  ['legs', 'Abdômen', 'Abdominal supra', 20, 2.5, 0, 'linear'],
];

/** Em que sessao do exercicio a semana w cai; negativo antes da primeira.
 *  Contar do fim pra tras e o que faz todo grupo terminar na semana de hoje. */
const sessionIndex = (w, sessions) => w - (WEEKS - sessions);

/** Quantas sessoes finais mudam de numero de series. Nunca mais que a metade:
 *  com 3 sessoes, um late de 3 deixaria o exercicio sem fase inicial. */
const lateCount = (sessions) => Math.min(LATE_SESSIONS, Math.floor(sessions / 2));

const slugFor = (group, name) =>
  (SEED_EXERCISES[group] || []).find((e) => e.name === name)?.slug ?? null;

/* Data local, montada dos componentes: toISOString().slice(0,10) devolve o dia
 * em UTC, que em fuso negativo e o dia anterior a partir das 21h — e o treino
 * das 18h30 apareceria como sendo de ontem. */
function isoDate(when) {
  const mm = String(when.getMonth() + 1).padStart(2, '0');
  const dd = String(when.getDate()).padStart(2, '0');
  return `${when.getFullYear()}-${mm}-${dd}`;
}

/** Os exercicios do plano, sem repetir, na ordem em que aparecem. */
function demoExercises() {
  const seen = new Map();
  for (const [, group, name] of PLAN) {
    if (!seen.has(name)) seen.set(name, { name, group, slug: slugFor(group, name) });
  }
  return [...seen.values()];
}

/** Um modelo por dia do plano, na mesma ordem de exercicios que o treino usa. */
function demoTemplates() {
  return DAYS.map((day) => ({
    name: DAY_NAME[day],
    exercises: PLAN.filter(([d]) => d === day).map(([, , name]) => name),
  }));
}

/** O plano inteiro: o que criar na biblioteca, os modelos e os treinos com
 *  todas as series, em ordem cronologica. */
export function buildDemo({ today = new Date() } = {}) {
  const workouts = [];

  for (let w = 0; w < WEEKS; w++) {
    for (const day of DAYS) {
      // So os exercicios que ja tinham comecado nesta semana. Sem nenhum, o dia
      // nao aconteceu: gravar treino vazio sujaria o historico.
      const doing = PLAN.filter(([d, , , , , sessions]) => d === day && sessionIndex(w, sessions) >= 0);
      if (!doing.length) continue;

      const when = new Date(today);
      when.setDate(when.getDate() - (WEEKS - 1 - w) * 7 - DAY_OFFSET[day]);
      when.setHours(18, 30, 0, 0);
      // O treino da semana de hoje cai as 18h30 mesmo quando ainda e de manha,
      // e um treino que termina no futuro deixa "ha quantos dias" negativo em
      // todas as telas que o leem. Recua pra terminar agora.
      const ends = when.getTime() + DURATION;
      if (ends > today.getTime()) when.setTime(today.getTime() - DURATION);
      const startedAt = when.toISOString();

      const sets = [];
      for (const [, , name, base, step, sessions, shape] of doing) {
        const k = sessionIndex(w, sessions);
        const late = k >= sessions - lateCount(sessions);
        const progressed = shape === 'stall' ? Math.min(k, Math.ceil(sessions / 2)) : k;
        const weight = base + step * progressed;
        const reps = (shape === 'stall' && late) ? REPS.slice(0, 2)
          : (shape === 'surge' && late) ? REPS.concat(8)
            : REPS;

        sets.push({ exercise: name, weight: Math.round(weight * 0.5), reps: 12, warmup: true });
        for (const r of reps) sets.push({ exercise: name, weight, reps: r, warmup: false });
      }

      workouts.push({
        date: isoDate(when),
        startedAt,
        finishedAt: new Date(when.getTime() + DURATION).toISOString(),
        exercises: doing.map(([, , name]) => name),
        sets,
      });
    }
  }

  return { exercises: demoExercises(), templates: demoTemplates(), workouts };
}
