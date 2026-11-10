'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Search, Check, X, Loader2, AlertTriangle, Database, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { BancoVinculavel } from '@/app/admin/conteudos/grupos/actions-tipos'
import {buscarBancosVinculaveis, vincularGrupoBancos} from '@/app/admin/conteudos/grupos/actions'

/**
 * VincularGrupo (versão grupo→bancos). Marca/desmarca os bancos de questões que o grupo alimenta.
 * Marcar propaga os membros ao banco (entra na pasta + matricula nos simulados que herdam).
 * Desmarcar remove só o vínculo de auto-sync — NÃO tira acesso já concedido (segurança).
 */
export function VincularGrupoModal({ grupoId, grupoNome, onClose, onSalvo }: { grupoId: string; grupoNome: string; onClose: () => void; onSalvo: () => void }) {
  const [itens, setItens] = React.useState<BancoVinculavel[] | null>(null)
  const [sel, setSel] = React.useState<Set<string>>(new Set())
  const [q, setQ] = React.useState('')
  const [filtro, setFiltro] = React.useState<'todos' | 'vinculados'>('todos')
  const [erro, setErro] = React.useState<string | null>(null)
  const [salvando, setSalvando] = React.useState(false)

  React.useEffect(() => {
    let vivo = true
    buscarBancosVinculaveis(grupoId).then((r) => {
      if (!vivo) return
      if (!r.ok || !r.itens) { setErro(r.error ?? 'Falha ao carregar bancos.'); setItens([]); return }
      setItens(r.itens)
      setSel(new Set(r.itens.filter((b) => b.vinculado).map((b) => b.id)))
    })
    return () => { vivo = false }
  }, [grupoId])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const visiveis = (itens ?? []).filter((b) => {
    if (filtro === 'vinculados' && !sel.has(b.id)) return false
    const s = q.trim().toLowerCase()
    return !s || b.nome.toLowerCase().includes(s)
  })

  function toggle(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  async function salvar() {
    setSalvando(true)
    const r = await vincularGrupoBancos(grupoId, [...sel])
    setSalvando(false)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao salvar vínculos.'); return }
    const partes = [r.vinculados ? `${r.vinculados} vinculado(s)` : '', r.desvinculados ? `${r.desvinculados} desvinculado(s)` : ''].filter(Boolean)
    toast.success(partes.length ? partes.join(' · ') : 'Vínculos atualizados.')
    onSalvo()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-page" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-pop relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Grupo › Bancos de questões</p>
            <h3 className="text-lg font-semibold">Vincular a bancos</h3>
            <p className="text-sm text-muted-foreground">Quem está em “{grupoNome}” recebe os simulados que herdam dos bancos marcados.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar banco"
              className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border text-sm">
            {(['todos', 'vinculados'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFiltro(f)}
                className={cn('px-3 py-1.5 font-medium transition-colors', filtro === f ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}>
                {f === 'todos' ? 'Todos' : 'Vinculados'}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-32 flex-1 overflow-y-auto px-2 py-2">
          {itens === null ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…</div>
          ) : erro ? (
            <div className="m-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" /> {erro}</div>
          ) : visiveis.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Nenhum banco encontrado.</div>
          ) : (
            <ul>
              {visiveis.map((b) => {
                const marcado = sel.has(b.id)
                return (
                  <li key={b.id}>
                    <div className="flex items-center gap-1 rounded-lg transition-colors hover:bg-muted/50">
                    <button type="button" onClick={() => toggle(b.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm">
                      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                        {marcado && <Check className="h-3 w-3" />}
                      </span>
                      <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{b.nome}</span>
                      {b.vinculado && !marcado && <span className="ml-auto text-[11px] text-rose-600 dark:text-rose-400">será desvinculado</span>}
                    </button>
                    <a href={`/admin/banco-questoes/${b.id}`} target="_blank" rel="noreferrer" title="Abrir produto em nova aba" aria-label={`Abrir ${b.nome}`}
                      className="mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t px-5 py-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Desmarcar um banco remove só o vínculo de auto-sync. Quem já tem acesso NÃO perde (nunca tiramos acesso de aluno em prova). A limpeza de órfãos é feita na área de Bancos.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || itens === null}><Check className="h-4 w-4" /> Salvar vínculos</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
