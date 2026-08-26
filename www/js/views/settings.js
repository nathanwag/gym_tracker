/* Ajustes: backup, preferencias e informacoes. */

import * as db from '../db.js';
import { prepararBackup, exportar, lerArquivo, restaurar } from '../backup.js';
import { MEDIA_CACHE, precacheMidia } from '../media.js';
import { t } from '../i18n.js';
import {
  setTop, html, raw, node, toast, openSheet, confirmSheet, isIOS, isStandalone, ICON,
} from '../ui.js';

const INCREMENTOS = [0.5, 1, 1.25, 2, 2.5, 5, 10];

export async function render(view) {
  setTop({ title: t('settings.titulo'), barra: false });

  const cfg = db.settings();
  const root = node('<div class="stack"></div>');

  // O backup e montado ja na abertura da tela: no Safari, navigator.share()
  // precisa acontecer durante o toque, sem esperar por uma leitura do banco.
  let backup = null;
  const backupPronto = prepararBackup().then((b) => { backup = b; return b; });

  root.append(cardPreferencias(cfg));
  root.append(atalhos(backupPronto, () => backup));
  root.append(cardApagarTudo());

  view.append(root);
}

/* ---------- Atalhos: Backup e Figuras abrem num sheet em vez de ocupar
 * espaco fixo na tela — sao acoes ocasionais, ao contrario das preferencias
 * logo acima, que se mexe toda vez que se abre Ajustes. ---------- */

function atalhos(backupPronto, obterBackup) {
  const el = node(html`
    <div class="atalhos">
      <button class="atalho" type="button" data-abrir-backup>${raw(ICON.download)}<span>${t('settings.atalhos.backup')}</span></button>
      <button class="atalho" type="button" data-abrir-figuras>${raw(ICON.image)}<span>${t('settings.atalhos.figuras')}</span></button>
    </div>
  `);
  // Montados uma unica vez e reaproveitados a cada abertura do sheet: o de
  // Figuras registra um listener de mensagem do service worker que nao pode
  // se acumular a cada toque.
  const backupNode = backupBody(backupPronto, obterBackup);
  const figurasNode = figurasBody();
  el.querySelector('[data-abrir-backup]').onclick = () => openSheet(t('settings.atalhos.backup'), backupNode);
  el.querySelector('[data-abrir-figuras]').onclick = () => openSheet(t('settings.figuras.tituloSheet'), figurasNode);
  return el;
}

/* ---------- Backup ---------- */

function backupBody(backupPronto, obterBackup) {
  const corpo = node(html`
    <div class="stack">
      <p class="muted small" style="margin:0">${t('settings.backup.explicacao')}</p>
      <p class="small tnum" data-resumo style="margin:0">${t('settings.backup.preparando')}</p>
      <button class="btn btn--primary btn--block" data-exportar>${t('settings.backup.exportar')}</button>
      <button class="btn btn--block" data-importar>${t('settings.backup.importar')}</button>
      <input type="file" accept="application/json,.json" data-arquivo hidden>
    </div>
  `);

  backupPronto.then((b) => {
    corpo.querySelector('[data-resumo]').textContent =
      t('settings.backup.resumo', { treinos: b.resumo.treinos, series: b.resumo.series, exercicios: b.resumo.exercicios });
  });

  corpo.querySelector('[data-exportar]').onclick = async () => {
    const b = obterBackup() || await backupPronto;
    // Num PWA instalado no iOS o <a download> nao faz nada; melhor cair direto
    // na area de transferencia do que dar a impressao de que salvou.
    const podeBaixar = !(isIOS() && isStandalone());
    const resultado = await exportar(b, { podeBaixar });

    if (resultado === 'compartilhado') toast(t('settings.backup.toastCompartilhado'));
    else if (resultado === 'baixado') toast(t('settings.backup.toastBaixado'));
    else if (resultado === 'cancelado') toast(t('settings.backup.toastCancelado'));
    else if (resultado === 'copiado') { toast(t('settings.backup.toastCopiado')); mostrarJson(b); }
    else mostrarJson(b);
  };

  const input = corpo.querySelector('[data-arquivo]');
  corpo.querySelector('[data-importar]').onclick = () => input.click();

  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    let dados;
    try {
      dados = await lerArquivo(file);
    } catch (err) {
      toast(err.message);
      return;
    }

    const ok = await confirmSheet({
      title: t('settings.backup.confirmarRestaurar.titulo'),
      message: t('settings.backup.confirmarRestaurar.mensagem', { treinos: dados.workouts.length, series: dados.sets.length }),
      confirmLabel: t('settings.backup.restaurar'),
      danger: true,
    });
    if (!ok) return;

    await restaurar(dados);
    toast(t('settings.backup.toastRestaurado'));
    location.hash = '#/';
  };

  return corpo;
}

function mostrarJson(backup) {
  const corpo = node(html`
    <div class="stack">
      <p class="muted small" style="margin:0">${t('settings.backup.manual.explicacao')}</p>
      <textarea class="input" style="height:220px;padding:10px;font-family:monospace;font-size:12px"
                readonly>${backup.json}</textarea>
      <button class="btn btn--primary btn--block" data-copiar>${t('settings.backup.manual.copiarTudo')}</button>
    </div>
  `);
  openSheet(t('settings.backup.manual.titulo'), corpo);

  const area = corpo.querySelector('textarea');
  corpo.querySelector('[data-copiar]').onclick = async () => {
    area.select();
    try {
      await navigator.clipboard.writeText(backup.json);
      toast(t('settings.backup.manual.toastCopiado'));
    } catch {
      toast(t('settings.backup.manual.toastFalhaCopia'));
    }
  };
}

/* ---------- Preferencias ---------- */

function cardPreferencias(cfg) {
  const card = node(html`
    <div>
      <h2 class="section-title" style="margin-top:4px">${t('settings.preferencias.titulo')}</h2>
      <div class="card card__pad stack">
        <label class="field">
          <span class="field__label">${t('settings.preferencias.unidade.label')}</span>
          <select class="select" data-unidade>
            <option value="kg"${cfg.unidade === 'kg' ? ' selected' : ''}>${t('settings.preferencias.unidade.kg')}</option>
            <option value="lb"${cfg.unidade === 'lb' ? ' selected' : ''}>${t('settings.preferencias.unidade.lb')}</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">${t('settings.preferencias.passo.label')}</span>
          <select class="select" data-incremento>
            ${raw(INCREMENTOS.map((v) =>
              `<option value="${v}"${Number(cfg.incrementoPeso) === v ? ' selected' : ''}>${String(v).replace('.', ',')}</option>`).join(''))}
          </select>
        </label>
        <label class="field">
          <span class="field__label">${t('settings.preferencias.tema.label')}</span>
          <select class="select" data-tema>
            <option value="auto"${cfg.tema === 'auto' ? ' selected' : ''}>${t('settings.preferencias.tema.auto')}</option>
            <option value="escuro"${cfg.tema === 'escuro' ? ' selected' : ''}>${t('settings.preferencias.tema.escuro')}</option>
            <option value="claro"${cfg.tema === 'claro' ? ' selected' : ''}>${t('settings.preferencias.tema.claro')}</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">${t('settings.preferencias.idioma.label')}</span>
          <select class="select" data-idioma>
            <option value="pt"${cfg.idioma === 'pt' ? ' selected' : ''}>${t('settings.preferencias.idioma.pt')}</option>
            <option value="en"${cfg.idioma === 'en' ? ' selected' : ''}>${t('settings.preferencias.idioma.en')}</option>
          </select>
        </label>
      </div>
    </div>
  `);

  card.querySelector('[data-unidade]').onchange = async (e) => {
    await db.setSetting('unidade', e.target.value);
    toast(t('settings.preferencias.unidade.toast'));
  };
  card.querySelector('[data-incremento]').onchange = async (e) => {
    await db.setSetting('incrementoPeso', Number(e.target.value));
    toast(t('settings.preferencias.passo.toast'));
  };
  card.querySelector('[data-tema]').onchange = async (e) => {
    await db.setSetting('tema', e.target.value);
    window.dispatchEvent(new CustomEvent('tema:mudou', { detail: e.target.value }));
  };
  card.querySelector('[data-idioma]').onchange = async (e) => {
    await db.setSetting('idioma', e.target.value);
    window.dispatchEvent(new CustomEvent('idioma:mudou', { detail: e.target.value }));
  };

  return card;
}

/* ---------- Figuras ---------- */

/* As fotos podem chegar a dezenas de MB no aparelho. Um cache desse tamanho
 * precisa ser visivel e reversivel — e este e o plano B para quando o download
 * automatico decidir nao rodar (conexao celular, economia de dados). */
function figurasBody() {
  const corpo = node(html`
    <div class="stack">
      <p class="muted small" style="margin:0">${t('settings.figuras.explicacao')}</p>
      <p class="small tnum" data-uso style="margin:0">${t('settings.figuras.calculando')}</p>
      <button class="btn btn--block" data-baixar>${t('settings.figuras.baixar')}</button>
      <button class="btn btn--block btn--ghost" data-apagar>${t('settings.figuras.apagarBaixadas')}</button>
    </div>
  `);

  const uso = corpo.querySelector('[data-uso]');
  const baixar = corpo.querySelector('[data-baixar]');

  const atualizarUso = async () => {
    try {
      const cache = await caches.open(MEDIA_CACHE);
      const total = (await cache.keys()).length;
      const est = await navigator.storage?.estimate?.().catch(() => null);
      const mb = est?.usage ? ` · ${(est.usage / 1024 / 1024).toFixed(1)} MB${t('settings.figuras.noAparelho')}` : '';
      uso.textContent = total ? `${t('settings.figuras.salvas', { n: total })}${mb}` : t('settings.figuras.nenhumaSalva');
    } catch {
      uso.textContent = t('settings.figuras.cacheIndisponivel');
    }
  };

  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.tipo === 'precache-midia:progresso') {
      baixar.textContent = t('settings.figuras.baixando', { feitos: e.data.feitos, total: e.data.total });
    } else if (e.data?.tipo === 'precache-midia:fim') {
      baixar.textContent = t('settings.figuras.baixar');
      baixar.disabled = false;
      toast(e.data.total ? t('settings.figuras.toastBaixadas', { n: e.data.total }) : t('settings.figuras.toastJaEstava'));
      atualizarUso();
    }
  });

  baixar.onclick = async () => {
    baixar.disabled = true;
    baixar.textContent = t('settings.figuras.preparando');
    const iniciou = await precacheMidia({ forcar: true });
    if (!iniciou) {
      baixar.textContent = t('settings.figuras.baixar');
      baixar.disabled = false;
      toast(t('settings.figuras.toastFalhaDownload'));
    }
  };

  corpo.querySelector('[data-apagar]').onclick = async () => {
    const ok = await confirmSheet({
      title: t('settings.figuras.confirmarApagar.titulo'),
      message: t('settings.figuras.confirmarApagar.mensagem'),
      confirmLabel: t('common.apagar'),
      danger: true,
    });
    if (!ok) return;
    await caches.delete(MEDIA_CACHE);
    await db.setSetting('midiaPrecacheVersao', '');
    toast(t('settings.figuras.toastApagadas'));
    atualizarUso();
  };

  atualizarUso();
  return corpo;
}

/* ---------- Apagar tudo ---------- */

function cardApagarTudo() {
  const card = node(html`
    <div>
      <h2 class="section-title">${t('settings.zonaRisco.titulo')}</h2>
      <div class="card card__pad">
        <button class="btn btn--block btn--danger" data-apagar>${t('settings.zonaRisco.botao')}</button>
      </div>
    </div>
  `);

  card.querySelector('[data-apagar]').onclick = async () => {
    const ok = await confirmSheet({
      title: t('settings.zonaRisco.confirmar.titulo'),
      message: t('settings.zonaRisco.confirmar.mensagem'),
      confirmLabel: t('settings.zonaRisco.confirmar.label'),
      danger: true,
    });
    if (!ok) return;

    await db.resetAll();
    await db.getSettings();
    toast(t('settings.zonaRisco.toastApagado'));
    location.hash = '#/';
  };

  return card;
}
