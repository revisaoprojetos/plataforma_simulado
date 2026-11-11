'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, FolderInput, Loader2, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { PaginacaoBib } from '../../../biblioteca/paginacao-bib'
import { duplicarConjunto, excluirConjunto, moverConjuntoParaPasta } from '@/app/admin/cronogramas/conteudos/actions'
import { excluirLink } from '@/app/admin/cronogramas/links/actions'

// Mesmo casco da TabelaCron (cartão, densidade, seleção, barra flutuante de ações em massa, PaginacaoBib), mas com as
// ações em massa de Conjuntos/Links — a TabelaCron só conhece disciplinas/sprints/versões e não pode ser editada por esta sub-aba.
// As ações em massa chamam as actions EXISTENTES, uma a uma (cada uma já valida permissão e grava auditoria).

export interface LinhaSel { id: string; cells: ReactNode[] }
const PP = [10, 14, 25, 50, 100]

export function TabelaSel({ tipo, head, rows, total, page, pp, podeEditar, colunas, vazio, pastas = [] }: {
  tipo: 'conjuntos' | 'links' | 'leitura'; head: ReactNode; rows: LinhaSel[]; total: number; page: number; pp: number
  podeEditar: boolean; colunas: number; vazio: ReactNode; pastas?: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [navegando, nav] = useTransition()
  const [executando, executar] = useTransition()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [destino, setDestino] = useState('')
  const selecionavel = tipo !== 'leitura'
  const todos = rows.length > 0 && rows.every((r) => sel.has(r.id))

  function ir(mudar: Record<string, string | undefined>) {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(mudar)) { if (v) q.set(k, v); else q.delete(k) }
    nav(() => { router.push(`${pathname}?${q.toString()}`) })
  }
  const marcar = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n })
  const marcarPagina = (v: boolean) => setSel((s) => { const n = new Set(s); for (const r of rows) { if (v) n.add(r.id); else n.delete(r.id) } return n })
  const limpar = () => setSel(new Set())

  /** Roda a action para cada id; resume sucessos/falhas num único toast. */
  function emLote(fn: (id: string) => Promise<{ ok: boolean; error?: string }>, rotulo: string) {
    const ids = [...sel]
    executar(async () => {
      let ok = 0; let erro: string | undefined
      for (const id of ids) { const r = await fn(id); if (r.ok) ok++; else erro ??= r.error }
      if (ok) toast.success(`${rotulo}: ${ok} de ${ids.length}`)
      if (ok < ids.length) toast.error(erro ?? 'Alguns itens falharam.')
      limpar(); router.refresh()
    })
  }

  return (
    <>
      <section className={cn('rounded-2xl border bg-card p-2 shadow-sm transition-opacity', (navegando || executando) && 'opacity-70')} aria-busy={navegando}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                {selecionavel && (
                  <th className="w-9 px-3 py-2.5">
                    <input type="checkbox" aria-label="Selecionar todos desta página" checked={todos} onChange={(e) => marcarPagina(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" />
                  </th>
                )}
                {head}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={colunas + (selecionavel ? 1 : 0)} className="px-3 py-10 text-center text-muted-foreground">{vazio}</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className={cn('border-b last:border-0 hover:bg-muted/40', sel.has(r.id) && 'bg-primary/5')}>
                  {selecionavel && (
                    <td className="px-3 py-1.5"><input type="checkbox" aria-label="Selecionar linha" checked={sel.has(r.id)} onChange={(e) => marcar(r.id, e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" /></td>
                  )}
                  {r.cells.map((c, i) => <td key={i} className="px-3 py-1.5 align-middle">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PaginacaoBib total={total} page={page} pp={pp} opcoesPP={PP} selecionados={sel.size} carregando={navegando}
        onPage={(p) => ir({ pag: p > 1 ? String(p) : undefined })} onPP={(n) => ir({ pps: String(n), pag: undefined })} />

      {podeEditar && selecionavel && sel.size > 0 && createPortal(
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card px-3 py-2 shadow-xl" role="toolbar" aria-label="Ações em massa">
          <b className="mr-1 text-sm">{sel.size} {sel.size === 1 ? 'selecionado' : 'selecionados'}</b>

          {tipo === 'conjuntos' && (
            <>
              <select value={destino} onChange={(e) => setDestino(e.target.value)} aria-label="Pasta de destino" className="h-8 rounded-lg border bg-background px-2 text-xs">
                <option value="">Raiz (sem pasta)</option>
                {pastas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <Button size="sm" variant="outline" disabled={executando} onClick={() => emLote((id) => moverConjuntoParaPasta(id, destino || null), 'Movidos')}><FolderInput />Mover</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={() => emLote((id) => duplicarConjunto(id), 'Duplicados')}><Copy />Duplicar</Button>
              <Button size="sm" variant="destructive" disabled={executando} onClick={async () => {
                if (await confirmar({ titulo: 'Excluir conjuntos', mensagem: `Excluir ${sel.size} conjunto(s) e suas aulas? Cronogramas já montados a partir deles NÃO são afetados.`, confirmar: 'Excluir', destrutivo: true })) emLote((id) => excluirConjunto(id), 'Excluídos')
              }}><Trash2 />Excluir</Button>
            </>
          )}

          {tipo === 'links' && (
            <Button size="sm" variant="destructive" disabled={executando} onClick={async () => {
              if (await confirmar({ titulo: 'Excluir links', mensagem: `Excluir ${sel.size} link(s) de aula? Sem eles, o aluno verá “Não há link cadastrado para esta aula” nas metas de questões.`, confirmar: 'Excluir', destrutivo: true })) emLote((id) => excluirLink(id), 'Excluídos')
            }}><Trash2 />Excluir</Button>
          )}

          <Button size="sm" variant="ghost" className="ml-auto" onClick={limpar}><X />Limpar seleção</Button>
          {executando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>, document.body,
      )}
    </>
  )
}
