'use client'

// Aba "Atualizações" do Produto (Estúdio): registro de versões dos materiais do currículo do produto.
// DataTable server-driven: a URL (?q ?page ?pp ?sort ?dir ?tipo ?status ?de ?ate) é a fonte da verdade; esta aba
// busca a página no servidor (listarAtualizacoesAction: .range()+count, filtros e ordenação no banco).
// LAZY: monta só na 1ª abertura da aba. "Registrar atualização" escolhe documentos do currículo (multisseleção)
// e reaproveita o RegistrarAtualizacaoDialog.

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardPen, Eye, EyeOff, Globe, Loader2, Pencil, Search, Trash2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { RegistrarAtualizacaoDialog } from '@/components/biblioteca/gestao/registrar-atualizacao-dialog'
import { EditarAtualizacaoDialog } from '@/components/biblioteca/gestao/editar-atualizacao-dialog'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { navProgressStart } from '@/lib/nav-progress'
import { NOME_TIPO_ATUALIZACAO, TIPOS_ATUALIZACAO } from '@/lib/admin-revisao/biblioteca-tipos'
import type { FiltroAtualizacoes, LinhaAtualizacao, StatusAtualizacao, TipoAtualizacao } from '@/lib/conteudo/atualizacoes-tipos'
import {
  alterarEstadoPontoAction, excluirPontoAction, listarAtualizacoesAction, listarDocumentosProdutoAction,
} from '@/app/admin/conteudos/atualizacoes-actions'

const SORTS = ['ocorrida_em', 'rotulo', 'tipo', 'status', 'criado_em'] as const
const selectCls = 'h-11 rounded-xl border bg-card px-3 text-[13.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function AbaAtualizacoes({ produtoId, podeEditar }: { produtoId: string; podeEditar: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [rows, setRows] = useState<LinhaAtualizacao[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [escolher, setEscolher] = useState(false)
  const [registrar, setRegistrar] = useState<string[] | null>(null)
  const [editando, setEditando] = useState<LinhaAtualizacao | null>(null)
  const seq = useRef(0)

  const q = sp.get('q') ?? '', tipo = (sp.get('tipo') ?? '') as TipoAtualizacao | '', status = (sp.get('status') ?? '') as StatusAtualizacao | ''
  const de = sp.get('de') ?? '', ate = sp.get('ate') ?? ''
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1)
  const pp = [5, 10, 25, 50].includes(Number(sp.get('pp'))) ? Number(sp.get('pp')) : 10
  const sortRaw = sp.get('sort') ?? 'ocorrida_em'
  const sort = (SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as FiltroAtualizacoes['sort']) : 'ocorrida_em'
  const dir = sp.get('sort') ? (sp.get('dir') === 'asc' ? 'asc' : 'desc') : 'desc'

  useEffect(() => {
    const mine = ++seq.current
    setLoading(true)
    listarAtualizacoesAction({ produtoId, q, tipo, status, de, ate, sort, dir, page, pp })
      .then((r) => { if (mine !== seq.current) return; if (r.ok) { setRows(r.rows); setTotal(r.total); setErro(null) } else { setRows([]); setTotal(0); setErro(r.error) } })
      .catch(() => { if (mine === seq.current) { setRows([]); setTotal(0); setErro('Falha ao carregar as atualizações.') } })
      .finally(() => { if (mine === seq.current) setLoading(false) })
  }, [produtoId, q, tipo, status, de, ate, sort, dir, page, pp, recarga])

  const recarregar = useCallback(() => setRecarga((n) => n + 1), [])
  function setFiltro(chave: string, valor: string) {
    const p = new URLSearchParams(sp.toString())
    valor ? p.set(chave, valor) : p.delete(chave)
    p.delete('page')
    navProgressStart(); router.push(`${pathname}${p.toString() ? `?${p}` : ''}`)
  }

  async function estado(ids: string[], acao: 'publicar' | 'rascunho' | 'ocultar' | 'exibir') {
    const r = await alterarEstadoPontoAction(ids, acao).catch(() => ({ ok: false as const, error: 'Falha de rede.' }))
    if (!r.ok) { toast.error(r.error); return }
    toast.success(acao === 'publicar' ? 'Publicado.' : acao === 'ocultar' ? 'Oculto para o aluno.' : acao === 'exibir' ? 'Visível ao aluno.' : 'Voltou a rascunho.')
    recarregar()
  }
  async function excluir(ids: string[]) {
    if (!(await confirmar({ titulo: 'Excluir atualização', mensagem: `Excluir ${ids.length === 1 ? 'este registro' : `${ids.length} registros`}? Some da lista e do aluno.`, confirmar: 'Excluir', destrutivo: true }))) return
    const r = await excluirPontoAction(ids).catch(() => ({ ok: false as const, error: 'Falha de rede.' }))
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Excluído.'); recarregar()
  }

  const columns: DataTableColumn<LinhaAtualizacao>[] = [
    { key: 'ocorrida_em', header: 'Data e hora', sortable: true, width: '10.5rem', render: (r) => <span className="tabular-nums">{formatBrt(r.ocorridaEm) ?? '—'}</span> },
    { key: 'rotulo', header: 'Rótulo', sortable: true, width: '11rem', render: (r) => r.rotulo ?? <span className="text-muted-foreground">—</span> },
    { key: 'material', header: 'Material', render: (r) => r.material, title: (r) => r.material },
    { key: 'tipo', header: 'Tipo', sortable: true, width: '9rem', render: (r) => NOME_TIPO_ATUALIZACAO[r.tipo] },
    {
      key: 'itens', header: 'Alterações', render: (r) => (r.itens.length ? <span><b>{r.itens.length}</b> · {r.itens[0].texto}</span> : r.texto), title: (r) => r.texto || r.itens.map((i) => i.texto).join(' · '),
    },
    {
      key: 'status', header: 'Estado', sortable: true, width: '9rem',
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', r.status === 'publicado' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{r.status === 'publicado' ? 'Publicado' : 'Rascunho'}</span>
          {!r.visivelAluno && <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-label="Oculto ao aluno" />}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {podeEditar && <Button onClick={() => setEscolher(true)}><ClipboardPen className="h-4 w-4" />Registrar atualização</Button>}
        <span className="text-sm text-muted-foreground">Pontos de versão dos materiais deste produto. O aluno vê data e hora, rótulo e lista de alterações.</span>
      </div>

      <DataTable<LinhaAtualizacao>
        rows={rows} total={total} loading={loading} error={erro}
        getRowId={(r) => r.id} columns={columns}
        defaultSort={{ key: 'ocorrida_em', dir: 'desc' }}
        searchable searchPlaceholder="Buscar por rótulo ou resumo…"
        nomeSingular="atualização" nomePlural="atualizações"
        selectable={podeEditar}
        filters={(
          <>
            <select aria-label="Tipo" value={tipo} onChange={(e) => setFiltro('tipo', e.target.value)} className={selectCls}>
              <option value="">Todos os tipos</option>
              {TIPOS_ATUALIZACAO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <select aria-label="Estado" value={status} onChange={(e) => setFiltro('status', e.target.value)} className={selectCls}>
              <option value="">Todos os estados</option>
              <option value="publicado">Publicado</option>
              <option value="rascunho">Rascunho</option>
            </select>
            <input type="date" aria-label="De" value={de} onChange={(e) => setFiltro('de', e.target.value)} className={selectCls} />
            <input type="date" aria-label="Até" value={ate} onChange={(e) => setFiltro('ate', e.target.value)} className={selectCls} />
          </>
        )}
        rowActions={podeEditar ? (r) => [
          { label: 'Editar', icon: <Pencil className="h-4 w-4" />, onClick: () => setEditando(r) },
          r.status === 'rascunho'
            ? { label: 'Publicar', icon: <Globe className="h-4 w-4" />, onClick: () => void estado([r.id], 'publicar') }
            : { label: 'Voltar a rascunho', icon: <Pencil className="h-4 w-4" />, onClick: () => void estado([r.id], 'rascunho') },
          r.visivelAluno
            ? { label: 'Ocultar do aluno', icon: <EyeOff className="h-4 w-4" />, onClick: () => void estado([r.id], 'ocultar') }
            : { label: 'Exibir ao aluno', icon: <Eye className="h-4 w-4" />, onClick: () => void estado([r.id], 'exibir') },
          { label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => void excluir([r.id]) },
        ] : undefined}
        bulkActions={(sel) => (
          sel.allMatching ? <span className="text-xs text-muted-foreground">Ações em lote valem só para linhas marcadas.</span> : (
            <>
              <Button size="sm" variant="outline" onClick={() => void estado(sel.ids, 'publicar').then(sel.clear)}><Globe className="h-4 w-4" />Publicar</Button>
              <Button size="sm" variant="outline" onClick={() => void estado(sel.ids, 'ocultar').then(sel.clear)}><EyeOff className="h-4 w-4" />Ocultar</Button>
              <Button size="sm" variant="destructive" onClick={() => void excluir(sel.ids).then(sel.clear)}><Trash2 className="h-4 w-4" />Excluir</Button>
            </>
          )
        )}
      />

      {escolher && (
        <EscolherDocumentosDialog produtoId={produtoId} onClose={() => setEscolher(false)} onConfirmar={(ids) => { setEscolher(false); setRegistrar(ids) }} />
      )}
      <RegistrarAtualizacaoDialog
        documentoIds={registrar ?? []} produtoId={produtoId} open={registrar !== null}
        onOpenChange={(o) => { if (!o) setRegistrar(null) }} onDone={recarregar}
      />
      <EditarAtualizacaoDialog registro={editando} onClose={() => setEditando(null)} onDone={recarregar} />
    </div>
  )
}

/** Multisseleção dos documentos do currículo do produto (busca + "carregar mais" no servidor). */
function EscolherDocumentosDialog({ produtoId, onClose, onConfirmar }: { produtoId: string; onClose: () => void; onConfirmar: (ids: string[]) => void }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<{ id: string; titulo: string }[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [buscando, setBuscando] = useState(true)
  const [sel, setSel] = useState<Map<string, string>>(new Map())
  const seq = useRef(0)

  function buscar(pg: number, anexar: boolean) {
    const mine = ++seq.current
    setBuscando(true)
    listarDocumentosProdutoAction(produtoId, q, pg)
      .then((r) => {
        if (mine !== seq.current) return
        const novos = r.ok ? r.rows : []
        setRows((cur) => (anexar ? [...cur, ...novos.filter((n) => !cur.some((c) => c.id === n.id))] : novos)); setTotal(r.ok ? r.total : 0); setPagina(pg)
      })
      .catch(() => { if (mine === seq.current) { setRows([]); setTotal(0) } })
      .finally(() => { if (mine === seq.current) setBuscando(false) })
  }
  useEffect(() => {
    const t = setTimeout(() => buscar(1, false), q ? 250 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const toggle = (id: string, titulo: string) => setSel((p) => { const n = new Map(p); n.has(id) ? n.delete(id) : n.set(id, titulo); return n })
  const todosMarcados = rows.length > 0 && rows.every((r) => sel.has(r.id))
  const marcarPagina = () => setSel((p) => { const n = new Map(p); if (todosMarcados) rows.forEach((r) => n.delete(r.id)); else rows.forEach((r) => n.set(r.id, r.titulo)); return n })

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-[min(640px,calc(100vw-2rem))] max-w-[min(640px,calc(100vw-2rem))] sm:max-w-[min(640px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Quais materiais mudaram?</DialogTitle>
          <DialogDescription>Escolha um ou mais materiais do currículo deste produto. Cada um recebe seu registro (mesmo lote).</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material pelo título" className="pl-8" />
        </div>
        <div className="max-h-[42vh] overflow-y-auto rounded-xl border">
          {buscando && rows.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Buscando…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Nenhum material de Biblioteca no currículo deste produto.</div>
          ) : (
            <ul>
              {rows.map((r) => {
                const on = sel.has(r.id)
                return (
                  <li key={r.id} className={cn('border-b last:border-0', on && 'bg-primary/5')}>
                    <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(r.id, r.titulo)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-muted/40">
                      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on ? '✓' : ''}</span>
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{r.titulo}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{rows.length} de {total} · <button type="button" className="font-medium text-primary hover:underline" onClick={marcarPagina} disabled={rows.length === 0}>{todosMarcados ? 'Desmarcar os listados' : 'Marcar os listados'}</button></span>
          {rows.length < total && <Button variant="ghost" size="sm" onClick={() => buscar(pagina + 1, true)} disabled={buscando}>{buscando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Carregar mais</Button>}
        </div>
        <DialogFooter>
          <span className="mr-auto self-center text-sm text-muted-foreground">{sel.size} selecionado{sel.size === 1 ? '' : 's'}</span>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={sel.size === 0} onClick={() => onConfirmar([...sel.keys()])}>Continuar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
