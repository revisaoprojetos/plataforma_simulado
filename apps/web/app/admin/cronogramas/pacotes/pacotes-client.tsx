'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Search, X, Plus, Package, Users, Pencil, Trash2, Loader2, ArrowUpDown, Download, Boxes } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { criarPacote, atualizarPacote, excluirPacote, type PacoteLista } from './actions'

const nf = (n: number) => n.toLocaleString('pt-BR')
// Grade das colunas (px + fr) — casa cabeçalho e linhas, igual à área de Grupos.
const GRID = '32px minmax(0,1fr) 230px 104px 92px'

type Ordem = 'nome' | 'nome_desc' | 'alcance' | 'cronogramas'
const ORDENS: { v: Ordem; label: string }[] = [
  { v: 'nome', label: 'Nome (A → Z)' },
  { v: 'nome_desc', label: 'Nome (Z → A)' },
  { v: 'alcance', label: 'Mais alunos' },
  { v: 'cronogramas', label: 'Mais cronogramas' },
]

export function PacotesClient({ inicial }: { inicial: PacoteLista[] }) {
  const router = useRouter()
  const [itens, setItens] = useState(inicial)
  const [pending, start] = useTransition()
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('nome')
  const [sel, setSel] = useState<Set<string>>(() => new Set<string>())
  const [dialog, setDialog] = useState<{ modo: 'novo' } | { modo: 'editar'; p: PacoteLista } | null>(null)

  const totalCrono = useMemo(() => itens.reduce((a, p) => a + p.cronogramas, 0), [itens])
  const totalAlcance = useMemo(() => itens.reduce((a, p) => a + p.alcance, 0), [itens])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const arr = itens.filter((p) => !q || p.nome.toLowerCase().includes(q) || (p.descricao ?? '').toLowerCase().includes(q))
    const cmp: Record<Ordem, (a: PacoteLista, b: PacoteLista) => number> = {
      nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
      nome_desc: (a, b) => b.nome.localeCompare(a.nome, 'pt-BR'),
      alcance: (a, b) => b.alcance - a.alcance || a.nome.localeCompare(b.nome, 'pt-BR'),
      cronogramas: (a, b) => b.cronogramas - a.cronogramas || a.nome.localeCompare(b.nome, 'pt-BR'),
    }
    return [...arr].sort(cmp[ordem])
  }, [itens, busca, ordem])

  const ids = useMemo(() => filtrados.map((p) => p.id), [filtrados])
  const todosMarcados = ids.length > 0 && ids.every((id) => sel.has(id))
  const selecionados = useMemo(() => [...sel].map((id) => itens.find((p) => p.id === id)).filter(Boolean) as PacoteLista[], [sel, itens])

  function toggleSel(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  async function excluir(p: PacoteLista) {
    if (!(await confirmar({ mensagem: `Excluir o grupo de acesso "${p.nome}"? Os alunos deixam de receber os cronogramas dele.`, destrutivo: true }))) return
    start(async () => {
      const r = await excluirPacote(p.id)
      if (r.ok) { toast.success('Grupo de acesso excluído'); setItens((xs) => xs.filter((x) => x.id !== p.id)); setSel((s) => { const n = new Set(s); n.delete(p.id); return n }) }
      else toast.error(r.error ?? 'Erro ao excluir')
    })
  }
  async function excluirEmLote() {
    const n = selecionados.length
    if (!n || !(await confirmar({ mensagem: `Excluir ${n} grupo(s) de acesso selecionado(s)?`, destrutivo: true }))) return
    start(async () => {
      let ok = 0
      for (const p of selecionados) { const r = await excluirPacote(p.id); if (r.ok) ok++ }
      const removidos = new Set(selecionados.map((p) => p.id))
      setItens((xs) => xs.filter((x) => !removidos.has(x.id)))
      setSel(new Set())
      ok ? toast.success(`${ok} excluído(s)`) : toast.error('Nada foi excluído')
    })
  }
  function exportarCsv() {
    const linhas = [['Nome', 'Cronogramas', 'Grupos', 'Avulsos', 'Alunos', 'Ativo'],
      ...selecionados.map((p) => [p.nome, String(p.cronogramas), String(p.grupos), String(p.estudantes), String(p.alcance), p.ativo ? 'sim' : 'não'])]
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'grupos-de-acesso.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const nada = itens.length === 0

  return (
    <div className="space-y-5 pb-24">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Grupos de acesso" valor={nf(itens.length)} hint="conjuntos de cronogramas" />
        <Kpi label="Cronogramas" valor={nf(totalCrono)} hint="vínculos no total" />
        <Kpi label="Alunos alcançados" valor={nf(totalAlcance)} hint="via grupos + avulsos" destaque={totalAlcance > 0} />
      </div>

      {nada ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card py-16 text-center text-muted-foreground shadow-sm">
          <Boxes className="h-8 w-8 opacity-40" />
          <p className="text-sm">Nenhum grupo de acesso ainda.</p>
          <button type="button" onClick={() => setDialog({ modo: 'novo' })} className="text-sm font-medium text-primary hover:underline">Criar o primeiro</button>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar grupo de acesso…"
                className="w-full rounded-lg border bg-card py-2 pl-9 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              {busca && <button type="button" onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
            </div>
            <Select value={ordem} onValueChange={(v) => v && setOrdem(v as Ordem)}>
              <SelectTrigger className="h-10 gap-2"><ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" /><SelectValue>{(v: string) => ORDENS.find((o) => o.v === v)?.label}</SelectValue></SelectTrigger>
              <SelectContent>{ORDENS.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex-1" />
            <button type="button" onClick={() => setDialog({ modo: 'novo' })} disabled={pending}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Novo grupo de acesso
            </button>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div style={{ gridTemplateColumns: GRID }} className="grid items-center gap-2 border-b bg-muted/40 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <div className="flex justify-center">
                  <input type="checkbox" checked={todosMarcados} onChange={() => setSel(todosMarcados ? new Set() : new Set(ids))} className="h-4 w-4 cursor-pointer accent-primary" aria-label="Selecionar todos" />
                </div>
                <div>Grupo de acesso</div>
                <div>Conteúdo</div>
                <div>Alunos</div>
                <div className="pr-1 text-right">Ações</div>
              </div>

              {filtrados.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
                  <Search className="h-6 w-6 opacity-40" />
                  <p className="text-sm font-semibold text-foreground">Nenhum grupo de acesso encontrado</p>
                  <p className="text-xs">Ajuste a busca.</p>
                </div>
              ) : filtrados.map((p) => (
                <LinhaPacote key={p.id} p={p} marcado={sel.has(p.id)} onSel={() => toggleSel(p.id)} onEdit={() => setDialog({ modo: 'editar', p })} onDelete={() => excluir(p)} />
              ))}
            </div>
          </div>

          {/* Rodapé */}
          <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            <span>Mostrando {nf(filtrados.length)} de {nf(itens.length)} · {nf(totalAlcance)} alunos no total</span>
            {busca && <button type="button" onClick={() => setBusca('')} className="font-semibold text-primary hover:underline">Limpar busca</button>}
          </div>
        </section>
      )}

      {/* Barra de seleção em massa (igual à área de Grupos) */}
      {sel.size > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border bg-card py-2.5 pl-4 pr-2.5 shadow-2xl">
          <span className="text-sm font-bold">{nf(sel.size)} {sel.size === 1 ? 'selecionado' : 'selecionados'}</span>
          <span className="h-5 w-px bg-border" />
          <button type="button" onClick={exportarCsv} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm font-semibold transition-colors hover:border-primary hover:text-primary">
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
          <button type="button" onClick={excluirEmLote} disabled={pending}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 text-sm font-bold text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Excluir
          </button>
          <button type="button" onClick={() => setSel(new Set())} title="Limpar seleção" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      )}

      {dialog && (
        <PacoteDialog
          pacote={dialog.modo === 'editar' ? dialog.p : null}
          onClose={() => setDialog(null)}
          onSalvo={(p, novo) => {
            setItens((xs) => (novo ? [...xs, p] : xs.map((x) => (x.id === p.id ? { ...x, ...p } : x))))
            if (novo) router.refresh()
          }}
        />
      )}
    </div>
  )
}

function Kpi({ label, valor, hint, destaque }: { label: string; valor: string; hint: string; destaque?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-3.5 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn('text-2xl font-extrabold tracking-tight', destaque && 'text-emerald-500')}>{valor}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
    </div>
  )
}

function LinhaPacote({ p, marcado, onSel, onEdit, onDelete }: { p: PacoteLista; marcado: boolean; onSel: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <div style={{ gridTemplateColumns: GRID }}
      className={cn('group grid items-center gap-2 border-b border-border/60 px-3 py-2.5 transition-colors hover:bg-muted/40', marcado && 'bg-primary/5', !p.ativo && 'opacity-60')}>
      <div className="flex justify-center">
        <input type="checkbox" checked={marcado} onChange={onSel} className="h-4 w-4 cursor-pointer accent-primary" aria-label={`Selecionar ${p.nome}`} />
      </div>

      {/* Nome */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Package className="h-4 w-4" /></span>
        <Link href={`/admin/cronogramas/pacotes/${p.id}`} className="truncate text-[13.5px] font-medium hover:text-primary">{p.nome}</Link>
        {!p.ativo && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">inativo</span>}
        {p.acesso_gratuito && <span className="shrink-0 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">gratuito</span>}
      </div>

      {/* Conteúdo */}
      <div className="min-w-0 truncate text-xs text-muted-foreground">
        {p.cronogramas} cronograma(s) · {p.grupos} grupo(s){p.estudantes > 0 ? ` · ${p.estudantes} avulso(s)` : ''}
      </div>

      {/* Alunos */}
      <div className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-[12.5px] font-medium text-foreground/80">{nf(p.alcance)}</span>
      </div>

      {/* Ações */}
      <div className="flex items-center justify-end gap-0.5">
        <button type="button" onClick={onEdit} title="Renomear / descrição" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"><Pencil className="h-4 w-4" /></button>
        <button type="button" onClick={onDelete} title="Excluir" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  )
}

/** Diálogo criar/editar um grupo de acesso (nome + descrição). */
function PacoteDialog({ pacote, onClose, onSalvo }: { pacote: PacoteLista | null; onClose: () => void; onSalvo: (p: PacoteLista, novo: boolean) => void }) {
  const editar = !!pacote
  const [nome, setNome] = useState(pacote?.nome ?? '')
  const [descricao, setDescricao] = useState(pacote?.descricao ?? '')
  const [pending, start] = useTransition()

  function salvar() {
    if (!nome.trim()) { toast.error('Informe um nome.'); return }
    start(async () => {
      if (editar) {
        const r = await atualizarPacote(pacote!.id, nome.trim(), descricao.trim() || null, pacote!.ativo)
        if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar'); return }
        toast.success('Grupo de acesso atualizado')
        onSalvo({ ...pacote!, nome: nome.trim(), descricao: descricao.trim() || null }, false)
      } else {
        const r = await criarPacote(nome.trim(), descricao.trim() || null)
        if (!r.ok || !r.id) { toast.error(r.error ?? 'Erro ao criar'); return }
        toast.success('Grupo de acesso criado')
        onSalvo({ id: r.id, nome: nome.trim(), descricao: descricao.trim() || null, ativo: true, acesso_gratuito: false, ordem: 0, cronogramas: 0, grupos: 0, estudantes: 0, alcance: 0 }, true)
      }
      onClose()
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-pop relative w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4" /> {editar ? 'Editar grupo de acesso' : 'Novo grupo de acesso'}</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') salvar() }} autoFocus placeholder="ex.: Pré-Edital AGU"
              className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Descrição <span className="font-normal">(opcional)</span></label>
            <textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Para que serve este grupo de acesso"
              className="w-full resize-y rounded-lg border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <p className="text-xs text-muted-foreground">Um grupo de acesso reúne cronogramas e libera para grupos de alunos ou avulsos. Depois de criar, abra-o para vincular cronogramas e grupos.</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={pending || !nome.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editar ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
