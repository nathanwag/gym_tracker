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

import { workoutSummary, workingSets } from './models.js';
import { t, tn, locale } from './i18n.js';
import {
  html, raw, node, openSheet, closeSheet, onSheetClose, toast,
  fmtNum, fmtDuration, isIOS, isStandalone,
} from './ui.js';

const WIDTH = 1080;
const HEIGHT = 1920;
const PAD = 84;

const COLOR_BG_TOP = '#0f1115';
const COLOR_BG_BOTTOM = '#171a21';
const COLOR_ACCENT = '#2dd4e0';
const COLOR_TEXT = '#e8eaef';
const COLOR_MUTED = '#98a1b0';
const COLOR_BORDER = 'rgba(232, 234, 239, 0.14)';

const font = (weight, size) => `${weight} ${size}px Manrope, sans-serif`;
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Dados ---------- */

/** Exercicios com pelo menos uma serie valida, na mesma ordem da sessao —
 *  mesma logica de agrupamento de history.js:renderWorkout. */
function itemsForWorkout(workout, sets, exercisesById) {
  const valid = workingSets(sets);
  const order = [...(workout.exerciseIds || [])];
  for (const s of valid) if (!order.includes(s.exerciseId)) order.push(s.exerciseId);

  const items = [];
  for (const exId of order) {
    const exerciseSets = valid.filter((s) => s.exerciseId === exId);
    if (!exerciseSets.length) continue;
    items.push({ name: exercisesById.get(exId)?.name || t('history.removedExercise'), sets: exerciseSets.length });
  }
  return items;
}

/* ---------- Desenho ---------- */

async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load('600 16px Manrope'),
      document.fonts.load('800 16px Manrope'),
    ]);
    await document.fonts.ready;
  } catch { /* segue com a fonte de fallback do sistema */ }
}

function drawDumbbell(ctx, x, y, size) {
  const s = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = COLOR_ACCENT;
  ctx.lineWidth = 2.2 * s;
  ctx.lineCap = 'round';
  const line = (x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(x1 * s, y1 * s);
    ctx.lineTo(x2 * s, y2 * s);
    ctx.stroke();
  };
  line(6.5, 8, 6.5, 16);
  line(17.5, 8, 17.5, 16);
  line(3.5, 10, 3.5, 14);
  line(20.5, 10, 20.5, 14);
  line(6.5, 12, 17.5, 12);
  ctx.restore();
}

/** Reduz o tamanho da fonte ate o texto caber em `maxWidth`. */
function fitFontSize(ctx, text, weight, maxSize, maxWidth, minSize = 22) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = font(weight, size);
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

function drawHeader(ctx, workout) {
  let y = PAD + 4;

  drawDumbbell(ctx, PAD, y - 30, 40);
  ctx.fillStyle = COLOR_ACCENT;
  ctx.font = font(800, 32);
  ctx.textAlign = 'left';
  ctx.fillText('TREINO', PAD + 56, y);
  y += 96;

  const startedAt = new Date(workout.startedAt);
  const weekday = capitalize(new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(startedAt));
  const longDate = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(startedAt);

  ctx.fillStyle = COLOR_TEXT;
  ctx.font = font(800, fitFontSize(ctx, weekday, 800, 66, WIDTH - PAD * 2));
  ctx.fillText(weekday, PAD, y);
  y += 54;

  ctx.fillStyle = COLOR_MUTED;
  ctx.font = font(600, 34);
  ctx.fillText(longDate, PAD, y);
  y += 76;

  return y;
}

function drawStats(ctx, workout, summary, unit, top) {
  const stats = [
    { value: fmtDuration(workout.startedAt, workout.finishedAt) || '—', label: t('history.stat.duration') },
    { value: String(summary.sets), label: t('history.stat.sets') },
    { value: fmtNum(summary.volume, 0), label: t('history.stat.volume', { unit }) },
  ];

  const colWidth = (WIDTH - PAD * 2) / 3;
  ctx.textAlign = 'center';
  stats.forEach((stat, i) => {
    const cx = PAD + colWidth * i + colWidth / 2;
    ctx.fillStyle = COLOR_ACCENT;
    ctx.font = font(800, fitFontSize(ctx, stat.value, 800, 92, colWidth - 24));
    ctx.fillText(stat.value, cx, top + 84);

    ctx.fillStyle = COLOR_MUTED;
    ctx.font = font(700, 24);
    ctx.fillText(stat.label.toUpperCase(), cx, top + 122);
  });
  ctx.textAlign = 'left';

  const lineY = top + 168;
  ctx.strokeStyle = COLOR_BORDER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, lineY);
  ctx.lineTo(WIDTH - PAD, lineY);
  ctx.stroke();

  return lineY + 64;
}

function drawList(ctx, items, top, availableHeight) {
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = font(700, 26);
  ctx.fillText(t('shareImage.exercisesTitle').toUpperCase(), PAD, top);
  top += 50;
  availableHeight -= 50;

  if (!items.length) {
    ctx.fillStyle = COLOR_MUTED;
    ctx.font = font(600, 30);
    ctx.fillText(t('history.noSets'), PAD, top + 40);
    return;
  }

  const MIN_HEIGHT = 56;
  const MAX_HEIGHT = 108;
  const maxRows = Math.max(1, Math.floor(availableHeight / MIN_HEIGHT));

  let rows = items;
  let remaining = 0;
  if (items.length > maxRows) {
    rows = items.slice(0, Math.max(maxRows - 1, 1));
    remaining = items.length - rows.length;
  }

  const totalRows = rows.length + (remaining ? 1 : 0);
  const rowHeight = Math.min(MAX_HEIGHT, availableHeight / totalRows);
  const fontSize = Math.max(24, Math.min(44, rowHeight * 0.4));
  const totalWidth = WIDTH - PAD * 2;

  let y = top;
  for (const item of rows) {
    const baseline = y + rowHeight * 0.64;

    ctx.textAlign = 'right';
    ctx.fillStyle = COLOR_MUTED;
    ctx.font = font(600, fontSize * 0.68);
    const setsLabel = tn('common.set', item.sets);
    ctx.fillText(setsLabel, WIDTH - PAD, baseline);
    const labelWidth = ctx.measureText(setsLabel).width + 28;

    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = font(700, fontSize);
    ctx.fillText(truncate(ctx, item.name, totalWidth - labelWidth), PAD, baseline);

    if (y + rowHeight < top + availableHeight - 4) {
      ctx.strokeStyle = COLOR_BORDER;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(PAD, y + rowHeight);
      ctx.lineTo(WIDTH - PAD, y + rowHeight);
      ctx.stroke();
    }
    y += rowHeight;
  }

  if (remaining) {
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR_MUTED;
    ctx.font = font(700, fontSize);
    ctx.fillText(`+ ${tn('common.exercise', remaining)}`, PAD, y + rowHeight * 0.64);
  }
}

function drawFooter(ctx) {
  const barY = HEIGHT - 92;
  ctx.fillStyle = COLOR_ACCENT;
  ctx.fillRect(PAD, barY, WIDTH - PAD * 2, 5);

  ctx.fillStyle = COLOR_MUTED;
  ctx.font = font(700, 26);
  ctx.textAlign = 'center';
  ctx.fillText('TREINO', WIDTH / 2, barY + 46);
  ctx.textAlign = 'left';
}

function drawCard(ctx, { workout, summary, unit, items }) {
  const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  background.addColorStop(0, COLOR_BG_TOP);
  background.addColorStop(1, COLOR_BG_BOTTOM);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(WIDTH * 0.85, 140, 0, WIDTH * 0.85, 140, 520);
  glow.addColorStop(0, 'rgba(45, 212, 224, 0.16)');
  glow.addColorStop(1, 'rgba(45, 212, 224, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textBaseline = 'alphabetic';

  let y = drawHeader(ctx, workout);
  y = drawStats(ctx, workout, summary, unit, y);

  const footerReserved = 170;
  drawList(ctx, items, y, HEIGHT - footerReserved - y);
  drawFooter(ctx);
}

/* ---------- Geracao e compartilhamento ---------- */

/**
 * Monta a imagem do treino. Deve ser chamado o quanto antes possivel dentro
 * do fluxo de toque do usuario: navigator.share() no Safari so funciona
 * durante o gesto (mesma observacao de backup.js:prepareBackup).
 */
export async function generateImage(workout, sets, exercisesById, unit) {
  const summary = workoutSummary(sets);
  const items = itemsForWorkout(workout, sets, exercisesById);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  await loadFonts();
  drawCard(ctx, {
    workout, summary, unit, items,
  });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const fileName = `treino-${String(workout.date || workout.startedAt || '').slice(0, 10)}.png`;

  let file = null;
  try {
    file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
  } catch { /* navegador antigo sem construtor de File */ }

  return {
    canvas, blob, file, fileName,
  };
}

/** @returns {Promise<'shared'|'cancelled'|'downloaded'|'manual'>} */
export async function shareImage({ file, blob, fileName }, { canDownload = true } = {}) {
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Qualquer outra falha cai para as alternativas abaixo.
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
export function openShareSheet(workout, sets, exercisesById, unit) {
  return new Promise((resolve) => {
    let resolved = false;
    let previewUrl = null;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      resolve();
    };

    generateImage(workout, sets, exercisesById, unit).then(({ blob, file, fileName }) => {
      // O usuario pode ter fechado (ou navegado pra longe) enquanto a imagem
      // ainda desenhava.
      if (resolved) return;

      previewUrl = blob ? URL.createObjectURL(blob) : null;
      const canShare = !!(file && navigator.canShare?.({ files: [file] }));
      const actionLabel = canShare ? t('shareImage.share') : t('shareImage.save');

      const body = node(html`
        <div class="stack share-preview">
          ${previewUrl ? raw(`<img src="${previewUrl}" alt="">`) : ''}
          <button class="btn btn--primary btn--block" data-action>${actionLabel}</button>
          <button class="btn btn--ghost btn--block" data-close>${t('shareImage.close')}</button>
        </div>
      `);

      body.querySelector('[data-action]').onclick = async () => {
        const canDownload = !(isIOS() && isStandalone());
        const result = await shareImage({ file, blob, fileName }, { canDownload });
        if (result === 'shared') toast(t('shareImage.toastShared'));
        else if (result === 'downloaded') toast(t('shareImage.toastDownloaded'));
        else if (result === 'manual') toast(t('shareImage.toastSaveManually'));
      };
      body.querySelector('[data-close]').onclick = () => closeSheet();

      openSheet(t('shareImage.title'), body);
      onSheetClose(finish);
    }).catch((err) => {
      console.error(err);
      finish();
    });
  });
}
