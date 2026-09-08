/* Peso corporal: a serie de pesagens, com curva e lista.
 *
 * Guarda HISTORICO, e nao so o valor de hoje: um unico numero seria apagado a
 * cada pesagem, e sem historico nao ha curva nem "quanto mudou em 8 semanas" —
 * que e a unica coisa que a pessoa quer saber ao abrir aqui.
 *
 * Uma medicao por dia (ver db.saveBodyWeight): pesar duas vezes no mesmo dia
 * corrige o dia, em vez de empilhar duas linhas com a mesma data. */

import * as db from '../db.js';
import {
  weightLog, daysSince, parseBodyWeight, todayISO,
} from '../profile.js';
import { lineChart } from '../charts.js';
import { t, tn } from '../i18n.js';
import {
  setTop, html, raw, node, toast, openSheet, closeSheet, confirmSheet,
  fmtNum, fmtDateShort, refresh,
} from '../ui.js';

export async function render(view) {
  setTop({ title: t('weight.title'), back: '#/perfil' });

  const rows = await db.listBodyWeights();
  const log = weightLog(rows);
  const unit = db.settings().unit;
  const root = node('<div class="stack"></div>');

  if (!log.length) {
    root.append(node(html`<p class="empty">${t('weight.empty')}</p>`));
  } else {
    const [latest] = log;
    const days = daysSince(latest.date);
    const oldest = log[log.length - 1];
    const change = Math.round((latest.weight - oldest.weight) * 100) / 100;

    root.append(node(html`
      <div>
        <div class="week__big">
          <span class="data">${fmtNum(latest.weight, 1)}</span>
          <span class="week__unit">${unit}</span>
        </div>
        <div class="week__sub">
          <span>${days === 0 ? t('weight.measuredToday') : t('weight.measuredAgo', { when: tn('common.daysAgo', days) })}</span>
          ${log.length > 1 ? raw(html`
            <span class="${change < 0 ? 'weight-down' : change > 0 ? 'weight-up' : ''}">
              <span class="data">${change > 0 ? '+' : ''}${fmtNum(change, 1)}</span> ${t('weight.sinceFirst', { unit })}
            </span>`) : ''}
        </div>
      </div>
    `));

    // Ordem crescente: o grafico le o tempo da esquerda pra direita, o
    // contrario da lista (mais recente em cima).
    root.append(lineChart({
      points: [...log].reverse().map((r) => ({ when: r.date, value: r.weight })),
      suffix: ` ${unit}`,
      decimals: 1,
    }));
  }

  const add = node(html`<button class="btn btn--primary btn--block">${t('weight.add')}</button>`);
  add.onclick = () => askWeight({ unit, suggested: log[0]?.weight });
  root.append(add);

  if (log.length) {
    const list = node('<div class="sec"><h2 class="section-title">' + t('weight.section') + '</h2><div data-body class="wlog"></div></div>');
    const body = list.querySelector('[data-body]');
    for (const row of log) body.append(logRow(row, unit));
    root.append(list);
  }

  view.append(root);
}

function logRow(row, unit) {
  const el = node(html`
    <button type="button" class="set-row set-row--tap">
      <span class="set-row__k">${fmtDateShort(row.date)}</span>
      <span class="set-row__v">
        ${row.delta == null ? '' : raw(html`<span class="wlog__d ${row.delta < 0 ? 'weight-down' : row.delta > 0 ? 'weight-up' : ''}">${row.delta > 0 ? '+' : ''}${fmtNum(row.delta, 1)}</span>`)}
        <span>${fmtNum(row.weight, 1)} ${unit}</span>
      </span>
    </button>
  `);
  el.onclick = () => askWeight({ unit, editing: row });
  return el;
}

/* Mesma folha pra registrar e pra corrigir: os campos sao os mesmos (data e
 * peso), so muda existir ou nao o botao de apagar. */
function askWeight({ unit, editing = null, suggested = null }) {
  const today = todayISO();
  const body = node(html`
    <div class="stack">
      <label class="field">
        <span class="field__label">${t('weight.field')} <span class="muted">${unit}</span></span>
        <input class="input" data-weight type="text" inputmode="decimal" enterkeyhint="done"
               value="${editing ? fmtNum(editing.weight, 1) : suggested ? fmtNum(suggested, 1) : ''}"
               placeholder="0,0">
      </label>
      <label class="field">
        <span class="field__label">${t('weight.date')}</span>
        <input class="input" data-date type="date" value="${editing ? editing.date : today}" max="${today}">
      </label>
      <p class="muted small" data-hint aria-live="polite" style="margin:0">${t('weight.hint')}</p>
      <button type="button" class="btn btn--primary btn--block" data-save>${t('common.save')}</button>
      ${editing ? raw(html`<button type="button" class="btn btn--block btn--danger" data-delete>${t('common.delete')}</button>`) : ''}
    </div>
  `);
  openSheet(editing ? t('weight.editTitle') : t('weight.addTitle'), body);

  const input = body.querySelector('[data-weight]');
  const hint = body.querySelector('[data-hint]');

  const save = async () => {
    const value = parseBodyWeight(input.value);
    hint.classList.toggle('hint--err', value == null);
    input.setAttribute('aria-invalid', String(value == null));
    if (value == null) {
      input.focus();
      input.select();
      return;
    }
    await db.saveBodyWeight({ date: body.querySelector('[data-date]').value || today, weight: value });
    closeSheet();
    toast(t('weight.toastSaved'));
    refresh();
  };

  body.querySelector('[data-save]').onclick = save;
  input.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    save();
  };

  body.querySelector('[data-delete]')?.addEventListener('click', async () => {
    // A confirmacao vem depois de fechar a folha atual: duas folhas empilhadas
    // usariam o mesmo #sheet e a segunda apagaria a primeira.
    closeSheet();
    const ok = await confirmSheet({
      title: t('weight.confirmDelete.title'),
      message: t('weight.confirmDelete.message'),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await db.deleteBodyWeight(editing.id);
    toast(t('weight.toastDeleted'));
    refresh();
  });

  input.focus();
  input.select();
}
