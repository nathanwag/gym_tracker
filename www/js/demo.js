/* Modo demonstracao: escreve o plano de exemplo no banco e sabe desfazer.
 *
 * Existe porque todo o valor do app (grafico, recorde, indice por grupo) so
 * aparece depois de semanas de uso — quem abre pela primeira vez nao tem como
 * ver do que a tela e capaz. O plano vem de demo-plan.js, que e puro e testado;
 * aqui fica so a escrita.
 *
 * O que foi criado vai pro setting `demoIds`, e nao num campo `demo: true`
 * espalhado por tres stores: a limpeza precisa ser EXATA. Apagar por "tudo que
 * existia antes" usaria resetAll(), que limpa as settings junto — a pessoa
 * sairia do exemplo sem o nome, a unidade e a meta que acabou de escolher. */

import * as db from './db.js';
import { buildDemo } from './demo-plan.js';
import { t } from './i18n.js';
import { confirmSheet, toast } from './ui.js';

// Marcador invisivel na UI, herdado do seed de desenvolvimento. Nao e o que
// governa a limpeza (quem governa e demoIds), mas identifica um treino de
// exemplo num backup exportado, onde os ids nao querem dizer nada.
const MARK = 'seed';

/** Se ha dados de exemplo no banco. Leitura sincrona, como db.settings(). */
export function hasDemo() {
  return Boolean(db.settings().demoIds);
}

/**
 * Grava o exemplo inteiro e guarda o que criou.
 *
 * `store` e o banco, e entra por parametro so pra o teste poder fazer a escrita
 * falhar no meio — em producao e sempre o db.js.
 *
 * @param {{onProgress?: (feitos: number, total: number) => void, store?: object}} opts
 */
export async function generateDemo({ onProgress = () => {}, store = db } = {}) {
  const plan = buildDemo({ today: new Date() });
  const ids = { exercises: [], templates: [], workouts: [] };
  const idByName = new Map();

  try {
    for (const ex of plan.exercises) {
      const saved = await store.addExercise({
        name: ex.name, muscleGroup: ex.group, slug: ex.slug, custom: false,
      });
      idByName.set(ex.name, saved.id);
      // Exercicio que ja estava na biblioteca e da pessoa, nao do exemplo:
      // addExercise reaproveita pelo slug, e limpar nao pode leva-lo junto.
      if (!saved.alreadyExisted) ids.exercises.push(saved.id);
    }

    for (const tpl of plan.templates) {
      const created = await store.addTemplate(tpl.name);
      await store.updateTemplate(created.id, {
        exerciseIds: tpl.exercises.map((name) => idByName.get(name)),
      });
      ids.templates.push(created.id);
    }

    let done = 0;
    for (const w of plan.workouts) {
      const workout = await store.addWorkout({
        date: w.date,
        startedAt: w.startedAt,
        finishedAt: w.finishedAt,
        exerciseIds: w.exercises.map((name) => idByName.get(name)),
        notes: MARK,
      });
      ids.workouts.push(workout.id);
      await store.addSets(w.sets.map((s) => ({
        workoutId: workout.id,
        exerciseId: idByName.get(s.exercise),
        weight: s.weight,
        reps: s.reps,
        warmup: s.warmup,
        // A serie e do dia do treino, nao de agora: createdAt e o que algumas
        // leituras usam como fallback de data, e um exemplo de 12 semanas atras
        // com series criadas hoje diria "ultima vez: hoje" em todas elas.
        createdAt: w.startedAt,
      })));
      onProgress(++done, plan.workouts.length);
    }
  } finally {
    // No finally, e nao depois do loop: uma falha no meio (quota, transacao
    // abortada) deixaria dado de exemplo no banco sem nada que soubesse
    // apaga-lo — hasDemo() diria que nao ha exemplo, a faixa nao acenderia e a
    // linha dos Ajustes ainda ofereceria GERAR, empilhando uma segunda copia.
    // `ids` e mutado no lugar, entao aqui ele tem exatamente o que entrou.
    // So grava se algo entrou: `demoIds` vazio acenderia a faixa sem nada atras.
    if (ids.exercises.length || ids.templates.length || ids.workouts.length) {
      await store.setSetting('demoIds', ids);
    }
  }

  return ids;
}

/** Apaga o que o exemplo criou, e so isso. */
export async function clearDemo() {
  // Le do banco, e nao do cache sincrono: a pagina /seed do `npm run dev` chama
  // isto sem passar pelo boot do app, onde getSettings() rodaria.
  const ids = (await db.getSettings()).demoIds;
  if (!ids) return;

  // Treinos primeiro: deleteWorkout leva as series junto, e sem elas o
  // deleteExercise abaixo passa a ser permitido.
  for (const id of ids.workouts || []) await db.deleteWorkout(id);
  for (const id of ids.templates || []) await db.deleteTemplate(id);
  for (const id of ids.exercises || []) {
    // deleteExercise recusa exercicio com serie registrada. Se a pessoa
    // treinou de verdade com um exercicio que o exemplo trouxe, ele agora e
    // dela: fica na biblioteca, e limpar o resto continua valendo.
    try {
      await db.deleteExercise(id);
    } catch { /* em uso pelo historico real */ }
  }

  await db.setSetting('demoIds', null);
}

/* ---------- O fluxo, do jeito que as telas precisam ----------
 * Confirmar, avisar e tratar o erro sao os mesmos passos nas TRES portas do
 * recurso (a faixa no app.js, a linha dos Ajustes e o wizard), e moravam
 * copiados nas tres — foi por isso que os Ajustes acabaram chamando chaves
 * `welcome.*`. Quem chama decide so o que e seu: pra onde ir depois. */

/**
 * Pergunta e limpa.
 * @returns {Promise<boolean>} se limpou — false quando a pessoa desistiu.
 */
export async function confirmAndClear() {
  const ok = await confirmSheet({
    title: t('demo.confirm.title'),
    message: t('demo.confirm.message'),
    confirmLabel: t('demo.clear'),
    danger: true,
  });
  if (!ok) return false;

  await clearDemo();
  toast(t('demo.toastCleared'));
  return true;
}

/**
 * Gera com o erro ja tratado: quem chama desenha o progresso, se tiver onde.
 * @returns {Promise<boolean>} se foi ate o fim.
 */
export async function runDemo({ onProgress } = {}) {
  try {
    await generateDemo({ onProgress });
    return true;
  } catch (err) {
    console.error(err);
    toast(t('demo.failed'));
    return false;
  }
}
