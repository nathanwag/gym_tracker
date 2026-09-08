/* Backup: exportar e restaurar o banco.
 *
 * Tem tela propria porque nao e ajuste, e a rede de seguranca inteira: sem
 * servidor, um aparelho perdido leva junto todo o historico. Dentro de
 * Configuracoes isso era um paragrafo com dois botoes no meio da rolagem,
 * pesando mais que qualquer ajuste em volta.
 *
 * O numero grande e "ha quantos dias voce nao exporta" — a unica medida de
 * risco que o app consegue mostrar. */

import * as db from '../db.js';
import { prepareBackup, exportBackup, readFile, restore } from '../backup.js';
import { daysSince } from '../profile.js';
import { t, tn } from '../i18n.js';
import {
  setTop, html, raw, node, toast, openSheet, confirmSheet, infoRow, isIOS, isStandalone, ICON,
} from '../ui.js';

export async function render(view) {
  setTop({ title: t('backup.title'), back: '#/ajustes' });

  // O backup e montado ja na abertura da tela: no Safari, navigator.share()
  // precisa acontecer durante o toque, sem esperar por uma leitura do banco.
  let backup = null;
  const backupReady = prepareBackup().then((b) => { backup = b; return b; });

  const days = daysSince(db.settings().lastBackupAt);

  const root = node(html`
    <div class="stack">
      <p class="muted small" style="margin:0">${t('backup.explanation')}</p>

      <div data-hero>${raw(hero(days))}</div>
      <div class="week__sub tnum" data-summary>${t('backup.preparing')}</div>

      <button class="btn btn--primary btn--block" data-export style="margin-top:8px">${t('backup.export')}</button>
      <button class="btn btn--block" data-import>${t('backup.import')}</button>
      <input type="file" accept="application/json,.json" data-file hidden>
    </div>
  `);

  backupReady.then((b) => {
    root.querySelector('[data-summary]').textContent = t('backup.summary', {
      workouts: b.summary.workouts, sets: b.summary.sets, exercises: b.summary.exercises,
    });
  });

  root.querySelector('[data-export]').onclick = async () => {
    const b = backup || await backupReady;
    // Num PWA instalado no iOS o <a download> nao faz nada; melhor cair direto
    // na area de transferencia do que dar a impressao de que salvou.
    const canDownload = !(isIOS() && isStandalone());
    const result = await exportBackup(b, { canDownload });

    // So conta como backup o que saiu do app de fato: uma folha cancelada nao
    // pode zerar o contador de dias, que e justamente o aviso de risco.
    if (result === 'shared' || result === 'downloaded' || result === 'copied') {
      await db.setSetting('lastBackupAt', new Date().toISOString());
      root.querySelector('[data-hero]').innerHTML = hero(0);
    }

    if (result === 'shared') toast(t('backup.toastShared'));
    else if (result === 'downloaded') toast(t('backup.toastDownloaded'));
    else if (result === 'cancelled') toast(t('backup.toastCancelled'));
    else if (result === 'copied') { toast(t('backup.toastCopied')); showJson(b); }
    else showJson(b);
  };

  const input = root.querySelector('[data-file]');
  root.querySelector('[data-import]').onclick = () => input.click();

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
      title: t('backup.confirmRestore.title'),
      message: t('backup.confirmRestore.message', { workouts: data.workouts.length, sets: data.sets.length }),
      confirmLabel: t('backup.restore'),
      danger: true,
    });
    if (!ok) return;

    await restore(data);
    toast(t('backup.toastRestored'));
    location.hash = '#/';
  };

  // A conta vive aqui, e nao em Configuracoes: o assunto e este — como os
  // treinos saem deste aparelho.
  const account = infoRow(t('settings.data.account'), t('settings.data.soon'), null, {
    icon: ICON.person, hint: t('settings.data.accountHint'), muted: true,
  });
  const group = node('<div class="sec"><div data-body></div></div>');
  group.querySelector('[data-body]').append(account);

  view.append(root, group);
}

/* Sem nenhum backup ainda nao ha numero: "—" no tamanho do dado vira um traco
 * preto do tamanho de um dedo, e um zero mentiria (zero dia = exportou hoje). */
function hero(days) {
  if (days == null) return html`<p class="empty" style="margin:6px 0 0">${t('backup.never')}</p>`;
  return html`
    <div class="week__big week__big--sm" style="margin-top:6px">
      <span class="data">${days}</span>
      <span class="week__unit">${tn('backup.daysSince', days)}</span>
    </div>
  `;
}

function showJson(backup) {
  const body = node(html`
    <div class="stack">
      <p class="muted small" style="margin:0">${t('backup.manual.explanation')}</p>
      <textarea class="input" style="height:220px;padding:10px;font-family:monospace;font-size:12px"
                readonly>${backup.json}</textarea>
      <button class="btn btn--primary btn--block" data-copy>${t('backup.manual.copyAll')}</button>
    </div>
  `);
  openSheet(t('backup.manual.title'), body);

  const area = body.querySelector('textarea');
  body.querySelector('[data-copy]').onclick = async () => {
    area.select();
    try {
      await navigator.clipboard.writeText(backup.json);
      toast(t('backup.manual.toastCopied'));
    } catch {
      toast(t('backup.manual.toastCopyFailed'));
    }
  };
}
