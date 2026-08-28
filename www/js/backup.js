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
import { slugByName } from './seed.js';
import { normalizeName } from './text.js';
import { t } from './i18n.js';

// Valor da string NAO muda: um backup exportado antes desta mudanca ainda
// tem "treino-backup" gravado, e validate() precisa reconhecer esse valor
// pra sempre — mesma excecao permanente que DB_NAME em db.js.
const FORMAT = 'treino-backup';
// Continua 1 mesmo com o `slug` novo ou com os nomes de campo em ingles: o
// formato so ganhou campo aditivo/opcional e leitura compativel com nome de
// campo antigo (ver validate()) — nunca ficou incapaz de ler um arquivo
// anterior, que e o unico motivo real pra bumpar isto.
const VERSION = 1;

// Mesmo mapeamento da migracao v3 em db.js — duplicado aqui de proposito
// (sao 6 pares, nao vale a pena compartilhar um modulo so pra isso) pra um
// backup exportado antes da mudanca continuar restaurando as preferencias
// certas, em vez de voltar tudo pro padrao de fabrica.
const SETTINGS_KEY_MAP = {
  unidade: 'unit',
  tema: 'theme',
  idioma: 'language',
  incrementoPeso: 'weightIncrement',
  incrementoReps: 'repsIncrement',
  midiaPrecacheVersao: 'mediaPrecacheVersion',
};
const THEME_VALUE_MAP = { claro: 'light', escuro: 'dark' };

function remapSetting(row) {
  const newKey = SETTINGS_KEY_MAP[row.key];
  if (!newKey) return row;
  const value = row.key === 'tema' ? (THEME_VALUE_MAP[row.value] ?? row.value) : row.value;
  return { key: newKey, value };
}

// Blob nao sobrevive a JSON.stringify — o backup e um arquivo de texto, entao
// as fotos personalizadas viajam como data URL (base64) e voltam a ser Blob
// na importacao. Deixa o backup maior quando ha fotos, mas e a unica forma de
// nao perde-las ao trocar de aparelho ou limpar dados.
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * Monta o backup. Deve ser chamado ANTES do toque do usuario sempre que
 * possivel: o Safari exige que navigator.share() aconteca durante o gesto, e
 * um await longo no meio do caminho pode invalidar essa permissao.
 */
export async function prepareBackup() {
  const data = await db.dumpAll();
  const images = await Promise.all(data.images.map(async (row) => ({
    exerciseId: row.exerciseId,
    slot: row.slot,
    dataUrl: await blobToDataUrl(row.blob),
    createdAt: row.createdAt,
  })));
  const payload = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    exercises: data.exercises,
    workouts: data.workouts,
    sets: data.sets,
    settings: data.settings,
    images,
  };

  const json = JSON.stringify(payload);
  const fileName = `treino-${new Date().toISOString().slice(0, 10)}.json`;

  let file = null;
  try {
    file = new File([json], fileName, { type: 'application/json' });
  } catch { /* navegador antigo sem construtor de File */ }

  return {
    json,
    fileName,
    file,
    summary: {
      exercises: data.exercises.length,
      workouts: data.workouts.length,
      sets: data.sets.length,
      size: json.length,
    },
  };
}

/** @returns {Promise<'shared'|'cancelled'|'downloaded'|'copied'|'manual'>} */
export async function exportBackup(backup, { canDownload = true } = {}) {
  if (backup.file && navigator.canShare?.({ files: [backup.file] })) {
    try {
      await navigator.share({ files: [backup.file], title: backup.fileName });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Qualquer outra falha cai para as alternativas abaixo.
    }
  }

  if (canDownload) {
    try {
      const url = URL.createObjectURL(new Blob([backup.json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = backup.fileName;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return 'downloaded';
    } catch { /* segue para a area de transferencia */ }
  }

  try {
    await navigator.clipboard.writeText(backup.json);
    return 'copied';
  } catch {
    return 'manual';
  }
}

/** Le e valida um arquivo escolhido pelo usuario. Lanca erro se nao servir. */
export async function readFile(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error(t('backup.error.invalidJson'));
  }
  return validate(payload);
}

export async function validate(payload) {
  if (!payload || typeof payload !== 'object') throw new Error(t('backup.error.emptyOrInvalid'));

  const { exercises, workouts, sets, settings = [] } = payload;
  if (!Array.isArray(exercises) || !Array.isArray(workouts) || !Array.isArray(sets)) {
    throw new Error(t('backup.error.notABackup'));
  }
  const format = payload.format ?? payload.formato;
  if (format && format !== FORMAT) {
    throw new Error(t('backup.error.unknownFormat', { format }));
  }
  const version = payload.version ?? payload.versao;
  if (version && version > VERSION) {
    throw new Error(t('backup.error.newerVersion'));
  }

  const toNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  const images = await Promise.all(
    (Array.isArray(payload.images) ? payload.images : []).map(async (row) => ({
      exerciseId: toNumber(row.exerciseId),
      slot: row.slot === 1 ? 1 : 0,
      blob: await dataUrlToBlob(row.dataUrl),
      createdAt: row.createdAt ?? new Date().toISOString(),
    })),
  );

  return {
    // A restauracao chama db.replaceAll(), que grava direto e NAO passa pela
    // migracao do banco. Sem o backfill abaixo (nome de campo, slug, chave de
    // ajuste), importar um backup antigo perderia figura de exercicio ou
    // voltaria unidade/tema/idioma pro padrao de fabrica, sem erro nenhum.
    exercises: exercises.map((e) => {
      const rec = {
        id: toNumber(e.id),
        name: String(e.name ?? e.nome ?? 'Exercício'),
        muscleGroup: String(e.muscleGroup ?? e.grupoMuscular ?? 'Outros'),
        slug: e.slug ?? slugByName().get(normalizeName(e.name ?? e.nome ?? '')) ?? null,
        custom: Boolean(e.custom ?? e.personalizado),
        unilateral: Boolean(e.unilateral),
        createdAt: e.createdAt ?? e.criadoEm ?? new Date().toISOString(),
      };
      // Passo a passo editado pelo usuario: so vem a chave se era um array no
      // backup, pra preservar os 3 estados (ausente = herda catalogo, [] =
      // "sem passo a passo", preenchido = override).
      if (Array.isArray(e.steps)) rec.steps = e.steps.map((s) => String(s));
      return rec;
    }),
    workouts: workouts.map((w) => ({
      id: toNumber(w.id),
      date: w.date ?? w.data ?? String(w.startedAt ?? w.iniciadoEm ?? '').slice(0, 10),
      startedAt: w.startedAt ?? w.iniciadoEm ?? new Date().toISOString(),
      finishedAt: w.finishedAt ?? w.finalizadoEm ?? null,
      notes: w.notes ?? w.notas ?? '',
      exerciseIds: Array.isArray(w.exerciseIds) ? w.exerciseIds.map(toNumber) : [],
      completedIds: Array.isArray(w.completedIds)
        ? w.completedIds.map(toNumber)
        : Array.isArray(w.concluidoIds) ? w.concluidoIds.map(toNumber) : [],
    })),
    sets: sets.map((s) => ({
      id: toNumber(s.id),
      workoutId: toNumber(s.workoutId),
      exerciseId: toNumber(s.exerciseId),
      weight: toNumber(s.weight ?? s.peso),
      reps: Math.round(toNumber(s.reps)),
      repsLeft: Math.round(toNumber(s.repsLeft)),
      repsRight: Math.round(toNumber(s.repsRight)),
      durationSec: Math.round(toNumber(s.durationSec ?? s.duracaoSeg)),
      warmup: Boolean(s.warmup ?? s.aquecimento),
      createdAt: s.createdAt ?? s.criadoEm ?? new Date().toISOString(),
    })),
    settings: Array.isArray(settings) ? settings.filter((s) => s && s.key).map(remapSetting) : [],
    images,
  };
}

/** Substitui tudo que esta no aparelho pelo conteudo do backup. */
export async function restore(data) {
  await db.replaceAll(data);
  await db.getSettings();
}
