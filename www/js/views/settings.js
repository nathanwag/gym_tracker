/* Voce: seus dados (backup, figuras), suas preferencias e a versao instalada.
 *
 * Chamava-se Ajustes. O nome mudou junto com a estrutura: depois que o backup
 * subiu pro topo, metade da tela deixou de ser ajuste e passou a ser o que e
 * seu — e o app nao tem servidor, entao isso e o assunto principal daqui. */

import * as db from '../db.js';
import { prepareBackup, exportBackup, readFile, restore } from '../backup.js';
import { MEDIA_CACHE, APP_CACHE_PREFIX, precacheMedia } from '../media.js';
import { parseWeightStep, MIN_STEP, MAX_STEP } from '../weight-step.js';
import { t } from '../i18n.js';
import {
  setTop, html, raw, node, toast, openSheet, closeSheet, onSheetClose, confirmSheet, pickSheet,
  fmtNum, isIOS, isStandalone, ICON,
} from '../ui.js';

const INCREMENTS = [0.5, 1, 1.25, 2, 2.5, 5, 10];

/* Valor-sentinela da opcao "Outro valor...": nao e numero, entao nunca
 * colide com um passo que a pessoa possa digitar. */
const CUSTOM = 'outro';

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

/** Linha de ajuste: a LINHA INTEIRA abre a folha de escolha, nao so o texto.
 *  Era um <select> nativo, cujo alvo de toque terminava no fim do texto — a
 *  seta ao lado nao respondia, que e onde a mao ia. E o menu do sistema nao
 *  obedece a paleta nem o tipo do app (ver pickSheet em ui.js). */
function pickerRow(label, options, value, onPick, custom = null) {
  const labelOf = (v) => options.find((o) => o.value === String(v))?.label
    ?? custom?.labelOf(v) ?? String(v);
  let current = String(value);

  // <button>, nao <div> com onclick: a linha inteira e o alvo, e como alvo ela
  // precisa receber foco pelo teclado e anunciar-se como acionavel.
  const row = node(html`
    <button type="button" class="set-row set-row--tap">
      <span class="set-row__k">${label}</span>
      <span class="set-row__v"><span data-value>${labelOf(current)}</span>${raw(ICON.down)}</span>
    </button>
  `);

  row.onclick = async () => {
    // Valor que nao esta na lista (digitado antes, ou vindo de um backup) marca
    // a propria linha "Outro valor..." — senao a folha abriria sem nada aceso.
    const known = !custom || options.some((o) => o.value === current);
    const list = custom ? [...options, { value: CUSTOM, label: custom.label }] : options;

    let picked = await pickSheet({ title: label, options: list, value: known ? current : CUSTOM });
    if (picked === CUSTOM) picked = await custom.ask(current);
    if (picked == null || picked === current) return;
    current = picked;
    row.querySelector('[data-value]').textContent = labelOf(picked);
    onPick(picked);
  };
  return row;
}

/** Linha so de leitura, com valor a direita. `onClick` a torna tocavel. */
function infoRow(label, value, onClick = null) {
  const tag = onClick ? 'button' : 'div';
  const row = node(html`
    <${raw(tag)} ${onClick ? raw('type="button"') : ''} class="set-row${onClick ? ' set-row--tap' : ''}">
      <span class="set-row__k">${label}</span>
      <span class="set-row__v"><span data-value>${value}</span>${onClick ? raw(ICON.chevron) : ''}</span>
    </${raw(tag)}>
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

function logSection(cfg) {
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
  );

  // fmtNum, e nao replace('.', ','): a virgula decimal e do idioma, e a lista
  // agora convive com valores digitados, que podem ter duas casas.
  const stepLabel = (v) => fmtNum(Number(v), 2);

  const step = pickerRow(
    t('settings.preferences.step.label'),
    INCREMENTS.map((v) => ({ value: String(v), label: stepLabel(v) })),
    cfg.weightIncrement,
    async (value) => {
      await db.setSetting('weightIncrement', Number(value));
      toast(t('settings.preferences.step.toast'));
    },
    { label: t('settings.preferences.step.custom'), labelOf: stepLabel, ask: askStep },
  );

  return section(t('settings.section.log'), unit, step);
}

/** Segundo nivel da folha do passo: o campo pra digitar um valor fora dos sete
 *  da lista (anilha de 1,5 kg, 5 lb em kg, maquina que so pula de 20 em 20).
 *  Devolve string, mesmo contrato do pickSheet, ou null se fechar sem valor. */
function askStep(current) {
  // A unidade e lida agora, e nao do cfg da abertura da tela: setSetting troca
  // o objeto inteiro, entao quem mudou de kg pra lb sem sair da tela veria a
  // unidade antiga aqui.
  const unit = db.settings().unit;
  const hint = t('settings.preferences.step.customHint', {
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
          <span class="field__label">${t('settings.preferences.step.customLabel')} <span class="muted">${unit}</span></span>
          <input class="input" data-step type="text" inputmode="decimal" enterkeyhint="done"
                 value="${fmtNum(Number(current), 2)}">
        </label>
        <p class="muted small" data-hint aria-live="polite" style="margin:0">${hint}</p>
        <button type="button" class="btn btn--primary btn--block" data-use>${t('common.save')}</button>
      </div>
    `);
    openSheet(t('settings.preferences.step.customTitle'), body);
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

function lookSection(cfg) {
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
