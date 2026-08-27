/* Sheet pra escolher um exercicio: da biblioteca, do catalogo de 873, ou
 * criado na hora — as tres saidas de "preciso de um exercicio que ainda nao
 * tenho" sem sair da tela.
 *
 * So resolve (e, se preciso, cria) o exercicio; quem chama decide o que
 * "escolher" significa via onChoose. Hoje so o treino em andamento usa
 * isto, pra entrar num exercicio na sessao. */

import * as db from '../db.js';
import * as catalog from '../catalog.js';
import { MUSCLE_GROUPS, groupLabel } from '../seed.js';
import { thumbHtml, prefetchPhotos, preloadCustomThumbs } from '../media.js';
import { t } from '../i18n.js';
import {
  html, raw, node, ICON, toast, openSheet, closeSheet, stripAccents, groupedList, listInCard,
} from '../ui.js';

// Lembra quais grupos ficaram abertos entre uma abertura e outra da folha
// nesta sessao — mesmo motivo do catalogo (catalog.js): quem esta pegando
// varios exercicios da mesma regiao (ex: dia de perna) nao quer reabrir o
// grupo toda vez.
const openGroups = new Set();

/**
 * @param {object[]} exercises biblioteca do usuario, no momento em que o seletor abre
 * @param {Set<number>} alreadyChosenIds ids que devem aparecer desabilitados ("no treino")
 * @param {(exercise: object) => void|Promise<void>} onChoose chamado uma vez, com o
 *   exercicio resolvido (escolhido da lista, do catalogo, ou recem-criado)
 */
export function openExercisePicker({ exercises, alreadyChosenIds, onChoose }) {
  const choose = async (exercise) => {
    closeSheet();
    await onChoose(exercise);
  };

  const body = node(html`
    <div>
      <input class="input" data-search type="search" placeholder="${t('picker.searchPlaceholder')}"
             autocomplete="off" autocapitalize="none" autocorrect="off">
      <div data-results style="margin-top:12px"></div>
    </div>
  `);
  openSheet(t('picker.sheetTitle'), body);

  const searchInput = body.querySelector('[data-search]');
  const results = body.querySelector('[data-results]');

  const draw = () => {
    const q = stripAccents(searchInput.value.trim());
    results.innerHTML = '';

    const filtered = q
      ? exercises.filter((e) => stripAccents(e.name).includes(q) || stripAccents(e.muscleGroup).includes(q))
      : exercises;

    if (!filtered.length) {
      results.append(node(html`<p class="muted small">${t('picker.noneFound')}</p>`));
    } else if (q) {
      // Buscando: lista plana — achar exatamente o que foi digitado importa
      // mais que navegar por grupo nesse momento.
      results.append(listInCard(filtered.map((ex) => exerciseItem(ex, alreadyChosenIds, choose))));
    } else {
      // Sem busca: por grupo muscular, colapsavel — mesmo padrao do
      // catalogo (catalog.js), pra nao rolar a biblioteca inteira toda vez.
      results.append(groupedList({
        items: filtered,
        getGroup: (e) => e.muscleGroup,
        openGroups,
        renderItem: (ex) => exerciseItem(ex, alreadyChosenIds, choose),
      }));
    }

    const newName = searchInput.value.trim();
    if (newName && !exercises.some((e) => stripAccents(e.name) === q)) {
      // Do catalogo: e aqui que o app deixa de ter uma lista fixa. Quem esta em
      // pe no meio do treino precisa de um exercicio que nao tem — antes a
      // unica saida era digitar tudo a mao.
      const fromCatalog = node('<div data-catalog></div>');
      results.append(fromCatalog);
      showCatalogSuggestions(fromCatalog, newName, exercises, choose);

      const btn = node(html`
        <button class="btn btn--block" style="margin-top:12px" data-create>
          ${raw(ICON.plus)} ${t('picker.createName', { name: newName })}
        </button>
      `);
      btn.onclick = () => newExerciseForm(newName, choose);
      results.append(btn);
    }
  };

  searchInput.addEventListener('input', draw);
  draw();
  // Mesmo padrao de exercise.js:renderList — nao atrasa a primeira pintura
  // do seletor, so redesenha se (e quando) o cache terminar de carregar.
  preloadCustomThumbs().then(() => { if (results.isConnected) draw(); }).catch(() => {});
}

/** Sugestoes do catalogo dentro do seletor.
 *
 *  O catalogo so e carregado quando o usuario ja digitou algo, para o sheet
 *  abrir instantaneo. O arquivo esta em cache do service worker, entao mesmo
 *  offline isto e leitura local. */
async function showCatalogSuggestions(target, term, exercises, choose) {
  let items;
  try {
    ({ items } = await catalog.search(term, { limit: 6 }));
  } catch {
    return; // sem catalogo o seletor segue funcionando como antes
  }

  // Ja na biblioteca? Entao ja apareceu na lista de cima.
  const mine = new Set(exercises.map((e) => e.slug).filter(Boolean));
  const newItems = items.filter((i) => !mine.has(i.slug));
  if (!newItems.length || !target.isConnected) return;

  target.append(node(`<h3 class="section-title">${t('picker.fromCatalog')}</h3>`));

  const catalogItem = (item) => {
    const li = node(html`
      <li class="list__item">
        <button class="list__link">
          ${raw(thumbHtml(item))}
          <div class="grow">
            <div style="font-weight:600">${catalog.displayName(item)}</div>
            <div class="muted small">${groupLabel(item.grupo)} · ${item.equipamento}</div>
          </div>
          ${raw(ICON.plus)}
        </button>
      </li>
    `);
    li.querySelector('button').onclick = async () => {
      // Um toque faz tudo: entra na biblioteca, entra no treino e ja busca as
      // fotos com a rede que houver agora.
      const created = await db.addExerciseFromCatalog(item);
      prefetchPhotos(item.slug);
      await choose(created);
    };
    return li;
  };

  target.append(listInCard(newItems.map(catalogItem)));
}

/** Uma linha de exercicio no seletor — usada tanto na lista plana (buscando)
 *  quanto como renderItem de groupedList (sem busca), sem embrulho de
 *  card: quem monta a lista ao redor decide isso. */
function exerciseItem(ex, alreadyChosenIds, choose) {
  const chosen = alreadyChosenIds.has(ex.id);
  const li = node(html`
    <li class="list__item">
      <button class="list__link" data-id="${ex.id}" ${raw(chosen ? 'disabled' : '')}>
        ${raw(thumbHtml(ex))}
        <div class="grow">
          <div style="font-weight:600">${ex.name}</div>
          <div class="muted small">${groupLabel(ex.muscleGroup)}</div>
        </div>
        ${chosen ? raw(`<span class="badge">${t('picker.inWorkout')}</span>`) : raw(ICON.plus)}
      </button>
    </li>
  `);
  if (!chosen) li.querySelector('button').onclick = () => choose(ex);
  else li.querySelector('button').style.opacity = '.5';
  return li;
}

function newExerciseForm(suggestedName, choose) {
  const body = node(html`
    <div class="stack">
      <label class="field">
        <span class="field__label">${t('exercise.form.name')}</span>
        <input class="input" data-name value="${suggestedName}" autocapitalize="sentences">
      </label>
      <label class="field">
        <span class="field__label">${t('exercise.form.muscleGroup')}</span>
        <select class="select" data-group>
          ${raw(MUSCLE_GROUPS.map((g) => `<option value="${g}">${groupLabel(g)}</option>`).join(''))}
        </select>
      </label>
      <button class="btn btn--primary btn--block" data-save>${t('picker.createAndAdd')}</button>
    </div>
  `);
  openSheet(t('exercise.form.newTitle'), body);

  body.querySelector('[data-save]').onclick = async () => {
    const name = body.querySelector('[data-name]').value.trim();
    if (!name) { toast(t('exercise.form.giveItAName')); return; }

    const created = await db.addExercise({ name, muscleGroup: body.querySelector('[data-group]').value });
    await choose(created);
    toast(t('exercise.form.toastCreated'));
  };
}
