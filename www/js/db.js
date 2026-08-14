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

import { SEED_EXERCISES } from './seed.js';

const DB_NAME = 'treino';
const DB_VERSION = 1;

export const DEFAULT_SETTINGS = {
  unidade: 'kg',
  tema: 'auto',
  incrementoPeso: 2.5,
  incrementoReps: 1,
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
    };

    request.onsuccess = () => resolve(request.result);
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

/** Abre o banco, semeia a biblioteca de exercicios na primeira execucao. */
export async function init() {
  await open();
  const count = await tx('exercises', 'readonly', (s) => req(s.count()));
  if (count === 0) await seedExercises();
  return true;
}

async function seedExercises() {
  const criadoEm = new Date().toISOString();
  await tx('exercises', 'readwrite', (store) => {
    for (const [grupoMuscular, nomes] of Object.entries(SEED_EXERCISES)) {
      for (const nome of nomes) {
        store.add({ nome, grupoMuscular, personalizado: false, criadoEm });
      }
    }
  });
  exerciseCache = null;
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
    rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    exerciseCache = rows;
  }
  return exerciseCache;
}

export async function getExercise(id) {
  const all = await listExercises();
  return all.find((e) => e.id === Number(id)) || null;
}

export async function addExercise({ nome, grupoMuscular }) {
  const registro = {
    nome: String(nome).trim(),
    grupoMuscular: grupoMuscular || 'Outros',
    personalizado: true,
    criadoEm: new Date().toISOString(),
  };
  const id = await tx('exercises', 'readwrite', (s) => req(s.add(registro)));
  exerciseCache = null;
  return { ...registro, id };
}

export async function updateExercise(id, patch) {
  await tx('exercises', 'readwrite', (store) =>
    req(store.get(Number(id))).then((atual) => {
      if (!atual) throw new Error('Exercício não encontrado.');
      store.put({ ...atual, ...patch, id: atual.id });
    }));
  exerciseCache = null;
}

/** Remove um exercicio. Falha se houver series registradas nele. */
export async function deleteExercise(id) {
  const usos = await countSetsByExercise(id);
  if (usos > 0) {
    throw new Error(`Este exercício tem ${usos} série(s) registrada(s). Apague o histórico dele antes.`);
  }
  await tx('exercises', 'readwrite', (s) => s.delete(Number(id)));
  exerciseCache = null;
}

export function countSetsByExercise(id) {
  return tx('sets', 'readonly', (s) => req(s.index('by_exercise').count(Number(id))));
}

/* ---------- Treinos ---------- */

export async function startWorkout() {
  const agora = new Date().toISOString();
  // exerciseIds guarda a ordem dos exercicios da sessao, inclusive os que ainda
  // nao tem nenhuma serie — a ordem nao poderia ser derivada so das series.
  const registro = {
    data: agora.slice(0, 10),
    iniciadoEm: agora,
    finalizadoEm: null,
    notas: '',
    exerciseIds: [],
  };
  const id = await tx('workouts', 'readwrite', (s) => req(s.add(registro)));
  return { ...registro, id };
}

/** O treino em aberto (sem finalizadoEm), se existir. */
export async function getActiveWorkout() {
  const todos = await tx('workouts', 'readonly', (s) => req(s.getAll()));
  const abertos = todos.filter((w) => !w.finalizadoEm);
  abertos.sort((a, b) => b.iniciadoEm.localeCompare(a.iniciadoEm));
  return abertos[0] || null;
}

export function getWorkout(id) {
  return tx('workouts', 'readonly', (s) => req(s.get(Number(id))));
}

export async function listWorkouts({ limit = 0, incluirAbertos = true } = {}) {
  const todos = await tx('workouts', 'readonly', (s) => req(s.getAll()));
  const lista = incluirAbertos ? todos : todos.filter((w) => w.finalizadoEm);
  lista.sort((a, b) => b.iniciadoEm.localeCompare(a.iniciadoEm));
  return limit ? lista.slice(0, limit) : lista;
}

export async function updateWorkout(id, patch) {
  await tx('workouts', 'readwrite', (store) =>
    req(store.get(Number(id))).then((atual) => {
      if (!atual) throw new Error('Treino não encontrado.');
      store.put({ ...atual, ...patch, id: atual.id });
    }));
}

export function finishWorkout(id) {
  return updateWorkout(id, { finalizadoEm: new Date().toISOString() });
}

export async function addExerciseToWorkout(workoutId, exerciseId) {
  const treino = await getWorkout(workoutId);
  if (!treino) throw new Error('Treino não encontrado.');
  const ids = treino.exerciseIds || [];
  if (ids.includes(Number(exerciseId))) return;
  await updateWorkout(workoutId, { exerciseIds: [...ids, Number(exerciseId)] });
}

/** Tira o exercicio da sessao e apaga as series dele naquele treino. */
export async function removeExerciseFromWorkout(workoutId, exerciseId) {
  const treino = await getWorkout(workoutId);
  if (!treino) return;
  const alvo = Number(exerciseId);
  await updateWorkout(workoutId, {
    exerciseIds: (treino.exerciseIds || []).filter((id) => id !== alvo),
  });
  await tx('sets', 'readwrite', (store) =>
    req(store.index('by_workout').getAll(Number(workoutId))).then((series) => {
      for (const s of series) if (s.exerciseId === alvo) store.delete(s.id);
    }));
}

/** Apaga o treino e, junto, todas as series dele. */
export function deleteWorkout(id) {
  const alvo = Number(id);
  return tx(['workouts', 'sets'], 'readwrite', (workouts, sets) => {
    workouts.delete(alvo);
    return req(sets.index('by_workout').getAllKeys(alvo))
      .then((chaves) => { for (const chave of chaves) sets.delete(chave); });
  });
}

/* ---------- Series ---------- */

export async function addSet({ workoutId, exerciseId, peso, reps, aquecimento = false }) {
  const registro = {
    workoutId: Number(workoutId),
    exerciseId: Number(exerciseId),
    peso: Number(peso) || 0,
    reps: Math.max(0, Math.round(Number(reps) || 0)),
    aquecimento: Boolean(aquecimento),
    criadoEm: new Date().toISOString(),
  };
  const id = await tx('sets', 'readwrite', (s) => req(s.add(registro)));
  return { ...registro, id };
}

export async function updateSet(id, patch) {
  await tx('sets', 'readwrite', (store) =>
    req(store.get(Number(id))).then((atual) => {
      if (!atual) throw new Error('Série não encontrada.');
      store.put({ ...atual, ...patch, id: atual.id });
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
  const [exercises, workouts, sets, settings] = await Promise.all([
    tx('exercises', 'readonly', (s) => req(s.getAll())),
    tx('workouts', 'readonly', (s) => req(s.getAll())),
    tx('sets', 'readonly', (s) => req(s.getAll())),
    tx('settings', 'readonly', (s) => req(s.getAll())),
  ]);
  return { exercises, workouts, sets, settings };
}

/** Substitui todo o conteudo do banco (restauracao de backup). */
export async function replaceAll({ exercises = [], workouts = [], sets = [], settings = [] }) {
  await tx(['exercises', 'workouts', 'sets', 'settings'], 'readwrite', (ex, wo, se, st) => {
    ex.clear(); wo.clear(); se.clear(); st.clear();
    for (const row of exercises) ex.put(row);
    for (const row of workouts) wo.put(row);
    for (const row of sets) se.put(row);
    for (const row of settings) st.put(row);
  });
  exerciseCache = null;
}

/** Apaga tudo e volta a biblioteca de exercicios de fabrica. */
export async function resetAll() {
  await tx(['exercises', 'workouts', 'sets', 'settings'], 'readwrite', (ex, wo, se, st) => {
    ex.clear(); wo.clear(); se.clear(); st.clear();
  });
  exerciseCache = null;
  await seedExercises();
}
