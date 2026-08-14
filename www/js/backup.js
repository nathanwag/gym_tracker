/* Exportacao e restauracao do banco em JSON.
 *
 * O backup nao e um extra: como os dados vivem so no aparelho, ele e a unica
 * forma de trocar de celular ou se recuperar de uma limpeza de dados.
 *
 * No iPhone o caminho normal da web nao funciona: dentro de um PWA instalado,
 * um <a download> simplesmente nao faz nada. Quem entrega o arquivo la e a API
 * de compartilhamento, que abre a folha do sistema e permite salvar em
 * Arquivos/iCloud ou mandar por AirDrop. Por isso a ordem de tentativas e:
 *   1. navigator.share com arquivo  (iOS e Android modernos)
 *   2. <a download>                 (desktop)
 *   3. area de transferencia        (ultimo recurso)
 */

import * as db from './db.js';

const FORMATO = 'treino-backup';
const VERSAO = 1;

/**
 * Monta o backup. Deve ser chamado ANTES do toque do usuario sempre que
 * possivel: o Safari exige que navigator.share() aconteca durante o gesto, e
 * um await longo no meio do caminho pode invalidar essa permissao.
 */
export async function prepararBackup() {
  const dados = await db.dumpAll();
  const payload = {
    formato: FORMATO,
    versao: VERSAO,
    exportadoEm: new Date().toISOString(),
    exercises: dados.exercises,
    workouts: dados.workouts,
    sets: dados.sets,
    settings: dados.settings,
  };

  const json = JSON.stringify(payload);
  const nome = `treino-${new Date().toISOString().slice(0, 10)}.json`;

  let arquivo = null;
  try {
    arquivo = new File([json], nome, { type: 'application/json' });
  } catch { /* navegador antigo sem construtor de File */ }

  return {
    json,
    nome,
    arquivo,
    resumo: {
      exercicios: dados.exercises.length,
      treinos: dados.workouts.length,
      series: dados.sets.length,
      tamanho: json.length,
    },
  };
}

/** @returns {Promise<'compartilhado'|'cancelado'|'baixado'|'copiado'|'manual'>} */
export async function exportar(backup, { podeBaixar = true } = {}) {
  if (backup.arquivo && navigator.canShare?.({ files: [backup.arquivo] })) {
    try {
      await navigator.share({ files: [backup.arquivo], title: backup.nome });
      return 'compartilhado';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelado';
      // Qualquer outra falha cai para as alternativas abaixo.
    }
  }

  if (podeBaixar) {
    try {
      const url = URL.createObjectURL(new Blob([backup.json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = backup.nome;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return 'baixado';
    } catch { /* segue para a area de transferencia */ }
  }

  try {
    await navigator.clipboard.writeText(backup.json);
    return 'copiado';
  } catch {
    return 'manual';
  }
}

/** Le e valida um arquivo escolhido pelo usuario. Lanca erro se nao servir. */
export async function lerArquivo(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error('Este arquivo não é um JSON válido.');
  }
  return validar(payload);
}

export function validar(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Arquivo de backup vazio ou inválido.');

  const { exercises, workouts, sets, settings = [] } = payload;
  if (!Array.isArray(exercises) || !Array.isArray(workouts) || !Array.isArray(sets)) {
    throw new Error('Arquivo não parece um backup do Treino (faltam exercícios, treinos ou séries).');
  }
  if (payload.formato && payload.formato !== FORMATO) {
    throw new Error(`Formato desconhecido: ${payload.formato}`);
  }
  if (payload.versao && payload.versao > VERSAO) {
    throw new Error('Este backup foi gerado por uma versão mais nova do app.');
  }

  const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  return {
    exercises: exercises.map((e) => ({
      id: numero(e.id),
      nome: String(e.nome || 'Exercício'),
      grupoMuscular: String(e.grupoMuscular || 'Outros'),
      personalizado: Boolean(e.personalizado),
      criadoEm: e.criadoEm || new Date().toISOString(),
    })),
    workouts: workouts.map((w) => ({
      id: numero(w.id),
      data: w.data || String(w.iniciadoEm || '').slice(0, 10),
      iniciadoEm: w.iniciadoEm || new Date().toISOString(),
      finalizadoEm: w.finalizadoEm || null,
      notas: w.notas || '',
      exerciseIds: Array.isArray(w.exerciseIds) ? w.exerciseIds.map(numero) : [],
    })),
    sets: sets.map((s) => ({
      id: numero(s.id),
      workoutId: numero(s.workoutId),
      exerciseId: numero(s.exerciseId),
      peso: numero(s.peso),
      reps: Math.round(numero(s.reps)),
      aquecimento: Boolean(s.aquecimento),
      criadoEm: s.criadoEm || new Date().toISOString(),
    })),
    settings: Array.isArray(settings) ? settings.filter((s) => s && s.key) : [],
  };
}

/** Substitui tudo que esta no aparelho pelo conteudo do backup. */
export async function restaurar(dados) {
  await db.replaceAll(dados);
  await db.getSettings();
}
