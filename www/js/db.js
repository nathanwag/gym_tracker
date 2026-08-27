/* Unica camada que fala com o armazenamento.
 *
 * Todo o resto do app passa por aqui. Isso mantem a porta aberta para trocar
 * o backend depois (SQLite nativo via Capacitor, ou sincronizacao em nuvem)
 * sem tocar nas telas.
 *
 * Cuidado com Safari/WebKit: uma transacao do IndexedDB e encerrada quando o
 * event loop fica ocioso. Por isso os pedidos sao sempre disparados de forma
 * sincrona dentro do callback da transacao, e o `await` acontece do lado de
 * fora. Nunca coloque um `await` de outra coisa no meio de uma transacao.
 */

import { slugByName } from './seed.js';
import { normalizeName } from './text.js';

// Nome do banco em si NAO muda: IndexedDB e chaveado por (origem, nome do
// banco) — trocar essa string faria o app abrir um banco novo e vazio,
// ignorando todo o historico ja gravado sob o nome antigo. Excecao
// permanente, no mesmo espirito do valor de FORMAT em backup.js.
const DB_NAME = 'treino';
// v2: campo `slug` no exercicio, ligando-o as figuras de www/img/ex/.
// v3: nomes de campo em ingles (exercises/workouts/sets/settings).
// v4: store `exerciseImages`, fotos personalizadas (posicao inicial/final).
const DB_VERSION = 4;

export const DEFAULT_SETTINGS = {
  unit: 'kg',
  theme: 'auto',
  language: 'pt',
  weightIncrement: 2.5,
  repsIncrement: 1,
  // Versao do catalogo cujas miniaturas ja foram baixadas; evita repetir o
  // precache a cada abertura. Vazio = nunca baixou.
  mediaPrecacheVersion: '',
};

let dbPromise = null;
let exerciseCache = null;
let settingsCache = { ...DEFAULT_SETTINGS };

/* ---------- Infraestrutura ---------- */

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function open() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (event.oldVersion < 1) {
        const exercises = db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
        exercises.createIndex('by_grupo', 'grupoMuscular');

        const workouts = db.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
        workouts.createIndex('by_data', 'data');

        const sets = db.createObjectStore('sets', { keyPath: 'id', autoIncrement: true });
        sets.createIndex('by_workout', 'workoutId');
        sets.createIndex('by_exercise', 'exerciseId');

        db.createObjectStore('settings', { keyPath: 'key' });
      }

      if (event.oldVersion < 2) {
        // Quem ja usava o app tem exercicios sem slug, e eles nao podem ser
        // recriados: `sets.exerciseId` e `workouts.exerciseIds` apontam para o
        // id atual. Entao o preenchimento e feito no lugar, por cursor.
        //
        // Tudo aqui e sincrono de proposito (ver o aviso no topo do arquivo):
        // `slugByName()` e `normalizeName()` sao funcoes puras sobre imports
        // estaticos, e o encadeamento acontece dentro do onsuccess do cursor.
        // Se a transacao abortar, o banco continua em v1 e a migracao roda de
        // novo na proxima abertura.
        const store = request.transaction.objectStore('exercises');
        if (!store.indexNames.contains('by_slug')) store.createIndex('by_slug', 'slug');

        const bySlug = slugByName();
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) return;
          const record = current.value;
          // `undefined` = nunca migrado. `null` e escolha deliberada (exercicio
          // sem figura) e nao deve ser reprocessado.
          if (record.slug === undefined) {
            current.update({ ...record, slug: bySlug.get(normalizeName(record.nome)) ?? null });
          }
          current.continue();
        };
      }

      if (event.oldVersion < 3) {
        // Nomes de campo em portugues -> ingles. Os indices `by_grupo`/
        // `by_data` nunca sao consultados em lugar nenhum do app, entao saem
        // em vez de acompanhar a troca de nome de campo.
        const exercisesStore = request.transaction.objectStore('exercises');
        if (exercisesStore.indexNames.contains('by_grupo')) exercisesStore.deleteIndex('by_grupo');
        const exercisesCursor = exercisesStore.openCursor();
        exercisesCursor.onsuccess = () => {
          const cursor = exercisesCursor.result;
          if (!cursor) return;
          const r = cursor.value;
          cursor.update({
            id: r.id,
            name: r.nome,
            // Valor gravado (ex: "Peito") continua em portugues de proposito:
            // vem do catalogo (fora de escopo desta migracao), so o nome do
            // campo muda.
            muscleGroup: r.grupoMuscular,
            slug: r.slug,
            custom: r.personalizado,
            createdAt: r.criadoEm,
          });
          cursor.continue();
        };

        const workoutsStore = request.transaction.objectStore('workouts');
        if (workoutsStore.indexNames.contains('by_data')) workoutsStore.deleteIndex('by_data');
        const workoutsCursor = workoutsStore.openCursor();
        workoutsCursor.onsuccess = () => {
          const cursor = workoutsCursor.result;
          if (!cursor) return;
          const r = cursor.value;
          cursor.update({
            id: r.id,
            date: r.data,
            startedAt: r.iniciadoEm,
            finishedAt: r.finalizadoEm,
            notes: r.notas,
            exerciseIds: r.exerciseIds,
            completedIds: r.concluidoIds,
          });
          cursor.continue();
        };

        const setsStore = request.transaction.objectStore('sets');
        const setsCursor = setsStore.openCursor();
        setsCursor.onsuccess = () => {
          const cursor = setsCursor.result;
          if (!cursor) return;
          const r = cursor.value;
          cursor.update({
            id: r.id,
            workoutId: r.workoutId,
            exerciseId: r.exerciseId,
            weight: r.peso,
            reps: r.reps,
            // duracaoSeg so existe em series gravadas depois do recurso de
            // cardio/alongamento — series mais antigas nunca tiveram o campo.
            durationSec: r.duracaoSeg ?? 0,
            warmup: r.aquecimento,
            createdAt: r.criadoEm,
          });
          cursor.continue();
        };

        // settings e chave-valor (nao tem um shape fixo pra so dar update):
        // renomear a chave em si exige apagar o registro velho e criar um
        // novo, ja que o keyPath do store e o proprio campo `key`.
        const settingsKeyMap = {
          unidade: 'unit',
          tema: 'theme',
          idioma: 'language',
          incrementoPeso: 'weightIncrement',
          incrementoReps: 'repsIncrement',
          midiaPrecacheVersao: 'mediaPrecacheVersion',
        };
        const themeValueMap = { claro: 'light', escuro: 'dark' };
        const settingsStore = request.transaction.objectStore('settings');
        const settingsCursor = settingsStore.openCursor();
        settingsCursor.onsuccess = () => {
          const cursor = settingsCursor.result;
          if (!cursor) return;
          const row = cursor.value;
          const newKey = settingsKeyMap[row.key];
          if (newKey) {
            const newValue = row.key === 'tema' ? (themeValueMap[row.value] ?? row.value) : row.value;
            cursor.delete();
            settingsStore.add({ key: newKey, value: newValue });
          }
          cursor.continue();
        };
      }

      if (event.oldVersion < 4) {
        // Chave composta: da unicidade por (exercicio, posicao) sem precisar
        // do padrao get-then-put que addExercise usa pro slug, e permite
        // buscar as duas fotos de um exercicio com um range direto na chave
        // primaria (ver getExerciseImages), sem indice extra.
        db.createObjectStore('exerciseImages', { keyPath: ['exerciseId', 'slot'] });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Sem isto, uma aba antiga presa na versao anterior bloquearia a
      // atualizacao das outras para sempre. Alem de fechar, e preciso soltar a
      // promessa memoizada: ela guardaria uma conexao morta e toda transacao
      // seguinte falharia com "The database connection is closing".
      db.onversionchange = () => { db.close(); dbPromise = null; };
      // Mesmo motivo, para quando o proprio navegador encerra a conexao.
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Banco de dados bloqueado por outra aba aberta.'));
  });

  return dbPromise;
}

/**
 * Roda `fn` numa transacao e resolve com o que ela retornar.
 * @param {string|string[]} names lojas envolvidas
 * @param {IDBTransactionMode} mode
 * @param {(...stores: IDBObjectStore[]) => any} fn
 */
async function tx(names, mode, fn) {
  const db = await open();
  const list = [].concat(names);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(list, mode);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transação cancelada.'));

    Promise.resolve(fn(...list.map((name) => transaction.objectStore(name))))
      .then((value) => { result = value; })
      .catch((err) => { reject(err); try { transaction.abort(); } catch { /* ja encerrada */ } });
  });
}

/** Abre o banco. A biblioteca de exercicios comeca vazia — o usuario adiciona
 *  do catalogo de 873 (#/catalogo) ou a mao (botao "Novo"). */
export async function init() {
  await open();
  return true;
}

/* ---------- Ajustes ---------- */

export async function getSettings() {
  const rows = await tx('settings', 'readonly', (s) => req(s.getAll()));
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  settingsCache = { ...DEFAULT_SETTINGS, ...saved };
  return settingsCache;
}

/** Leitura sincrona dos ajustes ja carregados — as telas usam unidade e
 *  incrementos em toda renderizacao e nao devem esperar pelo banco. */
export function settings() {
  return settingsCache;
}

export async function setSetting(key, value) {
  await tx('settings', 'readwrite', (s) => s.put({ key, value }));
  settingsCache = { ...settingsCache, [key]: value };
}

/* ---------- Exercicios ----------
 * A biblioteca tem ~80 itens e e lida em quase toda tela, entao fica em cache
 * na memoria; qualquer escrita invalida o cache. */

export async function listExercises() {
  if (!exerciseCache) {
    const rows = await tx('exercises', 'readonly', (s) => req(s.getAll()));
    rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    exerciseCache = rows;
  }
  return exerciseCache;
}

export async function getExercise(id) {
  const all = await listExercises();
  return all.find((e) => e.id === Number(id)) || null;
}

/** Adiciona um exercicio. Vindo do catalogo, `slug` preenchido e
 *  `custom: false`; criado a mao, sem slug e `custom: true`.
 *
 *  Devolve `alreadyExisted` quando o slug ja estava na biblioteca: sem essa
 *  guarda, adicionar o mesmo exercicio pelo catalogo e pelo seletor criaria
 *  duas linhas e o historico de carga ficaria dividido entre elas. */
export async function addExercise({
  name, muscleGroup, slug = null, custom = true,
}) {
  const record = {
    name: String(name).trim(),
    muscleGroup: muscleGroup || 'Outros',
    slug: slug || null,
    custom,
    createdAt: new Date().toISOString(),
  };

  const result = await tx('exercises', 'readwrite', (store) => {
    if (!record.slug) {
      return req(store.add(record)).then((id) => ({ ...record, id, alreadyExisted: false }));
    }
    return req(store.index('by_slug').get(record.slug)).then((existing) => (
      existing
        ? { ...existing, alreadyExisted: true }
        : req(store.add(record)).then((id) => ({ ...record, id, alreadyExisted: false }))
    ));
  });

  exerciseCache = null;
  return result;
}

/** Cria (ou reaproveita, se o slug ja existir) um exercicio a partir de um
 *  item do catalogo. Quem chama e responsavel por aquecer o cache das fotos
 *  (media.js:prefetchPhotos) — db.js nao depende de media.js de proposito. */
export async function addExerciseFromCatalog(item, muscleGroup = item.grupo) {
  return addExercise({
    name: item.nome, muscleGroup, slug: item.slug, custom: false,
  });
}

export async function updateExercise(id, patch) {
  await tx('exercises', 'readwrite', (store) =>
    req(store.get(Number(id))).then((current) => {
      if (!current) throw new Error('Exercício não encontrado.');
      store.put({ ...current, ...patch, id: current.id });
    }));
  exerciseCache = null;
}

/** Liga (ou tira) a figura de um exercicio ja existente — caminho de edicao
 *  (renomeado, ou criado a mao) para o que addExerciseFromCatalog faz na
 *  criacao. Mesma regra: quem chama aquece o cache das fotos, se quiser. */
export async function setExerciseImage(id, slug) {
  await updateExercise(id, { slug: slug || null });
}

/** Remove um exercicio. Falha se houver series registradas nele. */
export async function deleteExercise(id) {
  const uses = await countSetsByExercise(id);
  if (uses > 0) {
    throw new Error(`Este exercício tem ${uses} série(s) registrada(s). Apague o histórico dele antes.`);
  }
  await tx(['exercises', 'exerciseImages'], 'readwrite', (ex, images) => {
    ex.delete(Number(id));
    // Delete de chave inexistente nao da erro — nao precisa checar antes se
    // o exercicio tinha foto em cada posicao.
    images.delete([Number(id), 0]);
    images.delete([Number(id), 1]);
  });
  exerciseCache = null;
}

export function countSetsByExercise(id) {
  return tx('sets', 'readonly', (s) => req(s.index('by_exercise').count(Number(id))));
}

/* ---------- Fotos personalizadas ----------
 * Ficam fora do registro do exercicio (e do exerciseCache) de proposito: sao
 * Blobs pesados lidos so quando a tela de detalhe ou o editor de fotos
 * precisa deles, nao a cada listagem — mesma logica que ja separa
 * catalogo.json (leve, lido toda hora) de instrucoes.json (pesado, sob
 * demanda) em catalog.js. */

/** As duas fotos de um exercicio, na ordem [posicao inicial, posicao final].
 *  `null` no lugar de um Blob significa "sem foto personalizada nesse slot". */
export async function getExerciseImages(id) {
  const rows = await tx('exerciseImages', 'readonly', (s) =>
    req(s.getAll(IDBKeyRange.bound([Number(id), 0], [Number(id), 1]))));
  const bySlot = new Map(rows.map((r) => [r.slot, r.blob]));
  return [bySlot.get(0) ?? null, bySlot.get(1) ?? null];
}

export async function saveExerciseImage(id, slot, blob) {
  await tx('exerciseImages', 'readwrite', (s) => req(s.put({
    exerciseId: Number(id), slot, blob, createdAt: new Date().toISOString(),
  })));
}

export async function removeExerciseImage(id, slot) {
  await tx('exerciseImages', 'readwrite', (s) => req(s.delete([Number(id), slot])));
}

/** Todas as fotos personalizadas de todos os exercicios, cru — usado pelo
 *  cache de miniaturas (media.js) e pelo backup (dumpAll). */
export function listAllExerciseImages() {
  return tx('exerciseImages', 'readonly', (s) => req(s.getAll()));
}

/* ---------- Treinos ---------- */

export async function startWorkout() {
  const now = new Date().toISOString();
  // exerciseIds guarda a ordem dos exercicios da sessao, inclusive os que ainda
  // nao tem nenhuma serie — a ordem nao poderia ser derivada so das series.
  const record = {
    date: now.slice(0, 10),
    startedAt: now,
    finishedAt: null,
    notes: '',
    exerciseIds: [],
    completedIds: [],
  };
  const id = await tx('workouts', 'readwrite', (s) => req(s.add(record)));
  return { ...record, id };
}

/** O treino em aberto (sem finishedAt), se existir. */
export async function getActiveWorkout() {
  const all = await tx('workouts', 'readonly', (s) => req(s.getAll()));
  const unfinished = all.filter((w) => !w.finishedAt);
  unfinished.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return unfinished[0] || null;
}

export function getWorkout(id) {
  return tx('workouts', 'readonly', (s) => req(s.get(Number(id))));
}

export async function listWorkouts({ limit = 0, includeOpen = true } = {}) {
  const all = await tx('workouts', 'readonly', (s) => req(s.getAll()));
  const list = includeOpen ? all : all.filter((w) => w.finishedAt);
  list.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return limit ? list.slice(0, limit) : list;
}

export async function updateWorkout(id, patch) {
  await tx('workouts', 'readwrite', (store) =>
    req(store.get(Number(id))).then((current) => {
      if (!current) throw new Error('Treino não encontrado.');
      store.put({ ...current, ...patch, id: current.id });
    }));
}

export function finishWorkout(id) {
  return updateWorkout(id, { finishedAt: new Date().toISOString() });
}

export async function addExerciseToWorkout(workoutId, exerciseId) {
  const workout = await getWorkout(workoutId);
  if (!workout) throw new Error('Treino não encontrado.');
  const ids = workout.exerciseIds || [];
  if (ids.includes(Number(exerciseId))) return;
  await updateWorkout(workoutId, { exerciseIds: [...ids, Number(exerciseId)] });
}

/** Tira o exercicio da sessao e apaga as series dele naquele treino. */
export async function removeExerciseFromWorkout(workoutId, exerciseId) {
  const workout = await getWorkout(workoutId);
  if (!workout) return;
  const target = Number(exerciseId);
  await updateWorkout(workoutId, {
    exerciseIds: (workout.exerciseIds || []).filter((id) => id !== target),
  });
  await tx('sets', 'readwrite', (store) =>
    req(store.index('by_workout').getAll(Number(workoutId))).then((sets) => {
      for (const s of sets) if (s.exerciseId === target) store.delete(s.id);
    }));
}

/** Apaga o treino e, junto, todas as series dele. */
export function deleteWorkout(id) {
  const target = Number(id);
  return tx(['workouts', 'sets'], 'readwrite', (workouts, sets) => {
    workouts.delete(target);
    return req(sets.index('by_workout').getAllKeys(target))
      .then((keys) => { for (const key of keys) sets.delete(key); });
  });
}

/* ---------- Series ---------- */

export async function addSet({
  workoutId, exerciseId, weight, reps, durationSec, warmup = false,
}) {
  const record = {
    workoutId: Number(workoutId),
    exerciseId: Number(exerciseId),
    weight: Number(weight) || 0,
    reps: Math.max(0, Math.round(Number(reps) || 0)),
    durationSec: Math.max(0, Math.round(Number(durationSec) || 0)),
    warmup: Boolean(warmup),
    createdAt: new Date().toISOString(),
  };
  const id = await tx('sets', 'readwrite', (s) => req(s.add(record)));
  return { ...record, id };
}

export async function updateSet(id, patch) {
  await tx('sets', 'readwrite', (store) =>
    req(store.get(Number(id))).then((current) => {
      if (!current) throw new Error('Série não encontrada.');
      store.put({ ...current, ...patch, id: current.id });
    }));
}

export function deleteSet(id) {
  return tx('sets', 'readwrite', (s) => s.delete(Number(id)));
}

export async function listSetsByWorkout(workoutId) {
  const rows = await tx('sets', 'readonly', (s) => req(s.index('by_workout').getAll(Number(workoutId))));
  rows.sort((a, b) => a.id - b.id);
  return rows;
}

export async function listSetsByExercise(exerciseId) {
  const rows = await tx('sets', 'readonly', (s) => req(s.index('by_exercise').getAll(Number(exerciseId))));
  rows.sort((a, b) => a.id - b.id);
  return rows;
}

export async function listAllSets() {
  const rows = await tx('sets', 'readonly', (s) => req(s.getAll()));
  rows.sort((a, b) => a.id - b.id);
  return rows;
}

/* ---------- Backup ---------- */

/** Copia integral do banco, usada por backup.js para gerar o JSON. */
export async function dumpAll() {
  const [exercises, workouts, sets, settingsRows, images] = await Promise.all([
    tx('exercises', 'readonly', (s) => req(s.getAll())),
    tx('workouts', 'readonly', (s) => req(s.getAll())),
    tx('sets', 'readonly', (s) => req(s.getAll())),
    tx('settings', 'readonly', (s) => req(s.getAll())),
    tx('exerciseImages', 'readonly', (s) => req(s.getAll())),
  ]);
  return {
    exercises, workouts, sets, settings: settingsRows, images,
  };
}

/** Substitui todo o conteudo do banco (restauracao de backup). */
export async function replaceAll({
  exercises = [], workouts = [], sets = [], settings: settingsRows = [], images = [],
}) {
  await tx(['exercises', 'workouts', 'sets', 'settings', 'exerciseImages'], 'readwrite', (ex, wo, se, st, im) => {
    ex.clear(); wo.clear(); se.clear(); st.clear(); im.clear();
    for (const row of exercises) ex.put(row);
    for (const row of workouts) wo.put(row);
    for (const row of sets) se.put(row);
    for (const row of settingsRows) st.put(row);
    for (const row of images) im.put(row);
  });
  exerciseCache = null;
}

/** Apaga tudo, incluindo a biblioteca de exercicios. */
export async function resetAll() {
  await tx(['exercises', 'workouts', 'sets', 'settings', 'exerciseImages'], 'readwrite', (ex, wo, se, st, im) => {
    ex.clear(); wo.clear(); se.clear(); st.clear(); im.clear();
  });
  exerciseCache = null;
}
