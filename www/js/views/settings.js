/* Configuracoes: preferencias, seus dados e o rodape de versao/licencas.
 *
 * Era a aba inteira ("Voce"), com backup, figuras, sobre e zona de risco na
 * mesma rolagem — seis titulos pra oito linhas, e no meio da tela um paragrafo
 * com dois botoes grandes. Virou tela filha do Perfil, com dois grupos: o
 * paragrafo e os botoes de backup foram pra sua propria tela (views/backup.js),
 * que e o que as diretrizes de ajustes recomendam pro que e menos frequente.
 *
 * A rota continua /ajustes de proposito: o nome nunca aparece na interface e
 * troca-lo quebraria o link salvo de quem ja usa o app. */

import * as db from '../db.js';
import { MEDIA_CACHE, APP_CACHE_PREFIX, precacheMedia } from '../media.js';
import { parseWeightStep, MIN_STEP, MAX_STEP } from '../weight-step.js';
import { daysSince } from '../profile.js';
import { t, tn } from '../i18n.js';
import {
  setTop, html, raw, node, toast, openSheet, closeSheet, onSheetClose, confirmSheet,
  pickerRow, infoRow, fmtNum, ICON,
} from '../ui.js';

export async function render(view) {
  setTop({ title: t('settings.title'), back: '#/perfil' });

  const cfg = db.settings();
  const root = node('<div class="stack"></div>');

  root.append(preferencesSection(cfg));
  root.append(dataSection(cfg));
  root.append(aboutFooter());
  root.append(dangerZone());

  view.append(root);
}

function section(title, ...content) {
  const el = node(`<div class="sec"><h2 class="section-title">${title}</h2><div data-body></div></div>`);
  el.querySelector('[data-body]').append(...content);
  return el;
}

/** Bloco sem cabecalho: usado no rodape e na zona de risco, que nao sao um
 *  assunto que alguem procura — sao o que se encontra no fim da tela. */
function group(...content) {
  const el = node('<div class="sec"><div data-body></div></div>');
  el.querySelector('[data-body]').append(...content);
  return el;
}

/* ---------- Preferencias ----------
 * Unidade e passo mudam COMO voce registra a serie; tema e idioma mudam so a
 * aparencia. Eram dois grupos de dois, com um titulo cada — pouco pra
 * justificar dois cabecalhos, e o icone de cada linha ja separa uma da outra. */

function preferencesSection(cfg) {
  const unit = pickerRow(
    t('settings.preferences.unit.label'),
    [
      { value: 'kg', label: t('settings.preferences.unit.kg') },
      { value: 'lb', label: t('settings.preferences.unit.lb') },
    ],
    cfg.unit,
    async (value) => {
      await db.setSetting('unit', value);
      toast(t('settings.preferences.unit.toast'));
    },
    { icon: ICON.dumbbell },
  );

  const theme = pickerRow(
    t('settings.preferences.theme.label'),
    [
      { value: 'auto', label: t('settings.preferences.theme.auto') },
      { value: 'dark', label: t('settings.preferences.theme.dark') },
      { value: 'light', label: t('settings.preferences.theme.light') },
    ],
    cfg.theme,
    async (value) => {
      await db.setSetting('theme', value);
      window.dispatchEvent(new CustomEvent('theme:changed', { detail: value }));
    },
    { icon: ICON.moon },
  );

  const language = pickerRow(
    t('settings.preferences.language.label'),
    [
      { value: 'pt', label: t('settings.preferences.language.pt') },
      { value: 'en', label: t('settings.preferences.language.en') },
    ],
    cfg.language,
    async (value) => {
      await db.setSetting('language', value);
      window.dispatchEvent(new CustomEvent('language:changed', { detail: value }));
    },
    { icon: ICON.globe },
  );

  return section(t('settings.section.preferences'), unit, stepRow(cfg.weightIncrement), theme, language);
}

/* O passo nao e escolha entre poucas opcoes, e um numero: sete incrementos
 * fixos deixavam de fora a anilha de 1,5 kg, os 5 lb em kg e a maquina que so
 * pula de 20 em 20. Por isso a linha abre o campo direto. */
function stepRow(value) {
  const stepLabel = (v) => fmtNum(Number(v), 2);
  let current = Number(value);
  let row = null;

  row = infoRow(t('settings.preferences.step.label'), stepLabel(current), async () => {
    const typed = await askStep(current);
    if (typed == null || Number(typed) === current) return;

    current = Number(typed);
    row.querySelector('[data-value]').textContent = stepLabel(current);
    await db.setSetting('weightIncrement', current);
    toast(t('settings.preferences.step.toast'));
  }, { icon: ICON.plusMinus });

  return row;
}

/** A folha do passo: um campo so. Devolve o valor digitado como string, ou
 *  null quando a folha fecha sem valor. */
function askStep(current) {
  // A unidade e lida agora, e nao do cfg da abertura da tela: setSetting troca
  // o objeto inteiro, entao quem mudou de kg pra lb sem sair da tela veria a
  // unidade antiga aqui.
  const unit = db.settings().unit;
  const hint = t('settings.preferences.step.hint', {
    min: fmtNum(MIN_STEP, 2), max: fmtNum(MAX_STEP, 2),
  });

  return new Promise((resolve) => {
    let answered = false;
    const finish = (value) => {
      if (answered) return;
      answered = true;
      resolve(value);
    };

    // type="text" com inputmode decimal, nao type="number": o campo precisa
    // aceitar a virgula que o teclado do celular oferece em pt.
    const body = node(html`
      <div class="stack">
        <label class="field">
          <span class="field__label">${t('settings.preferences.step.field')} <span class="muted">${unit}</span></span>
          <input class="input" data-step type="text" inputmode="decimal" enterkeyhint="done"
                 value="${fmtNum(Number(current), 2)}">
        </label>
        <p class="muted small" data-hint aria-live="polite" style="margin:0">${hint}</p>
        <button type="button" class="btn btn--primary btn--block" data-use>${t('common.save')}</button>
      </div>
    `);
    openSheet(t('settings.preferences.step.label'), body);
    onSheetClose(() => finish(null));

    const input = body.querySelector('[data-step]');
    const hintEl = body.querySelector('[data-hint]');

    const submit = () => {
      const parsed = parseWeightStep(input.value);
      // O recado do erro e a propria dica que ja esta ali, em vermelho: um
      // toast repetiria a mesma frase dois centimetros acima dela.
      hintEl.classList.toggle('hint--err', parsed == null);
      input.setAttribute('aria-invalid', String(parsed == null));
      if (parsed == null) {
        input.focus();
        input.select();
        return;
      }
      finish(String(parsed));
      closeSheet();
    };

    body.querySelector('[data-use]').onclick = submit;
    input.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      submit();
    };
    input.focus();
    input.select();
  });
}

/* ---------- Seus dados ---------- */

function dataSection(cfg) {
  const days = daysSince(cfg.lastBackupAt);
  const backup = infoRow(
    t('settings.data.backup'),
    '',
    () => { location.hash = '#/backup'; },
    {
      icon: ICON.download,
      hint: days == null
        ? t('settings.data.backupNever')
        : days === 0 ? t('settings.data.backupToday')
          : t('settings.data.backupAgo', { when: tn('common.daysAgo', days) }),
    },
  );

  // A conta nao e promessa: a linha existe pro assunto ter lugar quando (e se)
  // houver login, sem redesenhar a tela nem migrar o modelo.
  const account = infoRow(
    t('settings.data.account'),
    t('settings.data.soon'),
    null,
    { icon: ICON.person, hint: t('settings.data.accountHint'), muted: true },
  );

  return section(t('settings.section.data'), backup, photosRow(), account);
}

/* As fotos podem chegar a dezenas de MB no aparelho. O tamanho fica na linha
 * porque e o unico numero que faz alguem querer abrir; o sheet segue existindo
 * pro que e acao (baixar, apagar). */
function photosRow() {
  let row = null;
  const body = photosBody((usage) => {
    const hint = row?.querySelector('.set-row__hint');
    if (hint) hint.textContent = usage;
  });
  row = infoRow(
    t('settings.photos.onDeviceLabel'),
    '',
    () => openSheet(t('settings.photos.sheetTitle'), body),
    { icon: ICON.image, hint: t('settings.photos.calculating') },
  );
  return row;
}

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

/* ---------- Rodape ----------
 * A versao vem do nome do cache do service worker, nao de uma constante no
 * bundle: e a versao REALMENTE instalada. Uma constante diria a do arquivo que
 * acabou de carregar, que e justamente o que nao ajuda quando a pergunta e
 * "por que nao atualizou?". */

async function installedVersion() {
  try {
    const keys = await caches.keys();
    return keys.find((k) => k.startsWith(APP_CACHE_PREFIX)) || null;
  } catch {
    return null;
  }
}

function aboutFooter() {
  const version = infoRow(t('settings.about.version'), t('settings.about.noServiceWorker'), null, {
    icon: ICON.info, muted: true,
  });
  installedVersion().then((v) => {
    if (v) version.querySelector('[data-value]').textContent = v;
  });

  const licenses = infoRow(t('settings.about.licenses'), '', () => openSheet(
    t('settings.about.licenses'),
    node(html`
      <div class="stack">
        <p class="muted small" style="margin:0">${t('settings.about.licensesIntro')}</p>
        <p class="small" style="margin:0">${t('settings.about.licensesFonts')}</p>
        <p class="small" style="margin:0">${t('settings.about.licensesData')}</p>
      </div>
    `),
  ), { icon: ICON.steps, muted: true });

  return group(version, licenses);
}

/* ---------- Apagar tudo ----------
 * No fim e em vermelho, separado do resto: e o padrao pra acao destrutiva, e
 * aqui ela e irreversivel de verdade — nao ha servidor de onde recuperar. */

function dangerZone() {
  const button = node(html`
    <button class="btn btn--block btn--danger" data-delete-all>
      ${raw(ICON.trash)} ${t('settings.dangerZone.button')}
    </button>
  `);

  button.onclick = async () => {
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

  return group(button);
}
