/* Grupos musculares: criar, renomear, pintar e apagar.
 *
 * Existe porque grupo deixou de ser lista no codigo (ver `groups.js` e a
 * migracao v7 em `db.js`). Mora atras da aba Exercicios: grupo e vocabulario
 * do treino, igual ao exercicio, e nao leitura de progresso.
 *
 * Manutencao rara de proposito: sem aba propria, sem numero, sem grafico. A
 * pergunta dela e "o que eu tenho pra classificar exercicio?", que nenhuma
 * outra tela responde.
 */

import * as db from '../db.js';
import { themeVariant, FALLBACK_GROUP } from '../groups.js';
import { t, tn } from '../i18n.js';
import { groupLabel } from '../seed.js';
import {
  setTop, html, raw, node, ICON, groupIcon, listInCard, applyGroupTokens,
  openSheet, closeSheet, toast, confirmSheet, refresh,
} from '../ui.js';

/** Regrava os --m-* e redesenha. Sem o primeiro passo um grupo recem-criado
 *  nasce sem cor: `groupColor()` devolve var(--m-<slug>) e o token so existe
 *  se `applyGroupTokens` tiver rodado depois da escrita — o bootstrap sozinho
 *  nao alcanca o que foi criado agora. */
async function repaint() {
  await db.listGroups();
  applyGroupTokens();
  refresh();
}

/** Qual das duas cores o seletor edita. O usuario escolhe a cor que esta
 *  vendo; a do outro tema sai de `themeVariant`. Perguntar as duas seria
 *  pedir que ele imagine o app no tema que nao esta usando. */
function activeThemeKey() {
  const theme = db.settings().theme;
  if (theme === 'dark') return 'colorDark';
  if (theme === 'light') return 'colorLight';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'colorDark' : 'colorLight';
}

export async function renderList(view) {
  setTop({ title: t('groups.title'), back: '#/exercicios' });

  const [groups, exercises] = await Promise.all([db.listGroups(), db.listExercises()]);
  const counts = new Map();
  for (const e of exercises) counts.set(e.muscleGroup, (counts.get(e.muscleGroup) || 0) + 1);

  const root = node('<div></div>');
  const rows = groups.map((group) => {
    const used = counts.get(group.slug) || 0;
    const item = node(html`
      <li class="list__item">
        <button class="list__link" type="button">
          <span class="thumb" aria-hidden="true">${raw(groupIcon(group.slug))}</span>
          <div class="grow">
            <div>${groupLabel(group.slug)}</div>
            <div class="muted small">${used ? tn('groups.usedBy', used) : t('groups.unused')}</div>
          </div>
          <span class="list__chev">${raw(ICON.chevron)}</span>
        </button>
      </li>
    `);
    item.querySelector('button').onclick = () => editSheet(group, used);
    return item;
  });
  root.append(listInCard(rows));

  const novo = node(html`
    <button class="btn btn--primary btn--block" type="button" style="margin-top:14px">
      ${raw(ICON.plus)} ${t('groups.new')}
    </button>
  `);
  novo.onclick = () => createSheet();
  root.append(novo);
  root.append(node(`<p class="muted small" style="margin:12px 0 0">${t('groups.hint')}</p>`));

  view.append(root);
}

/** Campos comuns a criar e editar. `<input type="color">` e nativo: nada de
 *  biblioteca, e o WebView do Capacitor abre o seletor do proprio sistema. */
function formFields({ name = '', color = '#c94435', usesDuration = false }) {
  return html`
    <div class="stack">
      <label class="field">
        <span class="field__label">${t('groups.form.name')}</span>
        <input class="input" data-name value="${name}" autocapitalize="sentences">
      </label>
      <label class="field">
        <span class="field__label">${t('groups.form.color')}</span>
        <input type="color" class="input input--color" data-color value="${color}">
      </label>
      <label class="field field--check">
        <input type="checkbox" data-duration ${raw(usesDuration ? 'checked' : '')}>
        <span>${t('groups.form.usesDuration')}</span>
      </label>
    </div>
  `;
}

/** As duas cores a partir da que a pessoa escolheu no tema em que esta. */
function colorsFrom(picked) {
  const key = activeThemeKey();
  return key === 'colorDark'
    ? { colorDark: picked, colorLight: themeVariant(picked, 'light') }
    : { colorLight: picked, colorDark: themeVariant(picked, 'dark') };
}

function createSheet() {
  const body = node(html`
    <div>
      ${raw(formFields({}))}
      <button class="btn btn--primary btn--block" data-save style="margin-top:14px">${t('groups.form.create')}</button>
    </div>
  `);
  openSheet(t('groups.new'), body);

  body.querySelector('[data-save]').onclick = async () => {
    const name = body.querySelector('[data-name]').value.trim();
    if (!name) { toast(t('groups.form.giveItAName')); return; }
    await db.addGroup({
      name,
      ...colorsFrom(body.querySelector('[data-color]').value),
      usesDuration: body.querySelector('[data-duration]').checked,
    });
    closeSheet();
    toast(t('groups.toastCreated'));
    await repaint();
  };
}

function editSheet(group, used) {
  const body = node(html`
    <div>
      ${raw(formFields({
    name: group.name,
    color: group[activeThemeKey()],
    usesDuration: group.usesDuration,
  }))}
      <button class="btn btn--primary btn--block" data-save style="margin-top:14px">${t('common.save')}</button>
      ${group.slug === FALLBACK_GROUP ? '' : raw(`<button class="btn btn--danger btn--block" data-delete style="margin-top:8px">${t('groups.delete')}</button>`)}
    </div>
  `);
  openSheet(groupLabel(group.slug), body);

  body.querySelector('[data-save]').onclick = async () => {
    const name = body.querySelector('[data-name]').value.trim();
    if (!name) { toast(t('groups.form.giveItAName')); return; }
    // O slug fica: renomear nao pode orfanar os exercicios que apontam pra ele.
    await db.updateGroup(group.slug, {
      name,
      ...colorsFrom(body.querySelector('[data-color]').value),
      usesDuration: body.querySelector('[data-duration]').checked,
    });
    closeSheet();
    toast(t('groups.toastSaved'));
    await repaint();
  };

  const remove = body.querySelector('[data-delete]');
  if (remove) {
    remove.onclick = async () => {
      closeSheet();
      const ok = await confirmSheet({
        title: t('groups.confirmDelete.title'),
        message: used ? tn('groups.confirmDelete.moves', used) : t('groups.confirmDelete.empty'),
        confirmLabel: t('groups.delete'),
        danger: true,
      });
      if (!ok) return;
      await db.deleteGroup(group.slug);
      toast(t('groups.toastDeleted'));
      await repaint();
    };
  }
}
