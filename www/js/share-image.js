/* Cartao de resumo do treino, pra compartilhar como imagem (estilo
 * "retrospectiva" do Spotify) — ao finalizar um treino, ou de novo depois
 * pela tela de historico.
 *
 * Desenhado num <canvas> 2D fora do DOM: nao ha nenhuma lib de imagem no
 * projeto (charts.js resolve graficos com SVG puro), e um canvas rasteriza
 * exatamente o PNG que sai pelo compartilhamento/download.
 *
 * A paleta e FIXA (nao segue --tema claro/escuro do usuario): e uma peca de
 * marca pra sair do app, tem que ficar sempre igual a quem recebe. Os valores
 * batem com o modo escuro de styles.css e com o background_color do
 * manifest.webmanifest.
 */

import { workoutSummary, workoutHighlights, workoutGroupBreakdown } from './models.js';
import { t, tn, locale } from './i18n.js';
import {
  APP_NAME, html, raw, node, openSheet, onSheetClose, toast,
  fmtNum, fmtDuration, fmtSetWithUnit, isIOS, isStandalone,
} from './ui.js';

const WIDTH = 1080;
const HEIGHT = 1920;
const PAD = 84;

const COLOR_BG_TOP = '#0b0c0d';
const COLOR_BG_BOTTOM = '#17191c';
const COLOR_ACCENT = '#e2564a';
const COLOR_TEXT = '#eff0f1';
const COLOR_MUTED = '#878c94';
const COLOR_BORDER = 'rgba(239, 240, 241, 0.14)';
const COLOR_PR = '#e9b93a';

// Cor por grupo, em hex literal: o canvas nao resolve var(--m-x), e o cartao
// e sempre escuro (mesma excecao ja declarada no topo do arquivo), entao ler
// o tema ativo daria as cores erradas pra quem usa o app no claro. Os valores
// batem com o bloco :root[data-theme="dark"] de styles.css.
const GROUP_COLORS = {
  'Peito': '#ec6154',
  'Ombros': '#c4483b',
  'Tríceps': '#96322a',
  'Costas': '#5a92e8',
  'Lombar': '#4276c4',
  'Trapézio': '#345f9f',
  'Bíceps': '#27497c',
  'Antebraço': '#1c3a63',
  'Quadríceps': '#45c2c8',
  'Posterior': '#2d9aa1',
  'Glúteos': '#20787e',
  'Panturrilha': '#175b61',
  'Abdômen': '#9aa1ab',
  'Cardio': '#828a95',
  'Pescoço': '#6b737e',
  'Outros': '#5a626c',
  'Alongamento': '#4a515a',
};

const font = (weight, size) => `${weight} ${size}px Manrope, sans-serif`;
// A condensada carrega todo numero e todo rotulo em caixa alta — as duas
// pontas da escala do app.
const fontData = (weight, size) => `${weight} ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;

/* ---------- Dados ---------- */

/** Melhor serie de cada exercicio + nome pra exibir. O calculo (ordem, melhor
 *  serie, recorde) mora em models.js; aqui so entra o nome, que vem do banco. */
function itemsForWorkout(workout, sets, exercisesById, allSets) {
  return workoutHighlights(workout, sets, allSets).map((h) => ({
    ...h,
    name: exercisesById.get(h.exerciseId)?.name || t('history.removedExercise'),
  }));
}

/* ---------- Desenho ---------- */

async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load('600 16px Manrope'),
      document.fonts.load('800 16px Manrope'),
      document.fonts.load('700 16px "Barlow Condensed"'),
      document.fonts.load('800 16px "Barlow Condensed"'),
    ]);
    await document.fonts.ready;
  } catch { /* segue com a fonte de fallback do sistema */ }
}

/** A marca do app: tres tracos do mesmo comprimento, cada um mais grosso.
 *  E o MESMO desenho do icone (www/icons/) — marca de app e marca de peca
 *  compartilhada tem que ser a mesma, senao quem ve as duas ve dois apps.
 *  `x` e a borda esquerda dos tracos e `yCenter` o meio do bloco. */
function drawMark(ctx, x, yCenter, width) {
  // Proporcoes da grade de 100 do icone: tracos de 48 de largura, alturas
  // 5/9/14, comecando em 0/15/32 a partir do topo do bloco.
  const k = width / 48;
  const alturas = [5, 9, 14];
  const topos = [0, 15, 32];
  const total = 46 * k;
  const top = yCenter - total / 2;

  ctx.save();
  ctx.fillStyle = COLOR_ACCENT;
  for (let i = 0; i < 3; i++) {
    const h = alturas[i] * k;
    const y = top + topos[i] * k;
    const r = h / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, width, h, r);
    else ctx.rect(x, y, width, h);
    ctx.fill();
  }
  ctx.restore();
}

/** Reduz o tamanho da fonte ate o texto caber em `maxWidth`. */
function fitFontSize(ctx, text, weight, maxSize, maxWidth, minSize = 22, family = font) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = family(weight, size);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

/** Trunca com reticencias (sem quebra de linha) pra caber em `maxWidth`.
 *  Assume que ctx.font ja esta ajustado pro texto. */
function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/** fillText com espacamento entre letras, pros rotulos em caixa alta.
 *  `letterSpacing` e ignorado em Safari antigo — la o texto so sai mais junto. */
function spacedText(ctx, text, x, y, spacing) {
  ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(text, x, y);
  ctx.letterSpacing = '0px';
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function drawBrand(ctx, workout) {
  drawMark(ctx, PAD, 74, 34);
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = fontData(800, 40);
  ctx.textAlign = 'left';
  spacedText(ctx, APP_NAME.toUpperCase(), PAD + 52, 89, 6);

  const startedAt = new Date(workout.startedAt);
  const weekday = new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(startedAt);
  const longDate = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(startedAt);

  ctx.fillStyle = COLOR_MUTED;
  ctx.font = fontData(700, 30);
  spacedText(ctx, `${weekday} · ${longDate}`.toUpperCase(), PAD, 152, 4);
}

/** O volume da sessao ocupando a largura toda: e o numero que da a dimensao do
 *  treino pra quem ve o story de passagem. */
function drawHero(ctx, summary, unit) {
  const value = fmtNum(summary.volume, 0);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = fontData(800, fitFontSize(ctx, value, 800, 300, WIDTH - PAD * 2 - 150, 130, fontData));
  ctx.fillText(value, PAD, 420);

  // A unidade encosta no numero, na linha de base dele — o mesmo par do
  // bloco da semana no app.
  ctx.fillStyle = COLOR_MUTED;
  const unitFont = fontData(600, 76);
  const numberWidth = ctx.measureText(value).width;
  ctx.font = unitFont;
  ctx.fillText(unit, PAD + numberWidth + 18, 420);

  ctx.fillStyle = COLOR_MUTED;
  ctx.font = fontData(700, 34);
  spacedText(ctx, t('shareImage.volumeLabel').toUpperCase(), PAD, 478, 7);
}

/** Quebra "3 séries" em ["3", "séries"] pra desenhar o numero em negrito e o
 *  rotulo apagado. Sai de tn() pra a flexao vir certa em "1 exercício". */
function splitPlural(key, n) {
  const text = tn(key, n);
  const space = text.indexOf(' ');
  return space === -1 ? [text, ''] : [text.slice(0, space), text.slice(space + 1)];
}

function drawMeta(ctx, workout, summary, exerciseCount) {
  const segments = [
    [fmtDuration(workout.startedAt, workout.finishedAt) || '—', t('history.stat.duration')],
    splitPlural('common.set', summary.sets),
    splitPlural('common.exercise', exerciseCount),
  ];

  const y = 556;
  let x = PAD;
  ctx.textAlign = 'left';
  for (const [value, label] of segments) {
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = fontData(800, 40);
    ctx.fillText(value, x, y);
    x += ctx.measureText(value).width + 10;

    ctx.fillStyle = COLOR_MUTED;
    ctx.font = font(600, 30);
    ctx.fillText(label, x, y);
    x += ctx.measureText(label).width + 40;
  }
}

/** Estrela cheia, o mesmo desenho do recorde no livro-razao do app. */
function drawStar(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawPrBadge(ctx, x, baseline, loadSize) {
  const h = Math.max(34, loadSize * 0.46);
  const label = t('shareImage.pr');
  ctx.font = fontData(800, h * 0.56);
  const star = h * 0.3;
  const w = ctx.measureText(label).width + h * 1.5;
  const top = baseline - h * 0.82;

  ctx.fillStyle = 'rgba(233, 185, 58, 0.16)';
  roundedRect(ctx, x, top, w, h, h * 0.28);
  ctx.fill();

  ctx.fillStyle = COLOR_PR;
  drawStar(ctx, x + h * 0.46, top + h / 2, star);
  ctx.letterSpacing = '2px';
  ctx.fillText(label, x + h * 0.86, top + h * 0.71);
  ctx.letterSpacing = '0px';
}

/**
 * Um bloco por exercicio: nome em cima, melhor serie embaixo.
 *
 * A altura disponivel e dividida igualmente entre os blocos e o corpo do texto
 * acompanha essa altura — e o que faz o cartao encher tanto com 3 exercicios
 * (blocos altos, carga enorme) quanto com 10 (blocos baixos, carga menor). O
 * layout antigo fixava a altura da linha e deixava metade do cartao vazia.
 */
function drawBlocks(ctx, items, unit, top, bottom) {
  const available = bottom - top;
  const MIN_BLOCK = 150;
  const maxRows = Math.max(1, Math.floor(available / MIN_BLOCK));

  let rows = items;
  let remaining = 0;
  if (items.length > maxRows) {
    rows = items.slice(0, Math.max(maxRows - 1, 1));
    remaining = items.length - rows.length;
  }

  const totalRows = rows.length + (remaining ? 1 : 0);
  // Teto na altura do bloco: sem ele, um treino de 1 exercicio esticaria a
  // linha por 1150px e o vazio voltava. Com o teto, o que sobra vira respiro
  // em cima E embaixo (a pilha fica centrada) em vez de um buraco no pe.
  const blockHeight = Math.min(340, available / totalRows);
  const startY = top + (available - blockHeight * totalRows) / 2;
  const loadSize = Math.max(44, Math.min(112, blockHeight * 0.34));
  const nameSize = Math.max(24, Math.min(38, blockHeight * 0.15));
  const maxWidth = WIDTH - PAD * 2;

  const rule = (y) => {
    ctx.strokeStyle = COLOR_BORDER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(WIDTH - PAD, y);
    ctx.stroke();
  };

  let y = startY;
  for (const item of rows) {
    rule(y);
    const middle = y + blockHeight / 2;

    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR_MUTED;
    ctx.font = fontData(700, nameSize);
    spacedText(ctx, truncate(ctx, item.name.toUpperCase(), maxWidth), PAD, middle - loadSize * 0.36, 4);

    const load = fmtSetWithUnit(item.topSet, unit);
    ctx.fillStyle = item.pr ? COLOR_PR : COLOR_TEXT;
    ctx.font = fontData(800, loadSize);
    ctx.fillText(load, PAD, middle + loadSize * 0.58);

    if (item.pr) {
      drawPrBadge(ctx, PAD + ctx.measureText(load).width + 24, middle + loadSize * 0.58, loadSize);
    }
    y += blockHeight;
  }

  if (remaining) {
    rule(y);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR_MUTED;
    ctx.font = fontData(800, loadSize * 0.6);
    ctx.fillText(`+ ${remaining}`, PAD, y + blockHeight * 0.62);
    y += blockHeight;
  }
  rule(y);
}

/** A mesma barra de cores que identifica o treino na lista do historico.
 *  Sem ela o cartao nao dizia o que foi treinado — dois treinos de volume
 *  parecido saiam identicos. */
function drawSignature(ctx, breakdown, y) {
  if (!breakdown.length) return;
  const total = breakdown.reduce((acc, g) => acc + g.sets, 0);
  const width = WIDTH - PAD * 2;
  const gap = 6;
  const usable = width - gap * (breakdown.length - 1);

  let x = PAD;
  for (const g of breakdown) {
    const w = (g.sets / total) * usable;
    ctx.fillStyle = GROUP_COLORS[g.group] || GROUP_COLORS['Outros'];
    roundedRect(ctx, x, y, w, 14, 3);
    ctx.fill();
    x += w + gap;
  }
}

function drawFooter(ctx) {
  ctx.fillStyle = COLOR_ACCENT;
  ctx.fillRect(PAD, HEIGHT - 92, WIDTH - PAD * 2, 5);
}

function drawCard(ctx, {
  workout, summary, unit, items, breakdown,
}) {
  const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  background.addColorStop(0, COLOR_BG_TOP);
  background.addColorStop(1, COLOR_BG_BOTTOM);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Estava em ciano cravado, sobra da paleta antiga: o cartao saia com um
  // halo azul num desenho todo vermelho.
  const glow = ctx.createRadialGradient(WIDTH * 0.82, 120, 0, WIDTH * 0.82, 120, 560);
  glow.addColorStop(0, 'rgba(226, 86, 74, 0.20)');
  glow.addColorStop(1, 'rgba(226, 86, 74, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textBaseline = 'alphabetic';

  drawBrand(ctx, workout);
  drawHero(ctx, summary, unit);
  drawMeta(ctx, workout, summary, items.length);
  drawSignature(ctx, breakdown, 600);
  drawBlocks(ctx, items, unit, 680, HEIGHT - 150);
  drawFooter(ctx);
}

/* ---------- Geracao e compartilhamento ---------- */

/**
 * Monta a imagem do treino. Deve ser chamado o quanto antes possivel dentro
 * do fluxo de toque do usuario: navigator.share() no Safari so funciona
 * durante o gesto (mesma observacao de backup.js:prepareBackup).
 */
export async function generateImage(workout, sets, exercisesById, unit, allSets = []) {
  const summary = workoutSummary(sets);
  const items = itemsForWorkout(workout, sets, exercisesById, allSets);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  await loadFonts();
  drawCard(ctx, {
    workout, summary, unit, items, breakdown: workoutGroupBreakdown(sets, exercisesById),
  });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const fileName = `anilha-${String(workout.date || workout.startedAt || '').slice(0, 10)}.png`;

  let file = null;
  try {
    file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
  } catch { /* navegador antigo sem construtor de File */ }

  return {
    canvas, blob, file, fileName,
  };
}

/** @returns {Promise<'shared'|'cancelled'|'downloaded'|'manual'>} */
/** Erros que significam que a folha de compartilhamento NAO chegou a abrir —
 *  so nesses vale tentar o download em seguida. Qualquer outra rejeicao pode
 *  ter vindo depois de a imagem ja ter sido salva, e ai baixar de novo daria
 *  dois arquivos (era o que acontecia na exportacao do backup). */
const SHARE_NAO_ABRIU = new Set(['NotAllowedError', 'NotSupportedError', 'TypeError']);

export async function shareImage({ file, blob, fileName }, { canDownload = true } = {}) {
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return 'shared';
    } catch (err) {
      if (!SHARE_NAO_ABRIU.has(err?.name)) return 'cancelled';
      // A folha nao abriu: seguem as alternativas abaixo.
    }
  }

  if (canDownload && blob) {
    try {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return 'downloaded';
    } catch { /* segue para o fallback manual */ }
  }

  // Sem share nem download possivel (ex: iOS instalado sem Web Share de
  // arquivo): a propria pre-visualizacao no sheet ja permite segurar e salvar.
  return 'manual';
}

/**
 * Gera a imagem do treino e abre um sheet de pre-visualizacao com a acao de
 * compartilhar/salvar. A Promise resolve quando o sheet fecha (por qualquer
 * via), pra quem chama poder esperar o usuario ver o cartao antes de navegar.
 */
export function openShareSheet(workout, sets, exercisesById, unit, allSets = []) {
  return new Promise((resolve) => {
    let resolved = false;
    let previewUrl = null;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      resolve();
    };

    generateImage(workout, sets, exercisesById, unit, allSets).then(({ blob, file, fileName }) => {
      // O usuario pode ter fechado (ou navegado pra longe) enquanto a imagem
      // ainda desenhava.
      if (resolved) return;

      previewUrl = blob ? URL.createObjectURL(blob) : null;
      const canShare = !!(file && navigator.canShare?.({ files: [file] }));
      const actionLabel = canShare ? t('shareImage.share') : t('shareImage.save');

      // Sem botao "Fechar": o × do cabecalho do sheet ja fecha. A legenda diz o
      // que vai sair dali, que a previa sozinha nao conta.
      const body = node(html`
        <div class="stack share-preview">
          ${previewUrl ? raw(`<img src="${previewUrl}" alt="">`) : ''}
          <p class="muted small" style="margin:0;text-align:center">${t('shareImage.fileHint')}</p>
          <button class="btn btn--primary btn--block" data-action>${actionLabel}</button>
        </div>
      `);

      body.querySelector('[data-action]').onclick = async () => {
        const canDownload = !(isIOS() && isStandalone());
        const result = await shareImage({ file, blob, fileName }, { canDownload });
        if (result === 'shared') toast(t('shareImage.toastShared'));
        else if (result === 'downloaded') toast(t('shareImage.toastDownloaded'));
        else if (result === 'manual') toast(t('shareImage.toastSaveManually'));
      };

      openSheet(t('shareImage.title'), body);
      onSheetClose(finish);
    }).catch((err) => {
      console.error(err);
      finish();
    });
  });
}
