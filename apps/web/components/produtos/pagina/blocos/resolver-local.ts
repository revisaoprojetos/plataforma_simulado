// Resolução LOCAL (cliente/servidor, pura) do que o servidor monta em montarPaginaExtensivo — usada pelo EDITOR, que
// renderiza só com `dados` (amostra). No aluno os renderers recebem o item já resolvido (`resolvido`) e isto não roda.
import type { BlocoAluno } from '@/lib/produtos/pagina-extensivo'
import type { DadosPagina } from '@/lib/produtos/pagina/dados'
import type { BlocoV1 } from '@/lib/produtos/pagina/tipos'
import type { ModuloAluno } from '@/lib/produtos/curriculo-aluno'
import { TITULO_MODULOS_PADRAO, formatoParaLayout, normConfigCronograma, type FormatoSecaoModulos } from '@/lib/produtos/blocos-pagina'
import type { LayoutModulos } from './curriculo-ui'

/** Variação do bloco 'modulos' → layout das visões do aluno ('herdar' = padrão do produto). */
export function layoutDeModulos(variacao: string, padrao: DadosPagina['produto']['vitrine_layout']): LayoutModulos {
  if (variacao === 'poster') return 'poster'
  if (variacao === 'trilha_imagem') return 'trilha_imagem'
  return formatoParaLayout(variacao as FormatoSecaoModulos, padrao)
}

export function resolverLocal(blocos: BlocoV1[], dados: DadosPagina): Record<string, BlocoAluno> {
  const out: Record<string, BlocoAluno> = {}
  const cur = dados.curriculo
  const porModulo = new Map<string, ModuloAluno>(cur.map((m) => [m.id, m]))
  const atribuidos = new Set<string>()
  for (const b of blocos) if (b.tipo === 'modulos') for (const id of (b as BlocoV1<'modulos'>).conteudo.modulo_ids) atribuidos.add(id)
  const sobras = cur.filter((m) => !atribuidos.has(m.id))
  let primeiraRestantes = true
  for (const b of blocos) {
    if (b.tipo === 'progresso') { if (cur.length) out[b.id] = { kind: 'progresso', key: b.id } }
    else if (b.tipo === 'modulos') {
      const c = (b as BlocoV1<'modulos'>).conteudo
      const proprios = c.modulo_ids.map((id) => porModulo.get(id)).filter(Boolean) as ModuloAluno[]
      const extra = c.restantes && primeiraRestantes ? sobras : []
      if (c.restantes) primeiraRestantes = false
      const modulos = [...proprios, ...extra]
      if (!modulos.length) continue
      const l = layoutDeModulos(b.variacao, dados.produto.vitrine_layout)
      out[b.id] = {
        kind: 'modulos', key: b.id, titulo: b.nome?.trim() || TITULO_MODULOS_PADRAO, layout: l === 'poster' ? 'grade' : l,
        agruparPrefixo: c.agrupar_prefixo, recolhivel: c.recolhivel, recolhida: c.recolhivel && c.recolhida, implicita: false, modulos,
      }
    } else if (b.tipo === 'cronograma') {
      const cfg = normConfigCronograma({ ...b.conteudo, variacao: b.variacao })
      out[b.id] = { kind: 'cronograma', key: b.id, cfg: { ...cfg, titulo: cfg.titulo.trim() || b.nome?.trim() || '' }, resumo: dados.resumosCronograma[b.id] ?? null }
    } else if (b.tipo === 'banner' || b.tipo === 'carrossel') {
      const s = dados.secoes[b.id]; if (s) out[b.id] = { kind: 'vitrine', key: b.id, secao: s }
    }
  }
  return out
}
