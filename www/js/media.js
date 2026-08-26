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
import { ICON_GRUPO, html, raw } from './ui.js';
import { t } from './i18n.js';

// Precisa bater com MEDIA_CACHE em sw.js — o service worker e classico
// (sem `type: 'module'`) e nao pode importar daqui, entao a constante existe
// duplicada nos dois lugares de proposito.
export const MEDIA_CACHE = 'treino-midia';

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
 *  raw(itens.join('')) — criar 80 elementos soltos seria visivelmente mais lento.
 *
 *  O `alt` fica vazio de proposito: o nome do exercicio esta escrito ao lado e
 *  um leitor de tela nao deve ouvi-lo duas vezes. */
export function thumbHtml(ex, { classe = '' } = {}) {
  const grupo = ex.grupoMuscular || ex.grupo || 'Outros';
  const icone = ICON_GRUPO[grupo] || ICON_GRUPO['Outros'];
  const foto = ex.slug
    ? html`<img class="thumb__img" src="${thumbUrl(ex.slug)}" alt="" loading="lazy"
                decoding="async" onerror="this.hidden=true">`
    : '';

  return html`<span class="thumb ${classe}">${raw(icone)}${raw(foto)}</span>`;
}

/** Aquece o cache das duas fotos grandes.
 *
 *  Usa Image em vez de fetch de proposito: um fetch cujo corpo nunca e lido
 *  deixa o stream pendente. A Image carrega ate o fim, passa pelo service
 *  worker (que grava no cache de midia) e ainda aquece o cache do navegador. */
export function prefetchFotos(slug) {
  if (!slug) return;
  for (const i of [0, 1]) new Image().src = fullUrl(slug, i);
}

/** Pede ao service worker que baixe as miniaturas do catalogo.
 *
 *  Roda so uma vez por versao do catalogo, e so quando a conexao permite: sao
 *  ~2 MB, o que e barato no wi-fi e caro no celular. Quem quiser forcar tem o
 *  botao em Ajustes. */
export async function precacheMidia({ forcar = false } = {}) {
  const reg = await navigator.serviceWorker?.ready?.catch(() => null);
  if (!reg?.active) return false;

  const conexao = navigator.connection;
  if (!forcar && (conexao?.saveData || conexao?.type === 'cellular')) return false;

  let manifesto;
  try {
    manifesto = await (await fetch('./img/ex/manifest.json')).json();
  } catch {
    return false;
  }

  if (!forcar && db.settings().midiaPrecacheVersao === manifesto.versao) return false;

  reg.active.postMessage({
    tipo: 'precache-midia',
    urls: manifesto.slugs.map((slug) => `./img/ex/thumb/${slug}.webp`),
  });
  await db.setSetting('midiaPrecacheVersao', manifesto.versao);
  return true;
}

/** Alterna as duas fotos em loop, mostrando o movimento.
 *
 *  A alternancia e CSS puro (ver .flip em styles.css). Sem setInterval: o
 *  navegador ja pausa animacao fora da tela e nao ha timer para vazar quando a
 *  view troca. Aqui so ficam a espera da decodificacao e o botao de pausa —
 *  comecar antes das duas imagens prontas faz o primeiro ciclo piscar em branco. */
export function criarAnimacao(slug, { nome = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'flip';
  el.innerHTML = html`
    <img class="flip__q" src="${fullUrl(slug, 0)}" alt="${nome ? t('media.posicaoInicial', { nome }) : ''}">
    <img class="flip__q flip__q--b" src="${fullUrl(slug, 1)}" alt="" aria-hidden="true">
    <button class="flip__toggle" type="button" aria-label="${t('media.pausarAnimacao')}" hidden></button>
  `;

  const imagens = [...el.querySelectorAll('img')];
  const botao = el.querySelector('.flip__toggle');

  // Quem pediu menos movimento no sistema recebe a foto parada na posicao
  // inicial, e o botao passa a ligar a animacao em vez de pausar (a classe
  // is-forcado vence a regra de prefers-reduced-motion no CSS).
  const menosMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // `is-pausado` e o estado visual "parado" nos dois modos — e o que troca o
  // icone do botao para o triangulo. `is-forcado` so existe sob menos
  // movimento, onde precisa vencer a regra que desliga toda animacao.
  let parado = menosMovimento;

  const rotular = () => {
    el.classList.toggle('is-pausado', parado);
    el.classList.toggle('is-forcado', menosMovimento && !parado);
    botao.setAttribute('aria-label', parado ? t('media.verMovimento') : t('media.pausarAnimacao'));
  };

  Promise.all(imagens.map((img) => img.decode().catch(() => null))).then(() => {
    if (!el.isConnected) return;
    el.classList.add('is-pronto');
    botao.hidden = false;
  });

  botao.onclick = () => {
    parado = !parado;
    rotular();
  };

  rotular();
  return el;
}
