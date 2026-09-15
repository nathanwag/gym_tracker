import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDemo } from './demo-plan.js';

// Data fixa: o plano conta as semanas pra tras a partir de hoje, entao sem um
// "hoje" por parametro o teste dependeria do relogio.
const TODAY = new Date(2026, 8, 14, 10, 0, 0);

/* 23 = 12 (push, o dia acontece tantas vezes quanto o exercicio mais antigo
 * dele: Supino, 12 sessoes) + 6 (pull, Puxada/Remada) + 5 (legs, Panturrilha).
 * Contado a mao da tabela PLAN, e nao pela mesma formula do codigo. */
test('o plano gera 23 treinos, um por dia que de fato aconteceu', () => {
  const { workouts } = buildDemo({ today: TODAY });
  assert.equal(workouts.length, 23);
});

/* Toda janela de sessoes termina na ultima semana, e nao onde o exercicio
 * comecou: se o Supino parasse 3 semanas atras, o Progresso mostraria o grupo
 * como abandonado em vez de em evolucao. */
test('o ultimo treino e desta semana', () => {
  const { workouts } = buildDemo({ today: TODAY });
  const last = workouts[workouts.length - 1];
  const diasAtras = (TODAY - new Date(last.startedAt)) / 86400000;
  assert.ok(diasAtras >= 0 && diasAtras < 7, `ultimo treino ha ${diasAtras} dias`);
});

/* Serie de aquecimento fica fora de recorde, grafico e volume (models.js).
 * Sem ela o exemplo mentiria sobre como uma sessao de verdade e registrada. */
test('todo exercicio de toda sessao abre com aquecimento', () => {
  const { workouts } = buildDemo({ today: TODAY });
  for (const w of workouts) {
    for (const name of w.exercises) {
      const doExercicio = w.sets.filter((s) => s.exercise === name);
      assert.equal(doExercicio[0].warmup, true, `${name} em ${w.date} comeca sem aquecimento`);
    }
  }
});

/* Abdominal supra tem 0 sessoes de proposito: e o estado "grupo com exercicio
 * na biblioteca e nenhuma sessao", que o Progresso precisa saber desenhar. */
test('Abdominal supra entra na biblioteca sem nunca ter sido treinado', () => {
  const { exercises, workouts } = buildDemo({ today: TODAY });
  assert.ok(exercises.some((e) => e.name === 'Abdominal supra'));
  assert.ok(!workouts.some((w) => w.exercises.includes('Abdominal supra')));
});

/* Data sem hora e meia-noite UTC pro new Date(), o que volta um dia em fuso
 * negativo — e o treino das 18h30 apareceria como sendo de ontem na lista. As
 * datas abaixo sao contadas do calendario, nao pela formula do modulo:
 * 14/09/2026 e o dia de legs (offset 0) na ultima semana, e o primeiro treino
 * e push (offset 4) onze semanas antes. */
test('a data gravada e o dia local do treino', () => {
  const { workouts } = buildDemo({ today: TODAY });
  assert.equal(workouts[0].date, '2026-06-25');
  assert.equal(workouts[workouts.length - 1].date, '2026-09-14');
});

/* A forma "linear" e o caso comum: sobe o incremento a cada sessao e mantem as
 * 3 series. 12 sessoes de 60 kg subindo 2,5 terminam em 87,5. */
test('linear sobe a carga em toda sessao e mantem 3 series', () => {
  const { workouts } = buildDemo({ today: TODAY });
  const cargas = workouts
    .flatMap((w) => w.sets)
    .filter((s) => s.exercise === 'Supino reto com barra' && !s.warmup)
    .map((s) => s.weight);
  assert.equal(cargas.length, 36);
  assert.equal(cargas[0], 60);
  assert.equal(cargas[cargas.length - 1], 87.5);
});

/* "stall" e o grupo que precisa de atencao: para de subir na metade e ainda
 * perde uma serie no fim. Sem ele o indice sai chapado e o Progresso nao mostra
 * a leitura que justifica a tela existir. */
test('stall trava a carga na metade e perde a terceira serie no fim', () => {
  const { workouts } = buildDemo({ today: TODAY });
  const sessoes = workouts
    .filter((w) => w.exercises.includes('Puxada frontal (pulley)'))
    .map((w) => w.sets.filter((s) => s.exercise === 'Puxada frontal (pulley)' && !s.warmup));

  assert.deepEqual(sessoes.map((s) => s[0].weight), [45, 47.5, 50, 52.5, 52.5, 52.5]);
  assert.deepEqual(sessoes.map((s) => s.length), [3, 3, 3, 2, 2, 2]);
});

/* "surge" e o oposto: ganha uma quarta serie nas ultimas sessoes, e e o grupo
 * que aparece bem acima de 100 no indice. */
test('surge ganha uma quarta serie nas ultimas sessoes', () => {
  const { workouts } = buildDemo({ today: TODAY });
  const series = workouts
    .filter((w) => w.exercises.includes('Desenvolvimento com halteres'))
    .map((w) => w.sets.filter((s) => s.exercise === 'Desenvolvimento com halteres' && !s.warmup).length);
  assert.deepEqual(series, [3, 3, 3, 3, 3, 4, 4, 4]);
});
