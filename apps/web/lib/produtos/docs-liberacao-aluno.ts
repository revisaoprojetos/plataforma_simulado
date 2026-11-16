import 'server-only'
import { remember } from '@/lib/cache/relatorio-cache'
import { createAdminClient } from '@/lib/supabase/server'
import { produtosDoAluno } from './aluno'
import { curriculoDoAluno, type ModuloAluno } from './curriculo-aluno'

/**
 * Documentos de aula BLOQUEADOS para o aluno pela matriz/produto (mesma árvore do currículo = fonte única), em lote e com cache 60s.
 * Chave = documento_id; valor = data de liberação (AAAA-MM-DD) ou '' quando bloqueado sem data. Doc em vários produtos: só entra se
 * NENHUM libera. Doc fora de produto / liberado: ausente. Falha = {} (não bloqueia). Usado para rotular as metas no cronograma.
 */
export async function docsBloqueadosDoAluno(tenantId: string, estudanteId: string): Promise<Record<string, string>> {
  return remember<Record<string, string>>(`docs-bloq:${tenantId}:${estudanteId}`, 300, async () => {
    try {
      const svc = createAdminClient()
      const prods = await produtosDoAluno(tenantId, estudanteId)
      const liberado = new Set<string>(), bloq = new Map<string, string>()
      for (const p of prods) {
        const arv: ModuloAluno[] = await curriculoDoAluno(svc, tenantId, estudanteId, p.id, '/aluno/cronograma')
        const rec = (m: ModuloAluno) => {
          for (const a of m.aulas) {
            const doc = a.tipoRef === 'documento_biblioteca' ? /biblioteca\/([0-9a-f-]{36})/i.exec(a.href ?? '')?.[1] : null
            if (a.liberada && doc) liberado.add(doc)
          }
          m.submodulos.forEach(rec)
        }
        arv.forEach(rec)
        // bloqueadas: href é null (só aula liberada tem link) → o doc vem do item; busca em lote abaixo
        const itens: Array<{ id: string; liberaEm: string | null }> = []
        const rec2 = (m: ModuloAluno) => {
          for (const a of m.aulas) if (a.tipoRef === 'documento_biblioteca' && !a.liberada && !a.exclusivo && !/prepara/i.test(a.bloqueioMsg ?? '')) itens.push({ id: a.id, liberaEm: a.liberaEm })
          m.submodulos.forEach(rec2)
        }
        arv.forEach(rec2)
        for (let k = 0; k < itens.length; k += 80) {
          const bloco = itens.slice(k, k + 80)
          const { data } = await svc.from('simulado_produto_modulo_itens').select('id, ref_id').eq('tenant_id', tenantId).in('id', bloco.map((i) => i.id))
          const refDe = new Map(((data ?? []) as any[]).map((r) => [r.id as string, r.ref_id as string | null]))
          for (const i of bloco) {
            const doc = refDe.get(i.id); if (!doc) continue
            const d = i.liberaEm ? i.liberaEm.slice(0, 10) : ''
            const ex = bloq.get(doc)
            if (ex === undefined || (d && (!ex || d < ex))) bloq.set(doc, d)
          }
        }
      }
      const out: Record<string, string> = {}
      for (const [doc, d] of bloq) if (!liberado.has(doc)) out[doc] = d
      return out
    } catch { return {} }
  }).catch(() => ({} as Record<string, string>))
}
