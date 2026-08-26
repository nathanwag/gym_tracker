/* Ajustes: backup, preferencias e informacoes. */

import * as db from '../db.js';
import { prepareBackup, exportBackup, readFile, restore } from '../backup.js';
import { MEDIA_CACHE, precacheMedia } from '../media.js';
import { t } from '../i18n.js';
import {
  setTop, html, raw, node, toast, openSheet, confirmSheet, isIOS, isStandalone, ICON,
} from '../ui.js';

const INCREMENTS = [0.5, 1, 1.25, 2, 2.5, 5, 10];

export async function render(view) {
  setTop({ title: t('settings.title'), showBar: false });

  const cfg = db.settings();
  const root = node('<div class="stack"></div>');

  // O backup e montado ja na abertura da tela: no Safari, navigator.share()
  // precisa acontecer durante o toque, sem esperar por uma leitura do banco.
  let backup = null;
  const backupReady = prepareBackup().then((b) => { backup = b; return b; });

  root.append(preferencesCard(cfg));
  root.append(shortcuts(backupReady, () => backup));
  root.append(dangerZoneCard());

  view.append(root);
}

/* ---------- Atalhos: Backup e Figuras abrem num sheet em vez de ocupar
 * espaco fixo na tela — sao acoes ocasionais, ao contrario das preferencias
 * logo acima, que se mexe toda vez que se abre Ajustes. ---------- */

function shortcuts(backupReady, getBackup) {
  const el = node(html`
    <div class="shortcuts">
      <button class="shortcut" type="button" data-open-backup>${raw(ICON.download)}<span>${t('settings.shortcuts.backup')}</span></button>
      <button class="shortcut" type="button" data-open-photos>${raw(ICON.image)}<span>${t('settings.shortcuts.photos')}</span></button>
    </div>
  `);
  // Montados uma unica vez e reaproveitados a cada abertura do sheet: o de
  // Figuras registra um listener de mensagem do service worker que nao pode
  // se acumular a cada toque.
  const backupNode = backupBody(backupReady, getBackup);
  const photosNode = photosBody();
  el.querySelector('[data-open-backup]').onclick = () => openSheet(t('settings.shortcuts.backup'), backupNode);
  el.querySelector('[data-open-photos]').onclick = () => openSheet(t('settings.photos.sheetTitle'), photosNode);
  return el;
}

/* ---------- Backup ---------- */

function backupBody(backupReady, getBackup) {
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

  return body;
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

/* ---------- Preferencias ---------- */

function preferencesCard(cfg) {
  const card = node(html`
    <div>
      <h2 class="section-title" style="margin-top:4px">${t('settings.preferences.title')}</h2>
      <div class="card card__pad stack">
        <label class="field">
          <span class="field__label">${t('settings.preferences.unit.label')}</span>
          <select class="select" data-unit>
            <option value="kg"${cfg.unit === 'kg' ? ' selected' : ''}>${t('settings.preferences.unit.kg')}</option>
            <option value="lb"${cfg.unit === 'lb' ? ' selected' : ''}>${t('settings.preferences.unit.lb')}</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">${t('settings.preferences.step.label')}</span>
          <select class="select" data-increment>
            ${raw(INCREMENTS.map((v) =>
              `<option value="${v}"${Number(cfg.weightIncrement) === v ? ' selected' : ''}>${String(v).replace('.', ',')}</option>`).join(''))}
          </select>
        </label>
        <label class="field">
          <span class="field__label">${t('settings.preferences.theme.label')}</span>
          <select class="select" data-theme>
            <option value="auto"${cfg.theme === 'auto' ? ' selected' : ''}>${t('settings.preferences.theme.auto')}</option>
            <option value="dark"${cfg.theme === 'dark' ? ' selected' : ''}>${t('settings.preferences.theme.dark')}</option>
            <option value="light"${cfg.theme === 'light' ? ' selected' : ''}>${t('settings.preferences.theme.light')}</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">${t('settings.preferences.language.label')}</span>
          <select class="select" data-language>
            <option value="pt"${cfg.language === 'pt' ? ' selected' : ''}>${t('settings.preferences.language.pt')}</option>
            <option value="en"${cfg.language === 'en' ? ' selected' : ''}>${t('settings.preferences.language.en')}</option>
          </select>
        </label>
      </div>
    </div>
  `);

  card.querySelector('[data-unit]').onchange = async (e) => {
    await db.setSetting('unit', e.target.value);
    toast(t('settings.preferences.unit.toast'));
  };
  card.querySelector('[data-increment]').onchange = async (e) => {
    await db.setSetting('weightIncrement', Number(e.target.value));
    toast(t('settings.preferences.step.toast'));
  };
  card.querySelector('[data-theme]').onchange = async (e) => {
    await db.setSetting('theme', e.target.value);
    window.dispatchEvent(new CustomEvent('theme:changed', { detail: e.target.value }));
  };
  card.querySelector('[data-language]').onchange = async (e) => {
    await db.setSetting('language', e.target.value);
    window.dispatchEvent(new CustomEvent('language:changed', { detail: e.target.value }));
  };

  return card;
}

/* ---------- Figuras ---------- */

/* As fotos podem chegar a dezenas de MB no aparelho. Um cache desse tamanho
 * precisa ser visivel e reversivel — e este e o plano B para quando o download
 * automatico decidir nao rodar (conexao celular, economia de dados). */
function photosBody() {
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
  const card = node(html`
    <div>
      <h2 class="section-title">${t('settings.dangerZone.title')}</h2>
      <div class="card card__pad">
        <button class="btn btn--block btn--danger" data-delete-all>${t('settings.dangerZone.button')}</button>
      </div>
    </div>
  `);

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
