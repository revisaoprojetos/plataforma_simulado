import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { ehTesteOuCopia } from '@/lib/cronograma/adaptativo/relink-documento'

// PREVENÇÃO: documento com 'TESTE'/'Cópia' no título NÃO pode ser PUBLICADO numa pasta ligada a uma disciplina de cronograma
// (entraria como aula real nos planos dos alunos e deslocaria as seguintes) sem confirmação explícita (`confirmarTeste`).
// Só consulta o banco quando o título casa — publicação normal não paga nada.

export const MSG_PUBLICAR_TESTE = (titulo: string) =>
  `"${titulo}" parece um documento de teste/cópia e está numa pasta de disciplina do cronograma: publicar faria dele uma aula real nos planos dos alunos. Renomeie, mova para fora da disciplina ou confirme a publicação explicitamente.`

/** Devolve { id → mensagem } dos documentos que devem ser RECUSADOS. Vazio = pode publicar. Falha de leitura → não bloqueia (best-effort). */
export async function recusarPublicarTeste(
  svc: SupabaseClient, tenantId: string, docs: Array<{ id: string; titulo?: string | null; pasta_id?: string | null }>, confirmarTeste?: boolean,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (confirmarTeste) return out
  const suspeitos = docs.filter((d) => ehTesteOuCopia(d.titulo))
  if (!suspeitos.length) return out
  try {
    const pastas = await fetchAll<{ id: string; pai_id: string | null; disciplina_id: string | null }>(
      () => svc.from('simulado_pastas').select('id, pai_id, disciplina_id').eq('tenant_id', tenantId).eq('folder_area', 'conteudo').eq('is_folder', true).eq('deletado', false).order('id', { ascending: true }), 1000, 'guarda-teste:pastas')
    const porId = new Map(pastas.map((p) => [p.id, p]))
    const ligada = (pastaId: string | null | undefined): boolean => {
      for (let p = pastaId ? porId.get(pastaId) : undefined, n = 0; p && n < 30; p = p.pai_id ? porId.get(p.pai_id) : undefined, n++) if (p.disciplina_id) return true
      return false
    }
    for (const d of suspeitos) if (ligada(d.pasta_id)) out.set(d.id, MSG_PUBLICAR_TESTE(d.titulo ?? 'Documento'))
  } catch { /* best-effort */ }
  return out
}
