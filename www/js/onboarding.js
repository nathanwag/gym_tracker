/* Regras do primeiro acesso.
 *
 * Quem decide se as boas-vindas aparecem e o router (app.js), mas a REGRA mora
 * aqui: ela precisa valer igual pro guard da rota, pro boot e pra restauracao
 * de um backup. Ja morou copiada em duas grafias diferentes nesses dois
 * ultimos, que e o que este modulo existe pra impedir. */

import * as db from './db.js';

/** Se a pessoa ainda nao passou pelas boas-vindas. Leitura sincrona: o guard
 *  do router roda antes de qualquer await. */
export function needsOnboarding(settings) {
  return !settings?.onboardedAt;
}

/**
 * Carimba quem ja usava o app mas nao tem o carimbo.
 *
 * A migracao v9 cobre quem atualizou o app, e o wizard cobre quem passou por
 * ele. Sobra quem chega com dado por outro caminho — o backup gerado ANTES da
 * v9, que nao tem a chave e cujo replaceAll troca o store de settings inteiro.
 * Sem esta rede, quem troca de celular e importa oito meses de treino cai no
 * wizard.
 *
 * So le o banco quando o carimbo falta, entao nao custa nada nas aberturas
 * seguintes. `store` e o banco, e entra por parametro so pra o teste — em
 * producao e sempre o db.js.
 */
export async function ensureOnboarded({ store = db } = {}) {
  if (!needsOnboarding(store.settings())) return;

  const [exercises, workouts] = await Promise.all([
    store.listExercises(), store.listWorkouts(),
  ]);
  if (!exercises.length && !workouts.length) return;

  await store.setSetting('onboardedAt', new Date().toISOString());
}

// O nome e desenhado numa linha so ao lado do avatar, no Perfil. O input do
// wizard leva maxlength, mas o corte mora aqui tambem: um backup editado a mao
// ou um "colar" no campo passam por fora do maxlength.
export const MAX_NAME = 40;

/** Sanea o nome digitado no wizard antes de virar setting. */
export function cleanName(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
}
