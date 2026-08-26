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
  const photo = ex.slug
    ? html`<img class="thumb__img" src="${thumbUrl(ex.slug)}" alt="" loading="lazy"
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

/** Alterna as duas fotos em loop, mostrando o movimento.
 *
 *  A alternancia e CSS puro (ver .flip em styles.css). Sem setInterval: o
 *  navegador ja pausa animacao fora da tela e nao ha timer para vazar quando a
 *  view troca. Aqui so ficam a espera da decodificacao e o botao de pausa —
 *  comecar antes das duas imagens prontas faz o primeiro ciclo piscar em branco. */
export function createAnimation(slug, { name = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'flip';
  el.innerHTML = html`
    <img class="flip__frame" src="${fullUrl(slug, 0)}" alt="${name ? t('media.startPosition', { name }) : ''}">
    <img class="flip__frame flip__frame--b" src="${fullUrl(slug, 1)}" alt="" aria-hidden="true">
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
