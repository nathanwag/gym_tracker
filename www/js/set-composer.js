/* Compositor de serie: o formulario de peso/reps (ou lados, ou duracao) com os
 * steppers de +/-. Extraido de views/session.js para ser reaproveitado tambem
 * pelo modo de edicao do historico (views/history.js).
 *
 * As chaves de i18n `session.*` (peso, reps, aquecimento...) sao compartilhadas
 * pelos dois editores de proposito: e o mesmo formulario, com os mesmos rotulos.
 */

import { usesDuration } from './seed.js';
import { t } from './i18n.js';
import {
  html, raw, node, ICON, createStepper, createDurationStepper,
} from './ui.js';

function defaultBase(timeBased, unilateral) {
  if (timeBased) return { durationSec: 60, warmup: false };
  if (unilateral) return { weight: 20, repsLeft: 10, repsRight: 10, warmup: false };
  return { weight: 20, reps: 10, warmup: false };
}

/** true quando os valores digitados nao formam uma serie registravel. */
export function isEmptySet(values) {
  if ('durationSec' in values) return values.durationSec <= 0;
  if ('repsLeft' in values) return values.repsLeft <= 0 && values.repsRight <= 0;
  return values.reps <= 0;
}

/**
 * @param {{
 *   exercise: {muscleGroup: string, unilateral?: boolean},
 *   unit: string, weightStep: number, repsStep: number,
 *   editing?: object|null,  // serie sendo editada; ausente/null = modo "adicionar"
 *   base?: object|null,     // serie-modelo pra pre-preencher; null = default por tipo
 *   onAdd?: (values: object, warmup: boolean) => void,
 *   onSave?: (values: object) => void,
 *   onDelete?: () => void,
 *   onCancel?: () => void,  // no modo "adicionar", so mostra o botao Cancelar se passado
 * }} opts
 * @returns {HTMLElement} a `<div class="composer">`
 */
export function createSetComposer({
  exercise, unit, weightStep, repsStep, editing = null, base = null,
  onAdd, onSave, onDelete, onCancel,
}) {
  const timeBased = usesDuration(exercise?.muscleGroup);
  const unilateral = !timeBased && Boolean(exercise?.unilateral);
  const fill = base || defaultBase(timeBased, unilateral);

  const wrap = node('<div class="composer"></div>');

  let weight = null;
  let reps = null;
  let repsLeft = null;
  let repsRight = null;
  let duration = null;

  if (timeBased) {
    duration = createDurationStepper({ value: fill.durationSec || 0 });
    wrap.append(duration.el);
  } else {
    weight = createStepper({
      label: t('session.weight'), suffix: unit, value: fill.weight,
      step: weightStep, min: 0, max: 1000, decimals: 1,
    });
    if (unilateral) {
      weight.el.classList.add('composer__full');
      repsRight = createStepper({
        label: t('session.repsRight'), value: fill.repsRight,
        step: repsStep, min: 0, max: 300, decimals: 0,
      });
      repsLeft = createStepper({
        label: t('session.repsLeft'), value: fill.repsLeft,
        step: repsStep, min: 0, max: 300, decimals: 0,
      });
      wrap.append(weight.el, repsRight.el, repsLeft.el);
    } else {
      reps = createStepper({
        label: t('session.reps'), value: fill.reps,
        step: repsStep, min: 0, max: 300, decimals: 0,
      });
      wrap.append(weight.el, reps.el);
    }
  }

  const values = () => {
    if (timeBased) return { durationSec: duration.get() };
    if (unilateral) return { weight: weight.get(), repsLeft: repsLeft.get(), repsRight: repsRight.get() };
    return { weight: weight.get(), reps: reps.get() };
  };

  let warmup = Boolean(fill.warmup);
  const actions = node('<div class="composer__actions"></div>');

  if (editing) {
    const deleteBtn = node(html`<button class="btn btn--sm btn--chip btn--danger" data-delete aria-label="${t('session.deleteSet')}">${raw(ICON.trash)}</button>`);
    const cancelBtn = node(html`<button class="btn btn--ghost" data-cancel>${t('common.cancel')}</button>`);
    const saveBtn = node(html`<button class="btn btn--primary" data-save>${t('common.save')}</button>`);

    cancelBtn.onclick = () => onCancel?.();
    saveBtn.onclick = () => onSave?.(values());
    deleteBtn.onclick = () => onDelete?.();

    actions.append(deleteBtn, cancelBtn, saveBtn);
  } else {
    const chip = node(html`
      <button class="btn btn--sm btn--chip btn--ghost" data-warmup aria-pressed="${warmup}">${t('session.warmupAbbrev')}</button>
    `);
    const addBtn = node(html`<button class="btn btn--primary" data-add>${t('session.addSet')}</button>`);

    chip.onclick = () => {
      warmup = !warmup;
      chip.setAttribute('aria-pressed', String(warmup));
      chip.classList.toggle('btn--ghost', !warmup);
    };
    addBtn.onclick = () => onAdd?.(values(), warmup);

    actions.append(chip);
    if (onCancel) {
      const cancelBtn = node(html`<button class="btn btn--ghost" data-cancel>${t('common.cancel')}</button>`);
      cancelBtn.onclick = () => onCancel();
      actions.append(cancelBtn);
    }
    actions.append(addBtn);
  }

  wrap.append(actions);
  return wrap;
}
