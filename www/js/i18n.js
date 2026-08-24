/* Traducao da interface (PT/EN), sem nenhuma dependencia de DOM.
 *
 * Mecanismo separado dos dados em i18n-strings.js de proposito: o dicionario
 * muda a cada tela convertida, a logica daqui nao. Mesmo racional de text.js
 * ficar fora de ui.js.
 */

import * as db from './db.js';
import { DICT } from './i18n-strings.js';

/** Leitura sincrona do idioma ativo — mesmo padrao de db.settings(), que as
 *  telas ja chamam sem esperar o banco a cada render. */
export function idioma() {
  return db.settings().idioma || 'pt';
}

/** Locale pros formatadores Intl de ui.js. */
export function locale() {
  return idioma() === 'en' ? 'en-US' : 'pt-BR';
}

function interpolar(texto, vars) {
  if (!vars) return texto;
  return texto.replace(/\{(\w+)\}/g, (m, chave) => (chave in vars ? String(vars[chave]) : m));
}

/** Busca `key` no dicionario do idioma ativo, com interpolacao `{var}` simples.
 *  Chave ausente: devolve `[[key]]` em vez de quebrar a tela — rede de
 *  seguranca pra conversao arquivo a arquivo (ver README/plano de i18n). */
export function t(key, vars) {
  const texto = DICT[idioma()]?.[key];
  if (texto == null) {
    console.warn(`i18n: chave ausente "${key}" (${idioma()})`);
    return `[[${key}]]`;
  }
  return interpolar(texto, vars);
}

/** Pluralizacao simples one/other — PT e EN sao as duas CLDR "one/other", sem
 *  necessidade de Intl.PluralRules pra so dois idiomas. A entrada no
 *  dicionario e um objeto {one, other}, cada lado podendo usar {n}. */
export function tn(key, n, vars) {
  const entrada = DICT[idioma()]?.[key];
  if (entrada == null) {
    console.warn(`i18n: chave plural ausente "${key}" (${idioma()})`);
    return `[[${key}]]`;
  }
  const forma = Number(n) === 1 ? entrada.one : entrada.other;
  return interpolar(forma, { n, ...vars });
}

// Checagem de desenvolvimento: os dois idiomas devem ter o mesmo conjunto de
// chaves. Roda so uma vez, no carregamento do modulo.
if (location.hostname === 'localhost') {
  const chavesPt = new Set(Object.keys(DICT.pt || {}));
  const chavesEn = new Set(Object.keys(DICT.en || {}));
  const faltandoEmEn = [...chavesPt].filter((k) => !chavesEn.has(k));
  const faltandoEmPt = [...chavesEn].filter((k) => !chavesPt.has(k));
  if (faltandoEmEn.length) console.warn('i18n: chaves faltando em en:', faltandoEmEn);
  if (faltandoEmPt.length) console.warn('i18n: chaves faltando em pt:', faltandoEmPt);
}
