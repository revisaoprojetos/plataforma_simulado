'use client'

// Registro de atualizações de UM documento (sub-aba do Histórico na gestão da Biblioteca).
// Lista paginada no servidor (10 por vez, "Carregar mais"), busca por rótulo/resumo e filtro de estado.

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ClipboardPen, Eye, EyeOff, Globe, Loader2, Pencil, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { NOME_TIPO_ATUALIZACAO } from '@/lib/admin-revisao/biblioteca-tipos'
import type { LinhaAtualizacao, StatusAtualizacao } from '@/lib/conteudo/atualizacoes-tipos'
import { alterarEstadoPontoAction, excluirPontoAction, listarAtualizacoesAction } from '@/app/admin/conteudos/atualizacoes-actions'
import { RegistrarAtualizacaoDialog } from './registrar-atualizacao-dialog'
import { EditarAtualizacaoDialog } from './editar-atualizacao-dialog'

export function AtualizacoesDocumento({ documentoId, versaoId = null, podeEditar = true }: { documentoId: string; versaoId?: string | null; podeEditar?: boolean }) {
  const [rows, setRows] = useState<LinhaAtualizacao[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusAtualizacao | ''>('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [registrar, setRegistrar] = useState(false)
  const [editando, setEditando] = useState<LinhaAtualizacao | null>(null)
  const seq = useRef(0)

  const carregar = useCallback((pg: number, anexar: boolean) => {
    const mine = ++seq.current
    setLoading(true)
    listarAtualizacoesAction({ documentoId, q, status, page: pg, pp: 10 })
      .then((r) => {
        if (mine !== seq.current) return
        if (r.ok) { setRows((cur) => (anexar ? [...cur, ...r.rows] : r.rows)); setTotal(r.total); setPagina(pg); setErro(null) } else { setRows([]); setTotal(0); setErro(r.error) }
      })
      .catch(() => { if (mine === seq.current) setErro('Falha ao carregar as atualizações.') })
      .finally(() => { if (mine === seq.current) setLoading(false) })
  }, [documentoId, q, status])

  useEffect(() => {
    const t = setTimeout(() => carregar(1, false), q ? 250 : 0)
    return () => clearTimeout(t)
  }, [carregar, q])

  async function estado(id: string, acao: 'publicar' | 'rascunho' | 'ocultar' | 'exibir') {
    const r = await alterarEstadoPontoAction([id], acao).catch(() => ({ ok: false as const, error: 'Falha de rede.' }))
    if (!r.ok) { toast.error(r.error); return }
    carregar(1, false)
  }
  async function excluir(id: string) {
    if (!(await confirmar({ titulo: 'Excluir atualização', mensagem: 'Excluir este registro? Some da lista e do aluno.', confirmar: 'Excluir', destrutivo: true }))) return
    const r = await excluirPontoAction([id]).catch(() => ({ ok: false as const, error: 'Falha de rede.' }))
    if (!r.ok) { toast.error(r.error); return }
    carregar(1, false)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por rótulo ou resumo" className="pl-8" />
        </div>
        <select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as StatusAtualizacao | '')} className="h-9 rounded-lg border bg-card px-2.5 text-sm">
          <option value="">Todos os estados</option><option value="publicado">Publicado</option><option value="rascunho">Rascunho</option>
        </select>
        {podeEditar && <Button size="sm" onClick={() => setRegistrar(true)}><ClipboardPen className="h-4 w-4" />Registrar atualização</Button>}
      </div>

      {erro ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{erro}</div>
      ) : rows.length === 0 && !loading ? (
        <div className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">Nenhuma atualização registrada para este material.</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{r.rotulo ?? NOME_TIPO_ATUALIZACAO[r.tipo]}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{NOME_TIPO_ATUALIZACAO[r.tipo]}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', r.status === 'publicado' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{r.status === 'publicado' ? 'Publicado' : 'Rascunho'}</span>
                {!r.visivelAluno && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><EyeOff className="h-3 w-3" />oculto ao aluno</span>}
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">{formatBrt(r.ocorridaEm)}</span>
              </div>
              {r.texto && <p className="mt-1.5 text-sm text-foreground/90">{r.texto}</p>}
              {r.itens.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-foreground/90">
                  {r.itens.map((i, k) => <li key={k}>{i.texto}{i.local ? <span className="text-muted-foreground"> — {i.local}</span> : null}</li>)}
                </ul>
              )}
              {podeEditar && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="xs" variant="outline" onClick={() => setEditando(r)}><Pencil className="h-3.5 w-3.5" />Editar</Button>
                  {r.status === 'rascunho' && <Button size="xs" variant="outline" onClick={() => void estado(r.id, 'publicar')}><Globe className="h-3.5 w-3.5" />Publicar</Button>}
                  <Button size="xs" variant="outline" onClick={() => void estado(r.id, r.visivelAluno ? 'ocultar' : 'exibir')}>{r.visivelAluno ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{r.visivelAluno ? 'Ocultar' : 'Exibir'}</Button>
                  <Button size="xs" variant="outline" className="text-destructive" onClick={() => void excluir(r.id)}><Trash2 className="h-3.5 w-3.5" />Excluir</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{loading ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando…</span> : `${rows.length} de ${total}`}</span>
        {rows.length < total && <Button variant="ghost" size="sm" disabled={loading} onClick={() => carregar(pagina + 1, true)}>Carregar mais</Button>}
      </div>

      <RegistrarAtualizacaoDialog documentoIds={[documentoId]} versaoId={versaoId} open={registrar} onOpenChange={setRegistrar} onDone={() => carregar(1, false)} />
      <EditarAtualizacaoDialog registro={editando} onClose={() => setEditando(null)} onDone={() => carregar(1, false)} />
    </div>
  )
}
