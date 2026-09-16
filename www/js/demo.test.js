/* O modo demonstracao escreve em tres stores e so depois registra o que criou.
 * O que este teste trava e o meio do caminho: se a escrita falhar no quinto
 * treino, o que ja entrou no banco TEM que estar em `demoIds`, senao hasDemo()
 * diz que nao ha exemplo nenhum e a pessoa fica com dados falsos que nenhuma
 * tela sabe apagar.
 *
 * O banco entra por parametro: e um boundary (IndexedDB), e o unico jeito de
 * fazer a escrita falhar no meio de proposito. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { generateDemo } from './demo.js';

/** Um `db` de mentira que conta o que foi criado e pode falhar num treino. */
function fakeStore({ failAtWorkout = Infinity, failAtExercise = Infinity } = {}) {
  const settings = {};
  const created = { exercises: [], templates: [], workouts: [], sets: 0 };
  let nextId = 1;

  return {
    settings,
    created,
    setSetting: async (key, value) => { settings[key] = value; },
    addExercise: async (ex) => {
      if (created.exercises.length + 1 === failAtExercise) {
        throw new Error('QuotaExceededError');
      }
      const id = nextId++;
      created.exercises.push(id);
      return { ...ex, id, alreadyExisted: false };
    },
    addTemplate: async (name) => {
      const id = nextId++;
      created.templates.push(id);
      return { name, id };
    },
    updateTemplate: async () => {},
    addWorkout: async (w) => {
      if (created.workouts.length + 1 === failAtWorkout) {
        throw new Error('QuotaExceededError');
      }
      const id = nextId++;
      created.workouts.push(id);
      return { ...w, id };
    },
    addSets: async (rows) => { created.sets += rows.length; },
  };
}

test('a geracao que falha no meio registra o que ja criou', async () => {
  const store = fakeStore({ failAtWorkout: 5 });

  await assert.rejects(() => generateDemo({ store }));

  const ids = store.settings.demoIds;
  assert.ok(ids, 'demoIds ficou sem gravar: nenhuma tela saberia limpar o que entrou');
  assert.equal(ids.workouts.length, 4, 'os 4 treinos que entraram antes da falha');
  assert.deepEqual(ids.exercises, store.created.exercises);
  assert.deepEqual(ids.templates, store.created.templates);
});

/* O outro lado do mesmo guard: `demoIds` gravado vazio faria hasDemo() acender
 * a faixa "voce esta vendo dados de exemplo" sem nenhum dado de exemplo atras
 * dela, e o botao Limpar nao teria o que apagar. */
test('a geracao que falha antes de criar qualquer coisa nao registra nada', async () => {
  const store = fakeStore({ failAtExercise: 1 });

  await assert.rejects(() => generateDemo({ store }));

  assert.equal(store.settings.demoIds, undefined);
});
