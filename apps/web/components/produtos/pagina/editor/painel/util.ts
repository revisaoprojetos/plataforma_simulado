// Utilitários do painel: leitura/escrita de campos do bloco por caminho ('nome' | 'conteudo.x' | 'estilo.x' | 'ancora' | 'variacao').
import type { BlocoAny } from '@/lib/produtos/pagina/tipos'
import type { EditorApi } from '../store'

export function valorDe(b: BlocoAny, chave: string): unknown {
  if (chave === 'nome') return b.nome ?? ''
  if (chave === 'ancora') return b.ancora ?? ''
  if (chave === 'variacao') return b.variacao
  const i = chave.indexOf('.')
  const raiz = chave.slice(0, i), sub = chave.slice(i + 1)
  if (raiz === 'conteudo') return (b.conteudo as Record<string, unknown>)[sub]
  if (raiz === 'estilo') return (b.estilo as Record<string, unknown>)[sub]
  return undefined
}

export function gravarCampo(ed: Pick<EditorApi, 'atualizarBloco' | 'atualizarConteudo' | 'atualizarEstilo'>, b: BlocoAny, chave: string, valor: unknown) {
  if (chave === 'nome') return ed.atualizarConteudo(b.id, 'nome', valor)
  if (chave === 'ancora') {
    const v = String(valor ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)
    return ed.atualizarBloco(b.id, { ancora: v || undefined })
  }
  if (chave === 'variacao') {
    // No carrossel a variação É o tamanho do card: mantém os dois em sincronia.
    if (b.tipo === 'carrossel') return ed.atualizarBloco(b.id, (x) => ({ ...x, variacao: String(valor), conteudo: { ...(x.conteudo as object), tamanho: String(valor) } as any }))
    return ed.atualizarBloco(b.id, { variacao: String(valor) })
  }
  const i = chave.indexOf('.')
  const raiz = chave.slice(0, i), sub = chave.slice(i + 1)
  if (raiz === 'conteudo') return ed.atualizarConteudo(b.id, sub, valor)
  if (raiz === 'estilo') return ed.atualizarEstilo(b.id, { [sub]: valor === '' || valor == null ? undefined : valor })
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
