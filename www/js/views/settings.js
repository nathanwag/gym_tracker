/* Ajustes: backup, preferencias e informacoes. */

import * as db from '../db.js';
import { prepararBackup, exportar, lerArquivo, restaurar } from '../backup.js';
import {
  setTop, html, raw, node, toast, openSheet, confirmSheet, isIOS, isStandalone,
} from '../ui.js';

const INCREMENTOS = [0.5, 1, 1.25, 2, 2.5, 5, 10];

export async function render(view) {
  setTop({ title: 'Ajustes' });

  const cfg = db.settings();
  const root = node('<div class="stack"></div>');

  // O backup e montado ja na abertura da tela: no Safari, navigator.share()
  // precisa acontecer durante o toque, sem esperar por uma leitura do banco.
  let backup = null;
  const backupPronto = prepararBackup().then((b) => { backup = b; return b; });

  root.append(await cardBackup(backupPronto, () => backup));
  root.append(cardPreferencias(cfg));
  root.append(cardExercicios());
  root.append(cardFiguras());
  root.append(cardSobre());
  root.append(cardApagarTudo());

  view.append(root);
}

/* ---------- Backup ---------- */

async function cardBackup(backupPronto, obterBackup) {
  const card = node(html`
    <div>
      <h2 class="section-title" style="margin-top:4px">Backup</h2>
      <div class="card card__pad">
        <p class="muted small">
          Seus treinos ficam salvos só neste aparelho. Exporte um arquivo de vez em quando —
          é o que permite trocar de celular ou recuperar tudo se os dados do navegador forem limpos.
        </p>
        <p class="small tnum" data-resumo style="margin-bottom:12px">Preparando…</p>
        <button class="btn btn--primary btn--block" data-exportar>Exportar treinos</button>
        <button class="btn btn--block" style="margin-top:8px" data-importar>Importar backup</button>
        <input type="file" accept="application/json,.json" data-arquivo hidden>
      </div>
    </div>
  `);

  backupPronto.then((b) => {
    card.querySelector('[data-resumo]').textContent =
      `${b.resumo.treinos} treinos · ${b.resumo.series} séries · ${b.resumo.exercicios} exercícios`;
  });

  card.querySelector('[data-exportar]').onclick = async () => {
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

  const input = card.querySelector('[data-arquivo]');
  card.querySelector('[data-importar]').onclick = () => input.click();

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

  return card;
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
      <h2 class="section-title">Preferências</h2>
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

function cardExercicios() {
  return node(html`
    <div>
      <h2 class="section-title">Exercícios</h2>
      <div class="card">
        <ul class="list">
          <li class="list__item">
            <a class="list__link" href="#/exercicios">
              <div class="grow">
                <div style="font-weight:600">Gerenciar exercícios</div>
                <div class="muted small">Criar, renomear ou apagar exercícios da biblioteca</div>
              </div>
            </a>
          </li>
        </ul>
      </div>
    </div>
  `);
}

/* ---------- Figuras ---------- */

/* As fotos podem chegar a dezenas de MB no aparelho. Um cache desse tamanho
 * precisa ser visivel e reversivel — e este e o plano B para quando o download
 * automatico decidir nao rodar (conexao celular, economia de dados). */
function cardFiguras() {
  const card = node(html`
    <div>
      <h2 class="section-title">Figuras dos exercícios</h2>
      <div class="card card__pad">
        <p class="muted small">
          Cada exercício tem duas fotos — posição inicial e final — que alternam para mostrar
          o movimento. As miniaturas vêm junto com o app; as fotos grandes são baixadas na
          primeira vez que você abre cada exercício e ficam salvas.
        </p>
        <p class="small tnum" data-uso style="margin:10px 0 12px">Calculando…</p>
        <button class="btn btn--block" data-baixar>Baixar figuras para uso offline</button>
        <button class="btn btn--block btn--ghost" style="margin-top:8px" data-apagar>
          Apagar figuras baixadas
        </button>
      </div>
    </div>
  `);

  const uso = card.querySelector('[data-uso]');
  const baixar = card.querySelector('[data-baixar]');

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

  card.querySelector('[data-apagar]').onclick = async () => {
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
  return card;
}

/* ---------- Sobre ---------- */

function cardSobre() {
  const instalado = isStandalone();
  const dicaInstalacao = isIOS()
    ? 'No Safari: Compartilhar → Adicionar à Tela de Início.'
    : 'No menu do navegador: Instalar app.';

  return node(html`
    <div>
      <h2 class="section-title">Sobre</h2>
      <div class="card card__pad">
        <p class="small" style="margin-bottom:10px">
          <b>1RM estimado</b> é a carga que você levantaria uma única vez, calculada pela fórmula de
          Epley: <span class="tnum">peso × (1 + reps ÷ 30)</span>. É o número que permite comparar
          8×60 ${db.settings().unidade} com 5×70 ${db.settings().unidade} e saber se você evoluiu.
        </p>
        <p class="small" style="margin-bottom:10px">
          <b>Volume</b> é peso × repetições somado. Séries marcadas como aquecimento ficam fora
          dos recordes e dos gráficos.
        </p>
        <p class="muted small" style="margin-bottom:10px">
          Fotos e instruções dos exercícios vêm do free-exercise-db, de domínio público.
        </p>
        <p class="muted small" style="margin-bottom:0">
          ${instalado
            ? 'App instalado na tela de início. Os dados ficam protegidos da limpeza automática do navegador.'
            : `Ainda não instalado. ${dicaInstalacao}`}
        </p>
      </div>
    </div>
  `);
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
