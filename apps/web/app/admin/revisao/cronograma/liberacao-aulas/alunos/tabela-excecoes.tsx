'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Power, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Pilula } from '../../../_comp/lista'
import { PaginacaoBib } from '../../../biblioteca/paginacao-bib'
import { acaoMassaExcecoes, editarExcecao } from './actions-alunos'
import { ExcecaoDialogo } from './excecao-dialogo'
import { dataHoraBr, type AulaOpt, type ExcecaoLinha, type GrupoOpcao, type ModuloOpcao } from './tipos-alunos'

const CAMPO = 'h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
const PPS = [10, 25, 50, 100]

export function TabelaExcecoes({ produtoId, linhas, total, page, pp, head, podeEditar, aulas, modulos, grupos }: {
  produtoId: string; linhas: ExcecaoLinha[]; total: number; page: number; pp: number; head: ReactNode; podeEditar: boolean
  aulas: AulaOpt[]; modulos: ModuloOpcao[]; grupos: GrupoOpcao[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [navegando, nav] = useTransition()
  const [executando, executar] = useTransition()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [edit, setEdit] = useState<ExcecaoLinha | null>(null)
  const todos = linhas.length > 0 && linhas.every((l) => sel.has(l.id))

  function ir(mudar: Record<string, string | undefined>) {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(mudar)) { if (v) q.set(k, v); else q.delete(k) }
    nav(() => { router.push(`${pathname}?${q.toString()}`) })
  }
  function massa(tipo: 'ativar' | 'desativar' | 'excluir') {
    executar(async () => {
      const r = await acaoMassaExcecoes(produtoId, [...sel], tipo)
      if (!r.ok) return void toast.error(r.error)
      toast.success(`${r.afetadas} exceção(ões) ${tipo === 'excluir' ? 'excluída(s)' : tipo === 'ativar' ? 'ativada(s)' : 'desativada(s)'}`)
      setSel(new Set()); router.refresh()
    })
  }

  return (
    <>
      {podeEditar && (
        <div className="mb-3 flex justify-end">
          <ExcecaoDialogo produtoId={produtoId} aulas={aulas} modulos={modulos} grupos={grupos}
            trigger={(abrir) => <Button size="sm" onClick={abrir}><Plus />Nova exceção (em massa)</Button>} />
        </div>
      )}
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className={cn('overflow-x-auto', navegando && 'opacity-60')}>
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="border-b bg-muted/40"><tr>
              {podeEditar && <th className="w-9 px-3 py-2.5"><input type="checkbox" aria-label="Selecionar todas" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(linhas.map((l) => l.id)))} /></th>}
              {head}
            </tr></thead>
            <tbody className="divide-y">
              {linhas.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Nenhuma exceção encontrada.</td></tr>}
              {linhas.map((l) => (
                <tr key={l.id} className={cn('align-top hover:bg-muted/30', !l.ativo && 'opacity-60')}>
                  {podeEditar && <td className="px-3 py-2"><input type="checkbox" aria-label="Selecionar" checked={sel.has(l.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n })} /></td>}
                  <td className="px-3 py-2"><span className="block font-medium">{l.alvoTitulo}</span><span className="text-xs text-muted-foreground">{l.alvoTipo === 'aula' ? 'Aula' : 'Módulo'}</span></td>
                  <td className="px-3 py-2"><span className="block">{l.destinoNome}</span><span className="text-xs text-muted-foreground">{l.destinoSub}</span></td>
                  <td className="px-3 py-2"><Pilula tipo={l.acao === 'liberar' ? 'ok' : 'bad'}>{l.acao === 'liberar' ? 'Liberar' : 'Bloquear'}</Pilula></td>
                  <td className="max-w-[18rem] px-3 py-2 text-muted-foreground">{l.motivo || '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{l.expiraEm ? dataHoraBr(l.expiraEm).slice(0, 10) : 'Sem validade'}</td>
                  <td className="px-3 py-2">{!l.ativo ? <Pilula tipo="mut">Desativada</Pilula> : l.vigente ? <Pilula tipo="ok">Vigente</Pilula> : <Pilula tipo="warn">Expirada</Pilula>}</td>
                  <td className="px-3 py-2"><span className="block">{l.criadoPor}</span><span className="text-xs text-muted-foreground">{dataHoraBr(l.criadoEm)}</span></td>
                  {podeEditar && <td className="px-3 py-2 text-right"><Button size="icon-sm" variant="ghost" aria-label="Editar" onClick={() => setEdit(l)}><Pencil /></Button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PaginacaoBib total={total} page={page} pp={pp} opcoesPP={PPS} selecionados={sel.size} carregando={navegando}
        onPage={(p) => ir({ pag: p > 1 ? String(p) : undefined })} onPP={(n) => ir({ pps: String(n), pag: undefined })} />

      {edit && <EditarDialogo key={edit.id} produtoId={produtoId} linha={edit} onFechar={() => setEdit(null)} />}

      {podeEditar && sel.size > 0 && createPortal(
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card px-3 py-2 shadow-xl" role="toolbar" aria-label="Ações em massa">
          <b className="mr-1 text-sm">{sel.size} {sel.size === 1 ? 'selecionada' : 'selecionadas'}</b>
          <Button size="sm" variant="outline" disabled={executando} onClick={() => massa('ativar')}><Power />Ativar</Button>
          <Button size="sm" variant="outline" disabled={executando} onClick={() => massa('desativar')}><Power />Desativar</Button>
          <Button size="sm" variant="destructive" disabled={executando} onClick={async () => { if (await confirmar({ titulo: 'Excluir exceções', mensagem: `Excluir ${sel.size} exceção(ões)? Os alunos voltam a seguir trilha/planilha. O registro fica no log.`, confirmar: 'Excluir', destrutivo: true })) massa('excluir') }}><Trash2 />Excluir</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSel(new Set())}><X />Limpar seleção</Button>
          {executando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>, document.body,
      )}
    </>
  )
}

function EditarDialogo({ produtoId, linha, onFechar }: { produtoId: string; linha: ExcecaoLinha; onFechar: () => void }) {
  const router = useRouter()
  const [pend, iniciar] = useTransition()
  const [acao, setAcao] = useState(linha.acao)
  const [motivo, setMotivo] = useState(linha.motivo ?? '')
  const [validade, setValidade] = useState(linha.expiraEm ? new Date(linha.expiraEm).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '')
  const [ativo, setAtivo] = useState(linha.ativo)
  function salvar() {
    iniciar(async () => {
      const r = await editarExcecao(produtoId, linha.id, { acao, motivo, validade, ativo })
      if (!r.ok) return void toast.error(r.error)
      toast.success('Exceção atualizada'); onFechar(); router.refresh()
    })
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar exceção</DialogTitle>
          <DialogDescription>{linha.alvoTitulo} · {linha.destinoNome}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>Ação</Label>
            <select value={acao} onChange={(e) => setAcao(e.target.value as 'liberar' | 'bloquear')} className={CAMPO}><option value="liberar">Liberar</option><option value="bloquear">Bloquear</option></select></div>
          <div className="grid gap-1.5"><Label>Motivo</Label><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} /></div>
          <div className="grid gap-1.5"><Label>Válida até (vazio = sem validade)</Label><input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className={CAMPO} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />Ativa</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pend}>Cancelar</Button>
          <Button onClick={salvar} disabled={pend}>{pend && <Loader2 className="animate-spin" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
