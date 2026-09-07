/* Voce: seus dados (backup, figuras), suas preferencias e a versao instalada.
 *
 * Chamava-se Ajustes. O nome mudou junto com a estrutura: depois que o backup
 * subiu pro topo, metade da tela deixou de ser ajuste e passou a ser o que e
 * seu — e o app nao tem servidor, entao isso e o assunto principal daqui. */

import * as db from '../db.js';
import { prepareBackup, exportBackup, readFile, restore } from '../backup.js';
import { MEDIA_CACHE, APP_CACHE_PREFIX, precacheMedia } from '../media.js';
import { t } from '../i18n.js';
import {
  setTop, html, raw, node, toast, openSheet, confirmSheet, isIOS, isStandalone, ICON,
} from '../ui.js';

const INCREMENTS = [0.5, 1, 1.25, 2, 2.5, 5, 10];

export async function render(view) {
  setTop({ title: t('settings.title') });

  const cfg = db.settings();
  const root = node('<div class="stack"></div>');

  // O backup e montado ja na abertura da tela: no Safari, navigator.share()
  // precisa acontecer durante o toque, sem esperar por uma leitura do banco.
  let backup = null;
  const backupReady = prepareBackup().then((b) => { backup = b; return b; });

  // Ordem por importancia, nao por frequencia de uso: o app nao tem servidor,
  // entao "seus treinos so existem neste aparelho" e a informacao mais
  // consequente da tela — e antes ela estava atras de um icone, com o aviso
  // dentro do sheet, lido so por quem ja tinha decidido abrir.
  root.append(dataSection(backupReady, () => backup));
  root.append(logSection(cfg));
  root.append(lookSection(cfg));
  root.append(photosSection());
  root.append(aboutSection());
  root.append(dangerZoneCard());

  view.append(root);
}

/* ---------- Pecas comuns ----------
 * Uma gramatica so pra tela inteira: titulo de secao + linhas "rotulo a
 * esquerda, controle a direita". Antes conviviam tres (campos empilhados num
 * cartao, dois botoes de icone, e um botao solto), e nada dizia que eram o
 * mesmo nivel de coisa. */

function section(title, ...content) {
  const el = node(`<div class="sec"><h2 class="section-title">${title}</h2><div data-body></div></div>`);
  el.querySelector('[data-body]').append(...content);
  return el;
}

/** Linha de ajuste com <select> nativo a direita. Segue nativo de proposito:
 *  abre o seletor do sistema num toque so — trocar por um sheet proprio
 *  deixaria a tela mais uniforme e cada ajuste mais caro. */
function selectRow(label, attr, options, onChange) {
  // O <select> perde a aparencia nativa e ganha a MESMA seta das linhas de
  // leitura: com a seta do sistema por cima, cada navegador desenhava uma
  // coisa e as linhas de ajuste destoavam das de informacao logo abaixo.
  const row = node(html`
    <div class="set-row">
      <span class="set-row__k">${label}</span>
      <span class="set-row__v set-row__v--select">
        <select class="select--inline" ${raw(attr)}>${raw(options)}</select>
        ${raw(ICON.down)}
      </span>
    </div>
  `);
  row.querySelector('select').onchange = (e) => onChange(e.target.value);
  return row;
}

/** Linha so de leitura, com valor a direita. `onClick` a torna tocavel. */
function infoRow(label, value, onClick = null) {
  const row = node(html`
    <div class="set-row${onClick ? ' set-row--tap' : ''}">
      <span class="set-row__k">${label}</span>
      <span class="set-row__v"><span data-value>${value}</span>${onClick ? raw(ICON.chevron) : ''}</span>
    </div>
  `);
  if (onClick) row.onclick = onClick;
  return row;
}

/* ---------- Backup ---------- */

function dataSection(backupReady, getBackup) {
  const body = node(html`
    <div class="stack">
      <p class="muted small" style="margin:0">${t('settings.backup.explanation')}</p>
      <p class="small tnum" data-summary style="margin:0">${t('settings.backup.preparing')}</p>
      <button class="btn btn--primary btn--block" data-export>${t('settings.backup.export')}</button>
      <button class="btn btn--block" data-import>${t('settings.backup.import')}</button>
      <input type="file" accept="application/json,.json" data-file hidden>
    </div>
  `);

  backupReady.then((b) => {
    body.querySelector('[data-summary]').textContent =
      t('settings.backup.summary', { workouts: b.summary.workouts, sets: b.summary.sets, exercises: b.summary.exercises });
  });

  body.querySelector('[data-export]').onclick = async () => {
    const b = getBackup() || await backupReady;
    // Num PWA instalado no iOS o <a download> nao faz nada; melhor cair direto
    // na area de transferencia do que dar a impressao de que salvou.
    const canDownload = !(isIOS() && isStandalone());
    const result = await exportBackup(b, { canDownload });

    if (result === 'shared') toast(t('settings.backup.toastShared'));
    else if (result === 'downloaded') toast(t('settings.backup.toastDownloaded'));
    else if (result === 'cancelled') toast(t('settings.backup.toastCancelled'));
    else if (result === 'copied') { toast(t('settings.backup.toastCopied')); showJson(b); }
    else showJson(b);
  };

  const input = body.querySelector('[data-file]');
  body.querySelector('[data-import]').onclick = () => input.click();

  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    let data;
    try {
      data = await readFile(file);
    } catch (err) {
      toast(err.message);
      return;
    }

    const ok = await confirmSheet({
      title: t('settings.backup.confirmRestore.title'),
      message: t('settings.backup.confirmRestore.message', { workouts: data.workouts.length, sets: data.sets.length }),
      confirmLabel: t('settings.backup.restore'),
      danger: true,
    });
    if (!ok) return;

    await restore(data);
    toast(t('settings.backup.toastRestored'));
    location.hash = '#/';
  };

  return section(t('settings.section.data'), body);
}

function showJson(backup) {
  const body = node(html`
    <div class="stack">
      <p class="muted small" style="margin:0">${t('settings.backup.manual.explanation')}</p>
      <textarea class="input" style="height:220px;padding:10px;font-family:monospace;font-size:12px"
                readonly>${backup.json}</textarea>
      <button class="btn btn--primary btn--block" data-copy>${t('settings.backup.manual.copyAll')}</button>
    </div>
  `);
  openSheet(t('settings.backup.manual.title'), body);

  const area = body.querySelector('textarea');
  body.querySelector('[data-copy]').onclick = async () => {
    area.select();
    try {
      await navigator.clipboard.writeText(backup.json);
      toast(t('settings.backup.manual.toastCopied'));
    } catch {
      toast(t('settings.backup.manual.toastCopyFailed'));
    }
  };
}

/* ---------- Registro e Aparencia ----------
 * Os quatro ajustes eram um bloco so, empilhados num cartao. Sao duas
 * familias: unidade e passo mudam COMO voce registra a serie; tema e idioma
 * mudam so a aparencia. Separados, cada titulo ja diz o que esperar embaixo
 * dele — e a tela deixa de parecer uma lista arbitraria de quatro campos. */

const option = (value, label, selected) =>
  `<option value="${value}"${selected ? ' selected' : ''}>${label}</option>`;

function logSection(cfg) {
  const unit = selectRow(
    t('settings.preferences.unit.label'),
    'data-unit',
    option('kg', t('settings.preferences.unit.kg'), cfg.unit === 'kg')
      + option('lb', t('settings.preferences.unit.lb'), cfg.unit === 'lb'),
    async (value) => {
      await db.setSetting('unit', value);
      toast(t('settings.preferences.unit.toast'));
    },
  );

  const step = selectRow(
    t('settings.preferences.step.label'),
    'data-increment',
    INCREMENTS.map((v) => option(v, String(v).replace('.', ','), Number(cfg.weightIncrement) === v)).join(''),
    async (value) => {
      await db.setSetting('weightIncrement', Number(value));
      toast(t('settings.preferences.step.toast'));
    },
  );

  return section(t('settings.section.log'), unit, step);
}

function lookSection(cfg) {
  const theme = selectRow(
    t('settings.preferences.theme.label'),
    'data-theme',
    option('auto', t('settings.preferences.theme.auto'), cfg.theme === 'auto')
      + option('dark', t('settings.preferences.theme.dark'), cfg.theme === 'dark')
      + option('light', t('settings.preferences.theme.light'), cfg.theme === 'light'),
    async (value) => {
      await db.setSetting('theme', value);
      window.dispatchEvent(new CustomEvent('theme:changed', { detail: value }));
    },
  );

  const language = selectRow(
    t('settings.preferences.language.label'),
    'data-language',
    option('pt', t('settings.preferences.language.pt'), cfg.language === 'pt')
      + option('en', t('settings.preferences.language.en'), cfg.language === 'en'),
    async (value) => {
      await db.setSetting('language', value);
      window.dispatchEvent(new CustomEvent('language:changed', { detail: value }));
    },
  );

  return section(t('settings.section.look'), theme, language);
}

/* ---------- Sobre ----------
 * A versao vem do nome do cache do service worker, nao de uma constante no
 * bundle: e a versao REALMENTE instalada. Uma constante importada diria a
 * versao do arquivo que acabou de carregar, que e justamente o que nao ajuda
 * quando a pergunta e "por que nao atualizou?". */

async function installedVersion() {
  try {
    const keys = await caches.keys();
    return keys.find((k) => k.startsWith(APP_CACHE_PREFIX)) || null;
  } catch {
    return null;
  }
}

function aboutSection() {
  const row = infoRow(t('settings.about.version'), t('settings.about.noServiceWorker'));
  installedVersion().then((v) => {
    if (v) row.querySelector('[data-value]').textContent = v;
  });
  return section(t('settings.section.about'), row);
}

/* ---------- Figuras ----------
 * O tamanho no aparelho sobe pra linha da secao: era a primeira coisa dentro
 * do sheet, e e o unico numero que faz alguem querer abrir. O sheet segue
 * existindo pro que e acao (baixar, apagar). */

function photosSection() {
  let row = null;
  // O sheet ja abre o cache pra calcular o uso; a linha recebe o mesmo texto
  // por callback em vez de abrir de novo — e assim ela tambem se atualiza
  // depois de baixar ou apagar figuras, sem ninguem reabrir a tela.
  const body = photosBody((usage) => {
    row?.querySelector('[data-value]')?.replaceChildren(usage);
  });
  row = infoRow(
    t('settings.photos.onDeviceLabel'),
    t('settings.photos.calculating'),
    () => openSheet(t('settings.photos.sheetTitle'), body),
  );
  return section(t('settings.section.photos'), row);
}

/* As fotos podem chegar a dezenas de MB no aparelho. Um cache desse tamanho
 * precisa ser visivel e reversivel — e este e o plano B para quando o download
 * automatico decidir nao rodar (conexao celular, economia de dados). */
function photosBody(onUsage = () => {}) {
  const body = node(html`
    <div class="stack">
      <p class="muted small" style="margin:0">${t('settings.photos.explanation')}</p>
      <p class="small tnum" data-usage style="margin:0">${t('settings.photos.calculating')}</p>
      <button class="btn btn--block" data-download>${t('settings.photos.download')}</button>
      <button class="btn btn--block btn--ghost" data-delete-photos>${t('settings.photos.deleteDownloaded')}</button>
    </div>
  `);

  const usage = body.querySelector('[data-usage]');
  const downloadBtn = body.querySelector('[data-download]');

  const updateUsage = async () => {
    try {
      const cache = await caches.open(MEDIA_CACHE);
      const total = (await cache.keys()).length;
      const est = await navigator.storage?.estimate?.().catch(() => null);
      const mb = est?.usage ? ` · ${(est.usage / 1024 / 1024).toFixed(1)} MB${t('settings.photos.onDevice')}` : '';
      usage.textContent = total ? `${t('settings.photos.saved', { n: total })}${mb}` : t('settings.photos.noneSaved');
    } catch {
      usage.textContent = t('settings.photos.cacheUnavailable');
    }
    onUsage(usage.textContent);
  };

  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'precache-media:progress') {
      downloadBtn.textContent = t('settings.photos.downloading', { done: e.data.done, total: e.data.total });
    } else if (e.data?.type === 'precache-media:done') {
      downloadBtn.textContent = t('settings.photos.download');
      downloadBtn.disabled = false;
      toast(e.data.total ? t('settings.photos.toastDownloaded', { n: e.data.total }) : t('settings.photos.toastAlreadySaved'));
      updateUsage();
    }
  });

  downloadBtn.onclick = async () => {
    downloadBtn.disabled = true;
    downloadBtn.textContent = t('settings.photos.preparing');
    const started = await precacheMedia({ force: true });
    if (!started) {
      downloadBtn.textContent = t('settings.photos.download');
      downloadBtn.disabled = false;
      toast(t('settings.photos.toastDownloadFailed'));
    }
  };

  body.querySelector('[data-delete-photos]').onclick = async () => {
    const ok = await confirmSheet({
      title: t('settings.photos.confirmDelete.title'),
      message: t('settings.photos.confirmDelete.message'),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await caches.delete(MEDIA_CACHE);
    await db.setSetting('mediaPrecacheVersion', '');
    toast(t('settings.photos.toastDeleted'));
    updateUsage();
  };

  updateUsage();
  return body;
}

/* ---------- Apagar tudo ---------- */

function dangerZoneCard() {
  const button = node(html`
    <button class="btn btn--block btn--danger" data-delete-all>${t('settings.dangerZone.button')}</button>
  `);
  const card = section(t('settings.dangerZone.title'), button);

  card.querySelector('[data-delete-all]').onclick = async () => {
    const ok = await confirmSheet({
      title: t('settings.dangerZone.confirm.title'),
      message: t('settings.dangerZone.confirm.message'),
      confirmLabel: t('settings.dangerZone.confirm.label'),
      danger: true,
    });
    if (!ok) return;

    await db.resetAll();
    await db.getSettings();
    toast(t('settings.dangerZone.toastDeleted'));
    location.hash = '#/';
  };

  return card;
}
