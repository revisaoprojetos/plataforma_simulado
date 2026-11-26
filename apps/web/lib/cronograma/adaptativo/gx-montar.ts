// Monta a lista GX (metas próprias de tipos personalizados com geraMeta) a partir dos documentos já classificados. PURO (testável).
import type { TipoConteudo } from '@/lib/cronograma/tipos-conteudo-tipos'
import { MAX_ITENS_GX, MIN_PADRAO_GX, type ItemGX } from './gx-tipos'

export interface DocGX { id: string; titulo: string; disc: string; slug: string }

const col = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** `gx:<slug>:<d8>` com d8 = 8 primeiros hex do uuid; colisão no tenant → sufixo -2, -3 (atribuído em ordem de uuid: estável). */
export function montarGX(docs: DocGX[], tipos: Map<string, TipoConteudo>): ItemGX[] {
  if (!docs.length || !tipos.size) return []
  const usados = new Map<string, number>()
  const porId = [...docs].filter((d) => tipos.has(d.slug)).sort((a, b) => a.id.localeCompare(b.id))
  const itens: ItemGX[] = []
  for (const d of porId) {
    const t = tipos.get(d.slug)!
    const d8 = d.id.replace(/-/g, '').slice(0, 8).toLowerCase()
    const base = `gx:${d.slug}:${d8}`
    const n = (usados.get(base) ?? 0) + 1; usados.set(base, n)
    itens.push({
      id: n === 1 ? base : `${base}-${n}`, slug: d.slug, nomeTipo: t.nomeAluno || t.nome, disc: d.disc, titulo: d.titulo, doc: d.id,
      min: t.duracaoPadraoMin ?? MIN_PADRAO_GX, prioridade: t.prioridade, ordem: t.ordem,
    })
  }
  return itens
    .sort((a, b) => a.ordem - b.ordem || a.slug.localeCompare(b.slug) || col.compare(a.disc, b.disc) || col.compare(a.titulo, b.titulo) || a.id.localeCompare(b.id))
    .slice(0, MAX_ITENS_GX)
}
