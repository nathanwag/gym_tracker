/* TEMPORÁRIO — renomeia o grupo 'Deltoides' -> 'Ombros' nos exercícios já
 * gravados no banco deste aparelho (o catálogo e o código já saíram renomeados
 * no mesmo commit; isto só alcança os dados do usuário).
 *
 * Rodar uma vez no console do app:
 *   await import('/js/migrate-deltoides.js').then((m) => m.run())
 *
 * Idempotente: uma segunda execução encontra 0 e não faz nada. Este arquivo é
 * removido num commit seguinte, depois que a migração dos dados estiver feita.
 */
import { listExercises, updateExercise } from './db.js';

export async function run() {
  const alvo = (await listExercises()).filter((e) => e.muscleGroup === 'Deltoides');
  for (const ex of alvo) await updateExercise(ex.id, { muscleGroup: 'Ombros' });
  console.log(`migrados ${alvo.length} exercício(s): Deltoides -> Ombros`);
  return alvo.length;
}
