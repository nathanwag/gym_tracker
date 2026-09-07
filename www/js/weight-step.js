/* O passo dos botoes +/- de peso. Puro, sem dependencia de DOM nem de banco:
 * a tela Voce parseia o que foi digitado e as telas que registram serie
 * saneiam o que estava gravado (um backup pode trazer qualquer coisa). */

export const DEFAULT_STEP = 2.5;

// Um passo abaixo de 0,1 nao existe em anilha nenhuma e faria o botao parecer
// travado; acima de 50 um toque a mais ja passa do maior peso registravel.
export const MIN_STEP = 0.1;
export const MAX_STEP = 50;

/** Um passo valido a partir do que foi digitado ou gravado, ou null. Aceita
 *  virgula (e o que o teclado do celular oferece em pt) e arredonda em duas
 *  casas — passo e anilha, nao conversao de unidade. */
export function parseWeightStep(value) {
  const n = Number(String(value).replace(',', '.').trim());
  if (!Number.isFinite(n) || n < MIN_STEP || n > MAX_STEP) return null;
  return Math.round(n * 100) / 100;
}

/** O passo a usar de fato numa tela de registro: o que esta gravado, ou o
 *  padrao quando ele nao serve (backup antigo, valor zerado a mao). */
export const weightStep = (stored) => parseWeightStep(stored) ?? DEFAULT_STEP;
