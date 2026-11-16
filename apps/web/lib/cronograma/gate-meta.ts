import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolverConteudoDasMetas } from './meta-extras-server'
import { statusLiberacaoDocAluno, alunoPodeAbrirDocumento } from '@/lib/conteudo/leitor'
import { bloqueioPorMatriz, bloqueioSemAcesso, type BloqueioMeta } from './gate-meta-puro'
import { remember } from '@/lib/cache/relatorio-cache'
import { mapaDocsCronograma } from './adaptativo/liberacao'
import { metaDoAlvo } from './adaptativo/meta-alvo'
import { docsBloqueadosDoAluno } from '@/lib/produtos/docs-liberacao-aluno'
import { produtosDoAluno } from '@/lib/produtos/aluno'

/**
 * GATE ÚNICO de uma meta do cronograma Revisão: o material (documento da Biblioteca) da meta está BLOQUEADO para o aluno pela
 * matriz/produto (data/regra) ou pelo cronograma? Devolve a data quando houver; null = liberada (ou meta sem material de
 * Biblioteca, ex.: questões/simulado). Falha de consulta = null (não tranca por erro). Usado ao MARCAR a meta como concluída.
 */
export async function metaBloqueadaPelaMatriz(
  svc: SupabaseClient, tenantId: string, estudanteId: string, cronogramaId: string, metaId: string,
): Promise<{ docId: string; liberaEm: string | null } | null> {
  try {
    const { data } = await svc.from('simulado_cronograma_metas').select('*').eq('tenant_id', tenantId).eq('cronograma_id', cronogramaId).eq('id', metaId).maybeSingle()
    const m = data as Record<string, unknown> | null
    if (!m) return null
    const meta = {
      id: metaId, tipo: String(m.tipo ?? ''), disciplinas: [String(m.disciplina ?? '')], aula: (m.aula as string | null) ?? null,
      conteudo: (m.conteudo as string | null) ?? null, textos: [m.titulo as string | null, m.complemento as string | null],
    }
    const doc = (await resolverConteudoDasMetas(svc, tenantId, cronogramaId, [meta])).get(metaId)
    if (!doc) return null
    const st = await statusLiberacaoDocAluno(tenantId, estudanteId, doc.docId)
    return st.bloqueado ? { docId: doc.docId, liberaEm: st.liberaEm } : null
  } catch { return null }
}

export type { BloqueioMeta } from './gate-meta-puro'

/**
 * GATE ÚNICO das metas do cronograma ADAPTATIVO (ids do motor: pf:i, pp:i:k, fl:i, lp:…). Para cada meta, os documentos que ela
 * libera (mapa do cronograma + `metaDoAlvo`) são comparados com a decisão da MATRIZ (`docsBloqueadosDoAluno`, mesma árvore do currículo):
 *  - algum doc da meta bloqueado por data/regra → 'ainda_nao_liberado' (+ data mais próxima);
 *  - aluno COM produto, mas nenhum doc da meta abre para ele (nem pelo produto nem pela ACL) → 'sem_acesso' (item d);
 *  - meta sem documento (jurisprudência, questões…) ou aluno sem produto com ACL/doc liberado → liberada (comportamento anterior).
 * Erro de consulta = não bloqueia. Só usar para metas NOVAS (conclusões já gravadas não são revertidas).
 */
export async function metasAdaptativoBloqueadas(
  svc: SupabaseClient, tenantId: string, estudanteId: string, metaIds: string[],
): Promise<Record<string, BloqueioMeta>> {
  const out: Record<string, BloqueioMeta> = {}
  try {
    if (!metaIds.length) return out
    const [mapa, bl, temProduto] = await Promise.all([
      mapaDocsCronograma(svc, tenantId),
      docsBloqueadosDoAluno(tenantId, estudanteId),
      remember<boolean>(`gate-meta:tem-produto:${tenantId}:${estudanteId}`, 60, async () => (await produtosDoAluno(tenantId, estudanteId)).length > 0),
    ])
    const entradas = Object.entries(mapa.docs)
    for (const id of metaIds) {
      const docs = entradas.filter(([, alvo]) => metaDoAlvo(id, alvo)).map(([docId]) => docId)
      if (!docs.length) continue
      const porMatriz = bloqueioPorMatriz(docs, bl)
      if (porMatriz) { out[id] = porMatriz; continue }
      if (!temProduto) continue
      const abre = await Promise.all(docs.slice(0, 4).map((d) => alunoPodeAbrirDocumento(tenantId, estudanteId, d).catch(() => true)))
      const sem = bloqueioSemAcesso(temProduto, docs.length, abre)
      if (sem) out[id] = sem
    }
  } catch { /* falha de consulta: não bloqueia */ }
  return out
}
