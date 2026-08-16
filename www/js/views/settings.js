/* Ajustes: backup, preferencias e informacoes. */

import * as db from '../db.js';
import { prepararBackup, exportar, lerArquivo, restaurar } from '../backup.js';
import {
  setTop, html, raw, node, toast, openSheet, confirmSheet, isIOS, isStandalone, ICON,
} from '../ui.js';

const INCREMENTOS = [0.5, 1, 1.25, 2, 2.5, 5, 10];

export async function render(view) {
  setTop({ title: 'Ajustes', barra: false });

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
      <button class="atalho" type="button" data-abrir-backup>${raw(ICON.download)}<span>Backup</span></button>
      <button class="atalho" type="button" data-abrir-figuras>${raw(ICON.image)}<span>Figuras</span></button>
    </div>
  `);
  // Montados uma unica vez e reaproveitados a cada abertura do sheet: o de
  // Figuras registra um listener de mensagem do service worker que nao pode
  // se acumular a cada toque.
  const backupNode = backupBody(backupPronto, obterBackup);
  const figurasNode = figurasBody();
  el.querySelector('[data-abrir-backup]').onclick = () => openSheet('Backup', backupNode);
  el.querySelector('[data-abrir-figuras]').onclick = () => openSheet('Figuras dos exercícios', figurasNode);
  return el;
}

/* ---------- Backup ---------- */

function backupBody(backupPronto, obterBackup) {
  const corpo = node(html`
    <div class="stack">
      <p class="muted small" style="margin:0">
        Seus treinos ficam salvos só neste aparelho. Exporte um arquivo de vez em quando —
        é o que permite trocar de celular ou recuperar tudo se os dados do navegador forem limpos.
      </p>
      <p class="small tnum" data-resumo style="margin:0">Preparando…</p>
      <button class="btn btn--primary btn--block" data-exportar>Exportar treinos</button>
      <button class="btn btn--block" data-importar>Importar backup</button>
      <input type="file" accept="application/json,.json" data-arquivo hidden>
    </div>
  `);

  backupPronto.then((b) => {
    corpo.querySelector('[data-resumo]').textContent =
      `${b.resumo.treinos} treinos · ${b.resumo.series} séries · ${b.resumo.exercicios} exercícios`;
  });

  corpo.querySelector('[data-exportar]').onclick = async () => {
    const b = obterBackup() || await backupPronto;
    // Num PWA instalado no iOS o <a download> nao faz nada; melhor cair direto
    // na area de transferencia do que dar a impressao de que salvou.
    const podeBaixar = !(isIOS() && isStandalone());
    const resultado = await exportar(b, { podeBaixar });

    if (resultado === 'compartilhado') toast('Backup enviado. Salve em Arquivos ou iCloud.');
    else if (resultado === 'baixado') toast('Arquivo baixado.');
    else if (resultado === 'cancelado') toast('Exportação cancelada.');
    else if (resultado === 'copiado') { toast('Backup copiado. Cole num app de notas e guarde.'); mostrarJson(b); }
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
      title: 'Restaurar este backup?',
      message: `O arquivo tem ${dados.workouts.length} treinos e ${dados.sets.length} séries. `
        + 'Tudo que está hoje no aparelho será substituído.',
      confirmLabel: 'Restaurar',
      danger: true,
    });
    if (!ok) return;

    await restaurar(dados);
    toast('Backup restaurado.');
    location.hash = '#/';
  };

  return corpo;
}

function mostrarJson(backup) {
  const corpo = node(html`
    <div class="stack">
      <p class="muted small" style="margin:0">
        Não foi possível salvar o arquivo automaticamente. Copie o texto abaixo e guarde
        num app de notas ou envie para você mesmo.
      </p>
      <textarea class="input" style="height:220px;padding:10px;font-family:monospace;font-size:12px"
                readonly>${backup.json}</textarea>
      <button class="btn btn--primary btn--block" data-copiar>Copiar tudo</button>
    </div>
  `);
  openSheet('Backup manual', corpo);

  const area = corpo.querySelector('textarea');
  corpo.querySelector('[data-copiar]').onclick = async () => {
    area.select();
    try {
      await navigator.clipboard.writeText(backup.json);
      toast('Copiado.');
    } catch {
      toast('Use "Selecionar tudo" e copie manualmente.');
    }
  };
}

/* ---------- Preferencias ---------- */

function cardPreferencias(cfg) {
  const card = node(html`
    <div>
      <h2 class="section-title" style="margin-top:4px">Configurações</h2>
      <div class="card card__pad stack">
        <label class="field">
          <span class="field__label">Unidade de peso</span>
          <select class="select" data-unidade>
            <option value="kg"${cfg.unidade === 'kg' ? ' selected' : ''}>Quilos (kg)</option>
            <option value="lb"${cfg.unidade === 'lb' ? ' selected' : ''}>Libras (lb)</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">Passo do botão de peso</span>
          <select class="select" data-incremento>
            ${raw(INCREMENTOS.map((v) =>
              `<option value="${v}"${Number(cfg.incrementoPeso) === v ? ' selected' : ''}>${String(v).replace('.', ',')}</option>`).join(''))}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Tema</span>
          <select class="select" data-tema>
            <option value="auto"${cfg.tema === 'auto' ? ' selected' : ''}>Igual ao sistema</option>
            <option value="escuro"${cfg.tema === 'escuro' ? ' selected' : ''}>Escuro</option>
            <option value="claro"${cfg.tema === 'claro' ? ' selected' : ''}>Claro</option>
          </select>
        </label>
      </div>
    </div>
  `);

  card.querySelector('[data-unidade]').onchange = async (e) => {
    await db.setSetting('unidade', e.target.value);
    toast('Unidade atualizada.');
  };
  card.querySelector('[data-incremento]').onchange = async (e) => {
    await db.setSetting('incrementoPeso', Number(e.target.value));
    toast('Passo atualizado.');
  };
  card.querySelector('[data-tema]').onchange = async (e) => {
    await db.setSetting('tema', e.target.value);
    window.dispatchEvent(new CustomEvent('tema:mudou', { detail: e.target.value }));
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
      <p class="muted small" style="margin:0">
        Cada exercício tem duas fotos — posição inicial e final — que alternam para mostrar
        o movimento. As miniaturas vêm junto com o app; as fotos grandes são baixadas na
        primeira vez que você abre cada exercício e ficam salvas.
      </p>
      <p class="small tnum" data-uso style="margin:0">Calculando…</p>
      <button class="btn btn--block" data-baixar>Baixar figuras para uso offline</button>
      <button class="btn btn--block btn--ghost" data-apagar>Apagar figuras baixadas</button>
    </div>
  `);

  const uso = corpo.querySelector('[data-uso]');
  const baixar = corpo.querySelector('[data-baixar]');

  const atualizarUso = async () => {
    try {
      const cache = await caches.open('treino-midia');
      const total = (await cache.keys()).length;
      const est = await navigator.storage?.estimate?.().catch(() => null);
      const mb = est?.usage ? ` · ${(est.usage / 1024 / 1024).toFixed(1)} MB no aparelho` : '';
      uso.textContent = total ? `${total} figuras salvas${mb}` : 'Nenhuma figura salva ainda.';
    } catch {
      uso.textContent = 'Cache de figuras indisponível neste navegador.';
    }
  };

  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.tipo === 'precache-midia:progresso') {
      baixar.textContent = `Baixando… ${e.data.feitos}/${e.data.total}`;
    } else if (e.data?.tipo === 'precache-midia:fim') {
      baixar.textContent = 'Baixar figuras para uso offline';
      baixar.disabled = false;
      toast(e.data.total ? `${e.data.total} figuras baixadas.` : 'Já estava tudo salvo.');
      atualizarUso();
    }
  });

  baixar.onclick = async () => {
    baixar.disabled = true;
    baixar.textContent = 'Preparando…';
    const { precacheMidia } = await import('../app.js');
    const iniciou = await precacheMidia({ forcar: true });
    if (!iniciou) {
      baixar.textContent = 'Baixar figuras para uso offline';
      baixar.disabled = false;
      toast('Não foi possível iniciar o download.');
    }
  };

  corpo.querySelector('[data-apagar]').onclick = async () => {
    const ok = await confirmSheet({
      title: 'Apagar figuras baixadas?',
      message: 'Elas voltam a ser baixadas conforme você abrir cada exercício.',
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (!ok) return;
    await caches.delete('treino-midia');
    await db.setSetting('midiaPrecacheVersao', '');
    toast('Figuras apagadas.');
    atualizarUso();
  };

  atualizarUso();
  return corpo;
}

/* ---------- Apagar tudo ---------- */

function cardApagarTudo() {
  const card = node(html`
    <div>
      <h2 class="section-title">Zona de risco</h2>
      <div class="card card__pad">
        <button class="btn btn--block btn--danger" data-apagar>Apagar todos os dados</button>
      </div>
    </div>
  `);

  card.querySelector('[data-apagar]').onclick = async () => {
    const ok = await confirmSheet({
      title: 'Apagar tudo?',
      message: 'Todos os treinos, séries e exercícios personalizados serão perdidos. '
        + 'Exporte um backup antes se quiser guardar o histórico.',
      confirmLabel: 'Apagar tudo',
      danger: true,
    });
    if (!ok) return;

    await db.resetAll();
    await db.getSettings();
    toast('Tudo apagado.');
    location.hash = '#/';
  };

  return card;
}
