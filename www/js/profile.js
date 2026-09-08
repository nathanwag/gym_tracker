/* Perfil: derivacoes do que a pessoa gravou sobre ela mesma. Puro, sem
 * dependencia de DOM nem de banco — mesmo motivo de models.js e text.js. */

/** Iniciais pro avatar de quem ainda nao escolheu foto. */
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** "2026-09-07" e lido pelo `new Date()` como meia-noite UTC, o que volta um
 *  dia em qualquer fuso negativo — a pesagem de hoje virava "ha 1 dia". Data
 *  com hora nao tem esse problema e passa direto. */
function parseLocal(iso) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!dateOnly) return new Date(iso);
  return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
}

/** Dias inteiros desde `iso`, contados por DIA DE CALENDARIO e nao por 24h:
 *  quem pesou ontem as 23h nao pesou "ha 0 dias". `null` = nunca aconteceu. */
export function daysSince(iso, now = new Date()) {
  if (!iso) return null;
  const then = parseLocal(iso);
  if (Number.isNaN(then.getTime())) return null;
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(new Date(now)) - day(then)) / 86400000);
}

/** Medicoes de peso da mais recente pra mais antiga, cada uma com a variacao
 *  desde a ANTERIOR no tempo. `delta` null na primeira medicao de todas, que
 *  nao tem com o que comparar — a tela mostra o espaco vazio em vez de zero,
 *  que leria como "nao mudou". */
export function weightLog(rows) {
  const asc = [...(rows || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const withDelta = asc.map((row, i) => ({
    ...row,
    delta: i === 0 ? null : round2(row.weight - asc[i - 1].weight),
  }));
  return withDelta.reverse();
}

// Peso vem com uma casa decimal; a subtracao em ponto flutuante inventa as
// outras (78.4 - 79.2 = -0.7999999999999972).
const round2 = (n) => Math.round(n * 100) / 100;

// Uma pessoa nao pesa 3 kg nem 900: o campo aceita virgula (e o que o teclado
// do celular oferece em pt) e recusa o que so pode ser erro de digitacao.
const MIN_BODY_WEIGHT = 20;
const MAX_BODY_WEIGHT = 400;

/** Peso valido a partir do que foi digitado, arredondado numa casa, ou null. */
export function parseBodyWeight(text) {
  const n = Number(String(text).replace(',', '.').trim());
  if (!Number.isFinite(n) || n < MIN_BODY_WEIGHT || n > MAX_BODY_WEIGHT) return null;
  return Math.round(n * 10) / 10;
}

/** A data de hoje como YYYY-MM-DD, no fuso de quem esta usando o app.
 *  `toISOString().slice(0, 10)` daria o dia UTC: quem pesa as 22h no Brasil
 *  veria a medicao cair no dia seguinte. */
export function todayISO(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
