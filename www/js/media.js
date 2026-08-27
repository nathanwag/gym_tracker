/* Figuras dos exercicios.
 *
 * Cada exercicio do catalogo tem duas fotos — posicao inicial e final — e e a
 * alternancia entre elas que mostra o movimento. Nao existe fonte gratuita de
 * video que possa ser embutida no app, e duas fotos em loop resolvem o problema
 * real (conferir a execucao) sem nenhuma requisicao externa.
 *
 * Peso: a miniatura tem ~2,4 KB e vem embutida para os 873; as fotos grandes
 * tem ~12 KB e sao baixadas na primeira vez que o exercicio e aberto, ficando
 * no cache permanente do service worker (ver MEDIA_CACHE em sw.js).
 */

import * as db from './db.js';
import { ICON_GROUPS, html, raw } from './ui.js';
import { t } from './i18n.js';

// Precisa bater com MEDIA_CACHE em sw.js — o service worker e classico
// (sem `type: 'module'`) e nao pode importar daqui, entao a constante existe
// duplicada nos dois lugares de proposito. So um cache de fotos (nao dado do
// usuario), entao o valor pode mudar livremente sem migracao.
export const MEDIA_CACHE = 'workout-media';

// Caminho relativo ao documento, nao a rota: o `#/catalogo/x` da URL nao
// participa da resolucao, entao isto funciona igual no GitHub Pages
// (/usuario/repo/) e na origem local do WebView nativo.
export const thumbUrl = (slug) => `./img/ex/thumb/${slug}.webp`;
export const fullUrl = (slug, i) => `./img/ex/full/${slug}-${i}.webp`;

// Mapa exerciseId -> URL de objeto da foto personalizada (posicao inicial, so
// slot 0 — e o que aparece em miniatura). Mesmo espirito do exerciseCache de
// db.js: carrega uma vez, reusa, e e derrubado por qualquer escrita.
let customThumbCache = null;

/** Carrega (uma vez) as fotos personalizadas de posicao inicial de todos os
 *  exercicios, para thumbHtml poder usa-las de forma sincrona. Quem monta
 *  lista em lote (renderList, exercise-picker) chama isto antes, do mesmo
 *  jeito que ja da `await db.listExercises()`. */
export async function preloadCustomThumbs() {
  if (customThumbCache) return;
  const rows = await db.listAllExerciseImages();
  customThumbCache = new Map(
    rows.filter((r) => r.slot === 0).map((r) => [r.exerciseId, URL.createObjectURL(r.blob)]),
  );
}

/** Chamado depois de salvar/remover uma foto personalizada: as URLs de
 *  objeto guardadas ficariam apontando para um Blob que pode nao bater mais
 *  com o que esta no banco. */
export function invalidateCustomThumbs() {
  if (!customThumbCache) return;
  for (const url of customThumbCache.values()) URL.revokeObjectURL(url);
  customThumbCache = null;
}

/** Miniatura de um exercicio, com o icone do grupo por tras.
 *
 *  O icone nao e alternativa, e camada de fundo: aparece enquanto a foto
 *  carrega e continua la se ela falhar — o `onerror` so precisa esconder a
 *  imagem. Isso cobre o caso real de estar sem sinal num exercicio cuja foto
 *  ainda nao foi baixada, sem o icone de imagem quebrada do navegador.
 *
 *  Devolve string (e nao elemento) porque as listas montam tudo de uma vez com
 *  raw(items.join('')) — criar 80 elementos soltos seria visivelmente mais lento.
 *
 *  O `alt` fica vazio de proposito: o nome do exercicio esta escrito ao lado e
 *  um leitor de tela nao deve ouvi-lo duas vezes. */
export function thumbHtml(ex, { className = '' } = {}) {
  // ex.muscleGroup: exercicio da biblioteca (schema do banco). ex.grupo:
  // item cru do catalogo (fora de escopo, nome de campo continua em pt).
  const group = ex.muscleGroup || ex.grupo || 'Outros';
  const icon = ICON_GROUPS[group] || ICON_GROUPS['Outros'];
  // Foto personalizada tem prioridade sobre a do catalogo. Se o cache ainda
  // nao foi carregado (customThumbCache null), cai no comportamento de
  // sempre — quem quer a foto personalizada aqui precisa ter chamado
  // preloadCustomThumbs() antes.
  const customUrl = customThumbCache?.get(ex.id);
  const src = customUrl || (ex.slug ? thumbUrl(ex.slug) : null);
  const photo = src
    ? html`<img class="thumb__img" src="${src}" alt="" loading="lazy"
                decoding="async" onerror="this.hidden=true">`
    : '';

  return html`<span class="thumb ${className}">${raw(icon)}${raw(photo)}</span>`;
}

/** Aquece o cache das duas fotos grandes.
 *
 *  Usa Image em vez de fetch de proposito: um fetch cujo corpo nunca e lido
 *  deixa o stream pendente. A Image carrega ate o fim, passa pelo service
 *  worker (que grava no cache de midia) e ainda aquece o cache do navegador. */
export function prefetchPhotos(slug) {
  if (!slug) return;
  for (const i of [0, 1]) new Image().src = fullUrl(slug, i);
}

/** Pede ao service worker que baixe as miniaturas do catalogo.
 *
 *  Roda so uma vez por versao do catalogo, e so quando a conexao permite: sao
 *  ~2 MB, o que e barato no wi-fi e caro no celular. Quem quiser forcar tem o
 *  botao em Ajustes. */
export async function precacheMedia({ force = false } = {}) {
  const reg = await navigator.serviceWorker?.ready?.catch(() => null);
  if (!reg?.active) return false;

  const connection = navigator.connection;
  if (!force && (connection?.saveData || connection?.type === 'cellular')) return false;

  let manifest;
  try {
    manifest = await (await fetch('./img/ex/manifest.json')).json();
  } catch {
    return false;
  }

  // manifest.versao: campo do manifesto gerado pelo pipeline do catalogo,
  // fora de escopo desta padronizacao — continua com o nome original.
  if (!force && db.settings().mediaPrecacheVersion === manifest.versao) return false;

  reg.active.postMessage({
    type: 'precache-media',
    urls: manifest.slugs.map((slug) => `./img/ex/thumb/${slug}.webp`),
  });
  await db.setSetting('mediaPrecacheVersion', manifest.versao);
  return true;
}

/** Le um arquivo escolhido pelo usuario e devolve um Blob comprimido, pronto
 *  para guardar como foto personalizada de um exercicio.
 *
 *  Fotos de catalogo (geradas offline, curadas) chegam com ~12 KB; uma foto
 *  de celular sem tratamento nenhum passaria de 1-2 MB facil, o que pesa
 *  demais pro IndexedDB e pro backup em JSON (fotos viajam em base64 la —
 *  ver blobToDataUrl em backup.js). Reduz pro mesmo tamanho maximo das fotos
 *  do catalogo e reusa o padrao canvas.toBlob ja usado em share-image.js. */
export async function compressImage(file, { maxDim = 1080, quality = 0.82 } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

/** Alterna as duas fotos em loop, mostrando o movimento.
 *
 *  A alternancia e CSS puro (ver .flip em styles.css). Sem setInterval: o
 *  navegador ja pausa animacao fora da tela e nao ha timer para vazar quando a
 *  view troca. Aqui so ficam a espera da decodificacao e o botao de pausa —
 *  comecar antes das duas imagens prontas faz o primeiro ciclo piscar em branco.
 *
 *  Recebe as duas URLs de frame ja resolvidas (nao um slug): quem chama decide
 *  se elas vem do catalogo (fullUrl) ou de uma foto personalizada
 *  (URL.createObjectURL) — ver exercise.js:renderDetail. */
export function createAnimation({ frameA, frameB, name = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'flip';
  el.innerHTML = html`
    <img class="flip__frame" src="${frameA}" alt="${name ? t('media.startPosition', { name }) : ''}">
    <img class="flip__frame flip__frame--b" src="${frameB}" alt="" aria-hidden="true">
    <button class="flip__toggle" type="button" aria-label="${t('media.pauseAnimation')}" hidden></button>
  `;

  const images = [...el.querySelectorAll('img')];
  const button = el.querySelector('.flip__toggle');

  // Quem pediu menos movimento no sistema recebe a foto parada na posicao
  // inicial, e o botao passa a ligar a animacao em vez de pausar (a classe
  // is-forced vence a regra de prefers-reduced-motion no CSS).
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // `is-paused` e o estado visual "parado" nos dois modos — e o que troca o
  // icone do botao para o triangulo. `is-forced` so existe sob menos
  // movimento, onde precisa vencer a regra que desliga toda animacao.
  let paused = reducedMotion;

  const updateLabel = () => {
    el.classList.toggle('is-paused', paused);
    el.classList.toggle('is-forced', reducedMotion && !paused);
    button.setAttribute('aria-label', paused ? t('media.seeMovement') : t('media.pauseAnimation'));
  };

  Promise.all(images.map((img) => img.decode().catch(() => null))).then(() => {
    if (!el.isConnected) return;
    el.classList.add('is-ready');
    button.hidden = false;
  });

  button.onclick = () => {
    paused = !paused;
    updateLabel();
  };

  updateLabel();
  return el;
}
