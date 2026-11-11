'use client'

// SELEÇÃO MÚLTIPLA de grupos/produtos dentro de UMA condição do segmento ("Grupo de acesso · está em QUALQUER um dos grupos…").
// Botão + etiquetas na linha da condição; a escolha acontece num pop-up grande (lista paginada com busca e "marcar página").

import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Search, X, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { RefTipo } from '@/lib/segmentos/tipos'
import { buscarRefsSegmentoAction } from './visibilidade-actions'
import { listarGruposSelecaoAction } from './segmento-regras-actions'

type Item = { id: string; nome: string }
const ROTULO: Record<RefTipo, [string, string]> = { grupo: ['grupo', 'grupos'], produto: ['produto', 'produtos'], simulado: ['simulado', 'simulados'] }

/** Botão da condição: mostra o resumo/etiquetas e abre o pop-up de seleção. */
export function RefMulti({ tipo, produtoId, ids, nomes, disabled, onChange }: {
  tipo: RefTipo; produtoId: string; ids: string[]; nomes: Record<string, string>; disabled?: boolean
  onChange: (itens: Item[]) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [um, varios] = ROTULO[tipo]
  const atuais: Item[] = ids.map((id) => ({ id, nome: nomes[id] ?? `(${um})` }))
  return (
    <div className="min-w-0 flex-1 basis-72">
      <button type="button" disabled={disabled} onClick={() => setAberto(true)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-background px-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
        <span className={cn('inline-flex min-w-0 items-center gap-1.5', !ids.length && 'text-muted-foreground')}><Layers className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{ids.length ? `${ids.length} ${ids.length === 1 ? um : varios} escolhido${ids.length === 1 ? '' : 's'}` : `Escolher ${varios}…`}</span></span>
        <span className="shrink-0 text-xs font-medium text-primary">{ids.length ? 'Editar' : 'Selecionar'}</span>
      </button>
      {atuais.length > 0 && (
        <div className="mt-1 flex max-h-16 flex-wrap gap-1 overflow-y-auto">
          {atuais.slice(0, 6).map((g) => <span key={g.id} className="inline-flex max-w-full items-center rounded-full border bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"><span className="truncate">{g.nome}</span></span>)}
          {atuais.length > 6 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">+{atuais.length - 6}</span>}
        </div>
      )}
      {aberto && <SeletorRefsDialog tipo={tipo} produtoId={produtoId} inicial={atuais} onClose={() => setAberto(false)} onConfirmar={(l) => { setAberto(false); onChange(l) }} />}
    </div>
  )
}

function SeletorRefsDialog({ tipo, produtoId, inicial, onClose, onConfirmar }: { tipo: RefTipo; produtoId: string; inicial: Item[]; onClose: () => void; onConfirmar: (l: Item[]) => void }) {
  const [sel, setSel] = useState<Item[]>(inicial)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [lista, setLista] = useState<null | { rows: { id: string; nome: string; noProduto?: boolean }[]; total: number }>(null)
  const [um, varios] = ROTULO[tipo]
  const marcado = useMemo(() => new Set(sel.map((g) => g.id)), [sel])
  useEffect(() => { setPage(1) }, [q])
  useEffect(() => {
    let vivo = true
    const t = setTimeout(() => {
      const f = tipo === 'grupo'
        ? listarGruposSelecaoAction(produtoId, q, page).then((r) => ('ok' in r ? { rows: r.rows, total: r.total } : { rows: [], total: 0 }))
        : buscarRefsSegmentoAction(tipo, q).then((r) => ('ok' in r ? { rows: r.rows, total: r.rows.length } : { rows: [], total: 0 }))
      f.then((r) => { if (vivo) setLista(r) }).catch(() => { if (vivo) setLista({ rows: [], total: 0 }) })
    }, q ? 250 : 0)
    return () => { vivo = false; clearTimeout(t) }
  }, [tipo, produtoId, q, page])
  const pagina = lista?.rows ?? []
  const paginaToda = pagina.length > 0 && pagina.every((g) => marcado.has(g.id))
  const alternar = (g: Item) => setSel((p) => (p.some((x) => x.id === g.id) ? p.filter((x) => x.id !== g.id) : [...p, g]))
  const marcarPagina = () => setSel((p) => { const ids = new Set(p.map((x) => x.id)); return paginaToda ? p.filter((x) => !pagina.some((l) => l.id === x.id)) : [...p, ...pagina.filter((l) => !ids.has(l.id)).map((l) => ({ id: l.id, nome: l.nome }))] })
  const ultima = Math.max(1, Math.ceil((lista?.total ?? 0) / 100))
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="flex h-[min(84vh,760px)] w-[min(900px,calc(100vw-2rem))] max-w-[min(900px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(900px,calc(100vw-2rem))]">
        <div className="shrink-0 border-b px-6 py-4"><DialogTitle className="text-lg">Escolher {varios}</DialogTitle><p className="text-sm text-muted-foreground">A condição vale para quem estiver em <b>qualquer um</b> dos {varios} marcados.</p></div>
        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_280px]">
          <section className="flex min-h-0 flex-col md:border-r">
            <div className="shrink-0 space-y-2 p-4">
              <div className="flex items-center justify-between text-xs"><span className="font-semibold">{tipo === 'grupo' ? `Grupos (${lista?.total ?? 0})` : varios}</span>
                {pagina.length > 0 && <button type="button" onClick={marcarPagina} className="font-medium text-primary hover:underline">{paginaToda ? 'Desmarcar esta página' : `Marcar esta página (${pagina.length})`}</button>}</div>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar ${um}…`} className="h-10 pl-9" /></div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto border-y">
              {lista === null ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
                : pagina.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Nada encontrado.</p>
                : pagina.map((g) => (
                  <button key={g.id} type="button" onClick={() => alternar({ id: g.id, nome: g.nome })} className={cn('flex w-full items-center gap-3 border-b px-4 py-2.5 text-left text-sm last:border-0 hover:bg-muted', marcado.has(g.id) && 'bg-primary/5')}>
                    <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded border', marcado.has(g.id) ? 'border-primary bg-primary text-primary-foreground' : 'bg-background')}>{marcado.has(g.id) && <Check className="h-3.5 w-3.5" />}</span>
                    <span className="min-w-0 flex-1 truncate" title={g.nome}>{g.nome}</span>
                    {g.noProduto !== undefined && <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', g.noProduto ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{g.noProduto ? 'No produto' : 'Fora do produto'}</span>}
                  </button>))}
            </div>
            {tipo === 'grupo' && (
              <div className="flex shrink-0 items-center justify-between px-4 py-2 text-xs text-muted-foreground"><span>Página {page} de {ultima}</span>
                <span className="flex gap-1"><button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="rounded-lg border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-40">Anterior</button><button type="button" disabled={page >= ultima} onClick={() => setPage((n) => n + 1)} className="rounded-lg border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-40">Próxima</button></span></div>
            )}
          </section>
          <section className="flex min-h-0 flex-col bg-muted/20">
            <div className="flex shrink-0 items-center justify-between px-4 py-3 text-sm font-semibold">Escolhidos ({sel.length}){sel.length > 0 && <button type="button" onClick={() => setSel([])} className="text-xs font-normal text-muted-foreground hover:text-foreground">Limpar</button>}</div>
            <div className="min-h-0 flex-1 overflow-auto border-t">
              {sel.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhum {um} escolhido ainda.</p> : sel.map((g) => (
                <div key={g.id} className="flex items-center gap-2 border-b bg-card px-4 py-2 last:border-0"><span className="min-w-0 flex-1 truncate text-sm" title={g.nome}>{g.nome}</span>
                  <button type="button" onClick={() => alternar(g)} aria-label={`Remover ${g.nome}`} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"><X className="h-3.5 w-3.5" /></button></div>))}
            </div>
          </section>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-card px-6 py-3"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={() => onConfirmar(sel)}><Check className="h-4 w-4" />Confirmar ({sel.length})</Button></div>
      </DialogContent>
    </Dialog>
  )
}
