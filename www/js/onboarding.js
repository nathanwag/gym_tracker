/* Regras do primeiro acesso, sem DOM e sem banco.
 *
 * Quem decide se as boas-vindas aparecem e o router (app.js), mas a REGRA mora
 * aqui: ela precisa valer igual pro guard da rota e pra qualquer tela que
 * pergunte "essa pessoa ja passou pelo onboarding?". */

/**
 * Se a pessoa ainda nao passou pelas boas-vindas.
 *
 * `used` e a rede pro unico caso que a migracao v9 nao alcanca: um backup
 * gerado ANTES dela nao tem o carimbo, e restore() substitui o store de
 * settings inteiro — quem troca de celular e importa oito meses de treino cairia
 * no wizard. Quem chama passa se o banco ja tem exercicio ou treino.
 */
export function needsOnboarding(settings, { used = false } = {}) {
  if (settings?.onboardedAt) return false;
  return !used;
}

// O nome e desenhado numa linha so ao lado do avatar, no Perfil. O input do
// wizard leva maxlength, mas o corte mora aqui tambem: um backup editado a mao
// ou um "colar" no campo passam por fora do maxlength.
export const MAX_NAME = 40;

/** Sanea o nome digitado no wizard antes de virar setting. */
export function cleanName(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
}
