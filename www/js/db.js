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

import { slugPorNome } from './seed.js';
import { normalizarNome } from './text.js';

const DB_NAME = 'treino';
// v2: campo `slug` no exercicio, ligando-o as figuras de www/img/ex/.
const DB_VERSION = 2;

export const DEFAULT_SETTINGS = {
  unidade: 'kg',
  tema: 'auto',
  incrementoPeso: 2.5,
  incrementoReps: 1,
  // Versao do catalogo cujas miniaturas ja foram baixadas; evita repetir o
  // precache a cada abertura. Vazio = nunca baixou.
  midiaPrecacheVersao: '',
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
        // `slugPorNome()` e `normalizarNome()` sao funcoes puras sobre imports
        // estaticos, e o encadeamento acontece dentro do onsuccess do cursor.
        // Se a transacao abortar, o banco continua em v1 e a migracao roda de
        // novo na proxima abertura.
        const store = request.transaction.objectStore('exercises');
        if (!store.indexNames.contains('by_slug')) store.createIndex('by_slug', 'slug');

        const porNome = slugPorNome();
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const atual = cursor.result;
          if (!atual) return;
          const registro = atual.value;
          // `undefined` = nunca migrado. `null` e escolha deliberada (exercicio
          // sem figura) e nao deve ser reprocessado.
          if (registro.slug === undefined) {
            atual.update({ ...registro, slug: porNome.get(normalizarNome(registro.nome)) ?? null });
          }
          atual.continue();
        };
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
    rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    exerciseCache = rows;
  }
  return exerciseCache;
}

export async function getExercise(id) {
  const all = await listExercises();
  return all.find((e) => e.id === Number(id)) || null;
}

/** Adiciona um exercicio. Vindo do catalogo, `slug` preenchido e
 *  `personalizado: false`; criado a mao, sem slug e `personalizado: true`.
 *
 *  Devolve `jaExistia` quando o slug ja estava na biblioteca: sem essa guarda,
 *  adicionar o mesmo exercicio pelo catalogo e pelo seletor criaria duas linhas
 *  e o historico de carga ficaria dividido entre elas. */
export async function addExercise({ nome, grupoMuscular, slug = null, personalizado = true }) {
  const registro = {
    nome: String(nome).trim(),
    grupoMuscular: grupoMuscular || 'Outros',
    slug: slug || null,
    personalizado,
    criadoEm: new Date().toISOString(),
  };

  const resultado = await tx('exercises', 'readwrite', (store) => {
    if (!registro.slug) {
      return req(store.add(registro)).then((id) => ({ ...registro, id, jaExistia: false }));
    }
    return req(store.index('by_slug').get(registro.slug)).then((existente) => (
      existente
        ? { ...existente, jaExistia: true }
        : req(store.add(registro)).then((id) => ({ ...registro, id, jaExistia: false }))
    ));
  });

  exerciseCache = null;
  return resultado;
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

/** Apaga tudo, incluindo a biblioteca de exercicios. */
export async function resetAll() {
  await tx(['exercises', 'workouts', 'sets', 'settings'], 'readwrite', (ex, wo, se, st) => {
    ex.clear(); wo.clear(); se.clear(); st.clear();
  });
  exerciseCache = null;
}
