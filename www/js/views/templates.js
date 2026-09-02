/* Modelos de treino: rotinas montadas uma vez e reusadas.
 *
 * Um modelo e so um nome e uma ordem de exercicios — nao guarda serie, repeticao
 * nem peso alvo. Iniciar um treino a partir dele abre a sessao ja com os cards
 * no lugar; dali pra frente e um treino como qualquer outro.
 *
 * Vive dentro da aba Exercicios (librarySwitch), pelo mesmo motivo do catalogo:
 * a tabbar de 4 esta no limite confortavel de toque. */

import * as db from '../db.js';
import { moveInOrder, existingInOrder } from '../models.js';
import { groupBy, groupLabel } from '../seed.js';
import { thumbHtml, preloadCustomThumbs } from '../media.js';
import { t, tn } from '../i18n.js';
import {
  html, raw, node, ICON, setTop, openSheet, closeSheet, confirmSheet, toast,
  listInCard, librarySwitch, refresh,
} from '../ui.js';

/* ==========================================================================
   Lista
   ========================================================================== */

export async function renderList(view) {
  const [templates, exercises] = await Promise.all([db.listTemplates(), db.listExercises()]);
  const byId = new Map(exercises.map((e) => [e.id, e]));

  setTop({ title: t('templates.listTitle') });

  const root = node(html`
    <div class="stack">
      <div data-list></div>
      <button class="btn btn--primary btn--block" data-add>${raw(ICON.plus)} ${t('templates.new')}</button>
    </div>
  `);
  root.prepend(librarySwitch('templates'));
  root.querySelector('[data-add]').onclick = () => nameSheet();

  const list = root.querySelector('[data-list]');

  if (!templates.length) {
    list.append(node(html`
      <div class="card"><div class="empty">
        ${raw(ICON.dumbbell)}
        <p>${t('templates.emptyList')}</p>
      </div></div>
    `));
  } else {
    list.append(listInCard(templates.map((tpl) => templateItem(tpl, byId))));
  }

  view.append(root);
  preloadCustomThumbs().catch(() => {});
}

function templateItem(template, byId) {
  const items = existingInOrder(template.exerciseIds, byId.keys()).map((id) => byId.get(id));
  // Os grupos por extenso e na ordem anatomica: e o que diz de relance se este
  // e o dia de peito ou o de perna, sem abrir o modelo.
  const groups = groupBy(items, (e) => e.muscleGroup).map(({ group }) => groupLabel(group));

  return node(html`
    <li class="list__item">
      <a class="list__link" href="#/modelos/${template.id}">
        <div class="grow">
          <div style="font-weight:600">${template.name}</div>
          <div class="muted small truncate">
            ${items.length ? `${tn('common.exercise', items.length)} · ${groups.join(', ')}` : t('templates.emptyOne')}
          </div>
        </div>
        <span class="list__chev">${raw(ICON.chevron)}</span>
      </a>
    </li>
  `);
}

/** Nome do modelo, em sheet: e um campo so, nao merece uma tela. Criando, cai
 *  direto na tela de montar — quem acabou de dar o nome quer por exercicio. */
function nameSheet(template = null) {
  const body = node(html`
    <div class="stack">
      <label class="field">
        <span class="field__label">${t('templates.name')}</span>
        <input class="input" data-name value="${template ? template.name : ''}"
               placeholder="${t('templates.namePlaceholder')}" autocapitalize="sentences">
      </label>
      <button class="btn btn--primary btn--block" data-save>${t('common.save')}</button>
    </div>
  `);
  openSheet(template ? t('templates.rename') : t('templates.new'), body);

  const input = body.querySelector('[data-name]');
  body.querySelector('[data-save]').onclick = async () => {
    const name = input.value.trim();
    if (!name) { toast(t('templates.giveItAName')); input.focus(); return; }

    if (template) {
      await db.updateTemplate(template.id, { name });
      closeSheet();
      refresh();
      return;
    }
    const created = await db.addTemplate(name);
    closeSheet();
    location.hash = `#/modelos/${created.id}`;
  };
  input.focus();
}

/* ==========================================================================
   Detalhe / montagem
   ========================================================================== */

export async function renderDetail(view, id) {
  const [template, exercises] = await Promise.all([db.getTemplate(id), db.listExercises()]);

  if (!template) {
    setTop({ title: t('templates.listTitle'), back: '#/modelos' });
    view.append(node(`<div class="card card__pad">${t('templates.notFound')}</div>`));
    return;
  }

  const byId = new Map(exercises.map((e) => [e.id, e]));
  const order = existingInOrder(template.exerciseIds, byId.keys());

  setTop({
    title: template.name,
    back: '#/modelos',
    actions: `<button class="icon-btn" data-rename aria-label="${t('templates.rename')}">${ICON.pencil}</button>`,
  });
  document.querySelector('[data-rename]').onclick = () => nameSheet(template);

  const root = node(html`
    <div class="stack">
      <button class="btn btn--primary btn--block btn--lg" data-start ${raw(order.length ? '' : 'disabled')}>
        ${t('templates.start')}
      </button>
      <div data-list></div>
      <button class="btn btn--block" data-add>${raw(ICON.plus)} ${t('templates.addExercise')}</button>
      <button class="btn btn--block btn--danger" data-delete>${raw(ICON.trash)} ${t('templates.delete')}</button>
    </div>
  `);

  const list = root.querySelector('[data-list]');
  if (!order.length) {
    list.append(node(html`
      <div class="card"><div class="empty">
        ${raw(ICON.dumbbell)}
        <p>${t('templates.emptyDetail')}</p>
      </div></div>
    `));
  } else {
    list.append(listInCard(order.map((exId, i) => exerciseRow(template, order, i, byId.get(exId)))));
  }

  root.querySelector('[data-add]').onclick = () => { location.hash = `#/modelos/${template.id}/adicionar`; };
  root.querySelector('[data-start]').onclick = () => start(template);
  root.querySelector('[data-delete]').onclick = () => remove(template);

  view.append(root);
  preloadCustomThumbs().catch(() => {});
}

function exerciseRow(template, order, i, exercise) {
  const li = node(html`
    <li class="list__item">
      <div class="list__link">
        ${raw(thumbHtml(exercise))}
        <div class="grow">
          <div style="font-weight:600">${exercise.name}</div>
          <div class="muted small">${groupLabel(exercise.muscleGroup)}</div>
        </div>
        <button class="icon-btn" data-up aria-label="${t('templates.moveUp')}"
                ${raw(i === 0 ? 'disabled' : '')}>${raw(ICON.up)}</button>
        <button class="icon-btn" data-down aria-label="${t('templates.moveDown')}"
                ${raw(i === order.length - 1 ? 'disabled' : '')}>${raw(ICON.down)}</button>
        <button class="icon-btn" data-remove
                aria-label="${t('templates.removeExercise', { name: exercise.name })}">${raw(ICON.trash)}</button>
      </div>
    </li>
  `);

  const save = async (next) => {
    await db.updateTemplate(template.id, { exerciseIds: next });
    refresh();
  };
  li.querySelector('[data-up]').onclick = () => save(moveInOrder(order, i, -1));
  li.querySelector('[data-down]').onclick = () => save(moveInOrder(order, i, 1));
  // Sem confirmacao: nao apaga historico nenhum, e o exercicio volta em dois
  // toques pelo seletor.
  li.querySelector('[data-remove]').onclick = async () => {
    await db.removeExerciseFromTemplate(template.id, exercise.id);
    refresh();
  };
  return li;
}

async function start(template) {
  // Comecar outro treino com um ja em aberto deixaria dois sem finalizar, e
  // getActiveWorkout() so devolve o mais recente — o antigo sumiria da sessao.
  const active = await db.getActiveWorkout();
  if (active) {
    const ok = await confirmSheet({
      title: t('templates.confirmStart.title'),
      message: t('templates.confirmStart.message'),
      confirmLabel: t('templates.confirmStart.label'),
    });
    if (!ok) return;
  }
  await db.startWorkoutFromTemplate(template.id);
  location.hash = '#/sessao';
}

async function remove(template) {
  const ok = await confirmSheet({
    title: t('templates.confirmDelete.title', { name: template.name }),
    message: t('templates.confirmDelete.message'),
    confirmLabel: t('common.delete'),
    danger: true,
  });
  if (!ok) return;
  await db.deleteTemplate(template.id);
  toast(t('templates.toastDeleted'));
  location.hash = '#/modelos';
}
