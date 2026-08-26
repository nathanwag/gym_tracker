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
export function language() {
  return db.settings().language || 'pt';
}

/** Locale pros formatadores Intl de ui.js — conceito distinto de language():
 *  aqui vira uma string completa de locale, nao so o codigo de 2 letras. */
export function locale() {
  return language() === 'en' ? 'en-US' : 'pt-BR';
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

/** Busca `key` no dicionario do idioma ativo, com interpolacao `{var}` simples.
 *  Chave ausente: devolve `[[key]]` em vez de quebrar a tela — rede de
 *  seguranca pra conversao arquivo a arquivo (ver README/plano de i18n). */
export function t(key, vars) {
  const text = DICT[language()]?.[key];
  if (text == null) {
    console.warn(`i18n: chave ausente "${key}" (${language()})`);
    return `[[${key}]]`;
  }
  return interpolate(text, vars);
}

/** Pluralizacao simples one/other — PT e EN sao as duas CLDR "one/other", sem
 *  necessidade de Intl.PluralRules pra so dois idiomas. A entrada no
 *  dicionario e um objeto {one, other}, cada lado podendo usar {n}. */
export function tn(key, n, vars) {
  const entry = DICT[language()]?.[key];
  if (entry == null) {
    console.warn(`i18n: chave plural ausente "${key}" (${language()})`);
    return `[[${key}]]`;
  }
  const form = Number(n) === 1 ? entry.one : entry.other;
  return interpolate(form, { n, ...vars });
}

// Checagem de desenvolvimento: os dois idiomas devem ter o mesmo conjunto de
// chaves. Roda so uma vez, no carregamento do modulo.
if (location.hostname === 'localhost') {
  const ptKeys = new Set(Object.keys(DICT.pt || {}));
  const enKeys = new Set(Object.keys(DICT.en || {}));
  const missingInEn = [...ptKeys].filter((k) => !enKeys.has(k));
  const missingInPt = [...enKeys].filter((k) => !ptKeys.has(k));
  if (missingInEn.length) console.warn('i18n: chaves faltando em en:', missingInEn);
  if (missingInPt.length) console.warn('i18n: chaves faltando em pt:', missingInPt);
}
