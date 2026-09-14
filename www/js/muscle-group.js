/* Grupo muscular — a leitura.
 *
 * O conceito morava em cinco arquivos: os algoritmos puros em groups.js, o
 * rotulo e a duracao em seed.js, a cor e o icone em ui.js, o pictograma em
 * group-icon.js e o dado em db.js. Resultado: "resolver o valor gravado para o
 * registro do grupo" existia em cinco grafias, e duas delas ja tinham
 * divergido em silencio.
 *
 * POR QUE AQUI, E NAO EM groups.js. db.js importa groups.js (CANONICAL_GROUPS,
 * groupSlugFor) para semear a migracao v7. Se groups.js passasse a ler
 * db.groups(), viraria ciclo — o mesmo que ja existe entre db.js e seed.js.
 * Entao groups.js continua puro e sem saber do banco, e este modulo fica por
 * cima dos dois: le o dado, aplica os algoritmos, e e a unica porta que as
 * telas usam.
 *
 * A verdade em runtime e db.groups(), nao CANONICAL_GROUPS — esta e so a
 * semente da migracao. Leitura sincrona pelo mesmo motivo de db.settings():
 * toda tela pinta alguma coisa com cor de grupo e nao pode esperar o banco a
 * cada render.
 */

import * as db from './db.js';
import {
  groupSlugFor, inkOn, groupInitials, uniqueInitials, GROUP_LABELS_EN,
} from './groups.js';
import { POSES, plateIcon } from './group-icon.js';
import { language } from './i18n.js';

/** Valor gravado -> registro do grupo. Aceita slug ('peito') ou o nome em
 *  portugues que o catalogo grava ('Peito'): `catalogo.json` e dado commitado
 *  que nao migra junto com o banco, entao as duas chaves circulam pelo app
 *  para sempre. Normalizar aqui e o que tira essa decisao de quem chama. */
export function findGroup(ref) {
  if (!ref) return null;
  const slug = groupSlugFor(ref);
  return db.groups().find((g) => g.slug === slug) || null;
}

/** Nome do grupo pra exibir, no idioma ativo. A chave canonica continua sendo
 *  o slug, usada pra gravar e comparar — so o texto mostrado muda. Em
 *  `<select>`, o `value` do `<option>` continua o slug. */
export function groupLabel(ref) {
  const group = findGroup(ref);
  if (!group) return ref;
  return language() === 'en' ? (GROUP_LABELS_EN[group.slug] || group.name) : group.name;
}

/** true quando a serie do grupo e gravada como duracao, nao peso x reps.
 *  Era um conjunto fechado no codigo; virou campo do grupo pra que um grupo
 *  criado pelo usuario tambem possa se declarar assim. */
export const usesDuration = (ref) => Boolean(findGroup(ref)?.usesDuration);

/** Campo que o indice do Progresso compara, por grupo. Cardio e alongamento
 *  nao tem carga: o analogo do volume e o tempo total. */
export const groupMetric = (ref) => (usesDuration(ref) ? 'totalDuration' : 'volume');

/** O mesmo, por exercicio — aqui o analogo do tempo e o e1RM, nao o volume.
 *  Mora junto de `groupMetric` de proposito: as duas linhas aparecem uma
 *  embaixo da outra na mesma tela, e duas nocoes de "andou pra frente" ali se
 *  contradiriam. */
export const exerciseMetric = (exercise) => (usesDuration(exercise?.muscleGroup) ? 'totalDuration' : 'bestE1rm');

/** Slugs na ordem anatomica, pra alimentar `groupBy`. A ordem e dado desde a
 *  v7 — reordenar um grupo muda isto, e e por isso que `groupBy` recebe a
 *  lista em vez de guardar uma propria. */
export const groupOrder = () => db.groups().map((g) => g.slug);

/** Cor da anilha do grupo. Devolve `var(--m-<slug>)` em vez do hex: assim a
 *  mesma chamada serve nos dois temas, sem a view saber qual esta ativo, e
 *  trocar de tema continua sendo cascata do CSS, nao JS. Quem escreve o token
 *  e `groupTokensCss` — antes dele o token nao existe. */
export const groupColor = (ref) => `var(--m-${groupSlugFor(ref)})`;

/** Sigla da anilha de um grupo sem pictograma, desempatada contra a dos
 *  outros que tambem nao tem. O desempate acumulando mora em
 *  `uniqueInitials` (groups.js), onde tem teste — aqui fica so quem sao os
 *  grupos sem pose e em que ordem. */
function groupSigla(slug) {
  const semPose = db.groups().filter((g) => !POSES[g.slug]);
  const siglas = uniqueInitials(semPose.map((g) => groupLabel(g.slug)));
  const i = semPose.findIndex((g) => g.slug === slug);
  // Slug que nao esta no banco (dado antigo, backup de outro aparelho)
  // ainda precisa de sigla, e ela nao pode bater com as que ja existem.
  return i >= 0 ? siglas[i] : groupInitials(groupLabel(slug), siglas);
}

/** Icone do grupo: a anilha com o pictograma do gesto. Grupo criado pelo
 *  usuario nao tem gesto e cai na anilha com a sigla. */
export function groupIcon(ref) {
  const slug = groupSlugFor(ref);
  return plateIcon({
    slug,
    color: groupColor(slug),
    ink: `var(--ink-${slug})`,
    initials: POSES[slug] ? null : groupSigla(slug),
  });
}

/** O `<style>` que faz a cor do grupo ser dado em vez de constante do CSS.
 *
 *  Repete a MESMA cascata de tres blocos do styles.css — claro; escuro por
 *  preferencia do sistema quando o tema nao esta travado em claro; escuro
 *  explicito — para que `groupColor()` continue devolvendo var() e trocar de
 *  tema siga sendo cascata. Os `--m-*` do styles.css viraram so o valor
 *  inicial; este texto entra depois e vence por ordem, com a mesma
 *  especificidade.
 *
 *  Puro de proposito: quem injeta no `<head>` e app.js. A cascata e a parte
 *  que quebra em silencio, e agora ela tem teste. */
export function groupTokensCss(groups) {
  const vars = (key) => groups
    .map((g) => `--m-${g.slug}:${g[key]};--ink-${g.slug}:${inkOn(g[key])}`)
    .join(';');
  const dark = vars('colorDark');
  return `:root{${vars('colorLight')}}`
    + `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${dark}}}`
    + `:root[data-theme="dark"]{${dark}}`;
}

/** Os grupos na ordem, ja resolvidos. Existe pra que quem so monta tela nao
 *  precise importar db.js — a lista e dado, mas a porta e esta. */
export const allGroups = () => db.groups();

/** Recarrega os grupos do banco e regrava os tokens no `<head>`.
 *
 *  CHAME DEPOIS DE TODA ESCRITA EM GRUPO. `groupColor()` devolve
 *  `var(--m-<slug>)`, e o token so existe depois disto: sem a chamada, um
 *  grupo recem-criado nasce sem cor, e um backup restaurado perde os grupos do
 *  usuario — os dois sem erro nenhum.
 *
 *  Mora aqui, e nao em app.js, porque quem escreve grupo e backup.js e a tela
 *  de grupos; app.js importa as views, entao poe-lo como dono faria ciclo. O
 *  toque no DOM sao as quatro linhas abaixo — a cascata, que e a parte que
 *  quebra em silencio, e `groupTokensCss` e tem teste. */
export async function repaintGroups() {
  const groups = await db.listGroups();
  let tag = document.getElementById('group-tokens');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'group-tokens';
    document.head.append(tag);
  }
  tag.textContent = groupTokensCss(groups);
}
