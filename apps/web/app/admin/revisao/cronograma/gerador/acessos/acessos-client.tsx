'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Download, Eye, EyeOff, Globe, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { PaginacaoBib } from '../../../biblioteca/paginacao-bib'
import { alternarAcessoGratuitoPacote, atualizarPacote, criarPacote, excluirPacote } from '@/app/admin/cronogramas/pacotes/actions'

// Sub-aba Grupos de acessos: tabela com o MESMO casco/paginação da TabelaCron (PaginacaoBib), mas com barra de ações em massa
// própria dos pacotes (a TabelaCron só conhece cobertura/disciplinas/sprints/versões). Todas as mutações são as actions
// existentes de /admin/cronogramas/pacotes/actions.ts (checkPermission + auditoria dentro delas).

export interface PacoteSel {
  id: string; nome: string; descricao: string | null; ativo: boolean; acesso_gratuito: boolean
  cronogramas: number; grupos: number; estudantes: number; alcance: number
}
export interface LinhaPacote { id: string; dados: PacoteSel; cells: ReactNode[] }
interface Perm { editar: boolean; excluir: boolean; liberar: boolean }

const PP = [10, 14, 25, 50, 100]

export function TabelaAcessos({ head, rows, total, page, pp, perm, vazio, colunas }: {
  head: ReactNode; rows: LinhaPacote[]; total: number; page: number; pp: number; perm: Perm; vazio: ReactNode; colunas: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [navegando, nav] = useTransition()
  const [executando, executar] = useTransition()
  const [sel, setSel] = useState<Map<string, PacoteSel>>(new Map())
  const selecionavel = perm.editar || perm.excluir || perm.liberar
  const todos = rows.length > 0 && rows.every((r) => sel.has(r.id))
  const alvo = [...sel.values()]

  function ir(mudar: Record<string, string | undefined>) {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(mudar)) { if (v) q.set(k, v); else q.delete(k) }
    nav(() => { router.push(`${pathname}?${q.toString()}`) })
  }
  const marcar = (r: LinhaPacote, v: boolean) => setSel((s) => { const n = new Map(s); if (v) n.set(r.id, r.dados); else n.delete(r.id); return n })
  const marcarPagina = (v: boolean) => setSel((s) => { const n = new Map(s); for (const r of rows) { if (v) n.set(r.id, r.dados); else n.delete(r.id) } return n })
  const limpar = () => setSel(new Map())

  function lote(fn: (p: PacoteSel) => Promise<{ ok: boolean; error?: string }>, ok: (n: number) => string) {
    executar(async () => {
      let n = 0, ultimoErro: string | undefined
      for (const p of alvo) { const r = await fn(p); if (r.ok) n++; else ultimoErro = r.error }
      if (n) { toast.success(ok(n)); limpar(); router.refresh() }
      if (n < alvo.length) toast.error(ultimoErro ?? `${alvo.length - n} item(ns) não puderam ser alterados.`)
    })
  }
  function exportarCsv() {
    const linhas = [['Nome', 'Cronogramas', 'Grupos', 'Avulsos', 'Alunos', 'Ativo', 'Gratuito'],
      ...alvo.map((p) => [p.nome, p.cronogramas, p.grupos, p.estudantes, p.alcance, p.ativo ? 'sim' : 'não', p.acesso_gratuito ? 'sim' : 'não'].map(String))]
    const csv = linhas.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'grupos-de-acesso.csv'; a.click(); URL.revokeObjectURL(url)
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
                <tr key={r.id} className={cn('border-b last:border-0 hover:bg-muted/40', sel.has(r.id) && 'bg-primary/5', !r.dados.ativo && 'opacity-60')}>
                  {selecionavel && (
                    <td className="px-3 py-1.5"><input type="checkbox" aria-label="Selecionar linha" checked={sel.has(r.id)} onChange={(e) => marcar(r, e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" /></td>
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

      {selecionavel && sel.size > 0 && createPortal(
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card px-3 py-2 shadow-xl" role="toolbar" aria-label="Ações em massa">
          <b className="mr-1 text-sm">{sel.size} {sel.size === 1 ? 'selecionado' : 'selecionados'}</b>
          {perm.editar && (
            <>
              <Button size="sm" variant="outline" disabled={executando} onClick={() => lote((p) => atualizarPacote(p.id, p.nome, p.descricao, true), (n) => `${n} grupo(s) ativado(s)`)}><Eye />Ativar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={() => lote((p) => atualizarPacote(p.id, p.nome, p.descricao, false), (n) => `${n} grupo(s) desativado(s)`)}><EyeOff />Desativar</Button>
            </>
          )}
          {perm.liberar && (
            <>
              <Button size="sm" variant="outline" disabled={executando} onClick={async () => {
                if (await confirmar({ titulo: 'Liberar para todos os alunos', mensagem: `Liberar ${alvo.length} grupo(s) de acesso para TODOS os alunos da plataforma? Os cronogramas deles ficam disponíveis a qualquer aluno.`, confirmar: 'Liberar' }))
                  lote((p) => alternarAcessoGratuitoPacote(p.id, true), (n) => `${n} grupo(s) liberado(s) para todos`)
              }}><Globe />Liberar a todos</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={() => lote((p) => alternarAcessoGratuitoPacote(p.id, false), (n) => `${n} grupo(s) sem acesso geral`)}>Tirar acesso geral</Button>
            </>
          )}
          <Button size="sm" variant="outline" disabled={executando} onClick={exportarCsv}><Download />Exportar CSV</Button>
          {perm.excluir && (
            <Button size="sm" variant="destructive" disabled={executando} onClick={async () => {
              if (await confirmar({ titulo: 'Excluir grupos de acesso', mensagem: `Excluir ${alvo.length} grupo(s) de acesso? Os alunos deixam de receber os cronogramas deles.`, confirmar: 'Excluir', destrutivo: true }))
                lote((p) => excluirPacote(p.id), (n) => `${n} grupo(s) excluído(s)`)
            }}><Trash2 />Excluir</Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={limpar}><X />Limpar seleção</Button>
          {executando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>, document.body,
      )}
    </>
  )
}

function PacoteDialogo({ pacote, open, onOpenChange }: { pacote: PacoteSel | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const [nome, setNome] = useState(pacote?.nome ?? '')
  const [descricao, setDescricao] = useState(pacote?.descricao ?? '')
  const [pendente, iniciar] = useTransition()
  function salvar() {
    if (!nome.trim()) { toast.error('Informe um nome.'); return }
    iniciar(async () => {
      const r = pacote ? await atualizarPacote(pacote.id, nome.trim(), descricao.trim() || null, pacote.ativo) : await criarPacote(nome.trim(), descricao.trim() || null)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível salvar.'); return }
      toast.success(pacote ? 'Grupo de acesso atualizado' : 'Grupo de acesso criado')
      onOpenChange(false)
      router.refresh()
    })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pacote ? 'Editar grupo de acesso' : 'Novo grupo de acesso'}</DialogTitle>
          <DialogDescription>Um grupo de acesso reúne cronogramas e libera para grupos de alunos ou avulsos. Depois de criar, abra o editor para vincular cronogramas e grupos.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') salvar() }} autoFocus placeholder="ex.: Pré-Edital AGU" />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Para que serve este grupo de acesso" className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pendente}>Cancelar</Button>
          <Button onClick={salvar} disabled={pendente || !nome.trim()}>{pendente ? 'Salvando…' : pacote ? 'Salvar' : 'Criar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function NovoPacote() {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)}><Plus />Novo grupo de acesso</Button>
      {aberto && <PacoteDialogo pacote={null} open={aberto} onOpenChange={setAberto} />}
    </>
  )
}

export function AcoesPacote({ p, perm }: { p: PacoteSel; perm: Perm }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [editando, setEditando] = useState(false)
  function alternar() {
    iniciar(async () => {
      const r = await atualizarPacote(p.id, p.nome, p.descricao, !p.ativo)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível alterar.'); return }
      toast.success(p.ativo ? 'Grupo desativado' : 'Grupo ativado')
      router.refresh()
    })
  }
  async function remover() {
    if (!(await confirmar({ titulo: 'Excluir grupo de acesso', mensagem: `Excluir o grupo de acesso "${p.nome}"? Os alunos deixam de receber os cronogramas dele.`, confirmar: 'Excluir', destrutivo: true }))) return
    iniciar(async () => {
      const r = await excluirPacote(p.id)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível excluir.'); return }
      toast.success('Grupo de acesso excluído')
      router.refresh()
    })
  }
  return (
    <span className="flex items-center justify-end gap-1">
      <Link href={`/admin/cronogramas/pacotes/${p.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Abrir editor</Link>
      {perm.editar && (
        <>
          <Button size="icon-sm" variant="ghost" onClick={() => setEditando(true)} disabled={pendente} title="Renomear / descrição" aria-label="Renomear / descrição"><Pencil /></Button>
          <Button size="icon-sm" variant="ghost" onClick={alternar} disabled={pendente} title={p.ativo ? 'Desativar' : 'Ativar'} aria-label={p.ativo ? 'Desativar' : 'Ativar'}>{p.ativo ? <Eye /> : <EyeOff />}</Button>
        </>
      )}
      {perm.excluir && <Button size="icon-sm" variant="ghost" onClick={remover} disabled={pendente} title="Excluir" aria-label="Excluir"><Trash2 className="text-destructive" /></Button>}
      {editando && <PacoteDialogo pacote={p} open={editando} onOpenChange={setEditando} />}
    </span>
  )
}
