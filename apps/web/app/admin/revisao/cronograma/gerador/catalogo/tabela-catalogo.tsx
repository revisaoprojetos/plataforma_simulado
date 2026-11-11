'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { FolderInput, ListChecks, Loader2, Plus, Power, Tags, Trash2, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { PaginacaoBib } from '../../../biblioteca/paginacao-bib'
import type { CategoriaRow, CronogramaLista } from '@/app/admin/cronogramas/actions-tipos'
import {
  alternarLiberacao, alternarLiberacaoEmLote, atualizarCategoria, atualizarCronograma, criarCategoria, excluirCategoria, excluirCronograma,
} from '@/app/admin/cronogramas/actions'

// Tabela do catálogo (sub-aba "catálogo"): mesmo casco/seleção/rodapé da TabelaCron. Linhas, total e ordenação
// vêm resolvidos do servidor; aqui só há seleção e ações (reusam as actions atuais de /admin/cronogramas).

const PP = [10, 14, 25, 50, 100]
const NADA = '__sem__'

export function TabelaCatalogo({ head, itens, total, page, pp, categorias, perm, vazio }: {
  head: ReactNode; itens: CronogramaLista[]; total: number; page: number; pp: number; categorias: CategoriaRow[]
  perm: { liberar: boolean; editar: boolean; excluir: boolean }; vazio: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [navegando, nav] = useTransition()
  const [executando, executar] = useTransition()
  const [sel, setSel] = useState<Map<string, CronogramaLista>>(new Map())
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [mover, setMover] = useState<CronogramaLista[] | null>(null)
  const todos = itens.length > 0 && itens.every((r) => sel.has(r.id))
  const alvo = [...sel.values()]

  function ir(mudar: Record<string, string | undefined>) {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(mudar)) { if (v) q.set(k, v); else q.delete(k) }
    nav(() => { router.push(`${pathname}?${q.toString()}`) })
  }
  const marcar = (r: CronogramaLista, v: boolean) => setSel((s) => { const n = new Map(s); if (v) n.set(r.id, r); else n.delete(r.id); return n })
  const marcarPagina = (v: boolean) => setSel((s) => { const n = new Map(s); for (const r of itens) { if (v) n.set(r.id, r); else n.delete(r.id) } return n })
  const limpar = () => setSel(new Map())

  async function liberarUm(c: CronogramaLista) {
    setOcupado(c.id)
    const alvoLib = c.status !== 'liberado'
    const r = await alternarLiberacao(c.id, alvoLib)
    setOcupado(null)
    if (!r.ok) { toast.error(r.error ?? 'Não foi possível alterar.'); return }
    toast.success(alvoLib ? 'Liberado para os alunos' : 'Voltou a rascunho')
    router.refresh()
  }
  function lote(liberar: boolean) {
    const ids = alvo.map((c) => c.id)
    executar(async () => {
      const r = await alternarLiberacaoEmLote(ids, liberar)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível alterar.'); return }
      toast.success(r.semMetas ? `${r.alterados} alterado(s) — ${r.semMetas} sem metas ficaram de fora` : `${r.alterados} cronograma(s) ${liberar ? 'liberado(s)' : 'de volta a rascunho'}`)
      limpar(); router.refresh()
    })
  }
  async function excluirVarios(lista: CronogramaLista[]) {
    const comMetas = lista.reduce((a, c) => a + c.metas, 0)
    const ok = await confirmar({
      titulo: lista.length === 1 ? 'Excluir cronograma' : 'Excluir cronogramas',
      mensagem: lista.length === 1
        ? `"${lista[0].nome}" sai do catálogo${comMetas ? ` junto com as ${comMetas} metas` : ''}. Você pode restaurar pela Lixeira.`
        : `${lista.length} cronogramas saem do catálogo (${comMetas.toLocaleString('pt-BR')} metas no total). Você pode restaurar pela Lixeira.`,
      destrutivo: true,
    })
    if (!ok) return
    executar(async () => {
      let n = 0, falhas = 0
      for (const c of lista) { const r = await excluirCronograma(c.id); if (r.ok) n++; else falhas++ }
      if (n) toast.success(`${n} cronograma(s) excluído(s)`)
      if (falhas) toast.error(`${falhas} não puderam ser excluídos.`)
      limpar(); router.refresh()
    })
  }
  function moverPara(lista: CronogramaLista[], categoriaId: string | null) {
    executar(async () => {
      let n = 0, falhas = 0
      for (const c of lista) {
        const r = await atualizarCronograma(c.id, {
          nome: c.nome, carga_horaria: c.carga_horaria, total_semanas: c.total_semanas, dias_curso: c.dias_curso, dias_nome: c.dias_nome,
          semanas_revisao: c.semanas_revisao, categoria_id: categoriaId, subtitulo: null, ordem: c.ordem,
        })
        if (r.ok) n++; else falhas++
      }
      if (n) toast.success(`${n} cronograma(s) movido(s)`)
      if (falhas) toast.error(`${falhas} não puderam ser movidos.`)
      setMover(null); limpar(); router.refresh()
    })
  }

  return (
    <>
      <section className={cn('rounded-2xl border bg-card p-2 shadow-sm transition-opacity', (navegando || executando) && 'opacity-70')} aria-busy={navegando}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-9 px-3 py-2.5">
                  <input type="checkbox" aria-label="Selecionar todos desta página" checked={todos} onChange={(e) => marcarPagina(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" />
                </th>
                {head}
              </tr>
            </thead>
            <tbody>
              {itens.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">{vazio}</td></tr>}
              {itens.map((c) => (
                <tr key={c.id} className={cn('border-b last:border-0 hover:bg-muted/40', sel.has(c.id) && 'bg-primary/5')}>
                  <td className="px-3 py-1.5"><input type="checkbox" aria-label={`Selecionar ${c.nome}`} checked={sel.has(c.id)} onChange={(e) => marcar(c, e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" /></td>
                  <td className="px-3 py-1.5"><Link href={`/admin/cronogramas/${c.id}`} className="font-medium underline-offset-4 hover:underline">{c.nome}</Link></td>
                  <td className="px-3 py-1.5">
                    {c.status === 'liberado'
                      ? (c.pacotes === 0
                        ? <span title="Liberado, mas fora de qualquer pacote — nenhum aluno recebe" className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">Liberado · sem pacote</span>
                        : <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Liberado</span>)
                      : <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Rascunho</span>}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{c.categoria_nome ?? '—'}</td>
                  <td className="px-3 py-1.5 tabular-nums">{c.carga_horaria}h/dia <span className="text-xs text-muted-foreground">· {c.faixa}</span></td>
                  <td className="px-3 py-1.5 tabular-nums">{c.total_semanas}{c.semanas_revisao.length > 0 && <span className="text-xs text-muted-foreground"> · {c.semanas_revisao.length} rev.</span>}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{c.metas === 0 ? <span className="text-amber-700 dark:text-amber-400">sem metas</span> : c.metas.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{c.pacotes === 0 ? <span className="text-muted-foreground">nenhum</span> : c.pacotes}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-0.5">
                      {perm.liberar && (
                        <Button size="icon-sm" variant="ghost" onClick={() => liberarUm(c)} disabled={ocupado === c.id || (c.status !== 'liberado' && c.metas === 0)}
                          title={c.status === 'liberado' ? 'Liberado — voltar a rascunho' : c.metas === 0 ? 'Cadastre metas antes de liberar' : 'Liberar para os alunos'}>
                          {ocupado === c.id ? <Loader2 className="animate-spin" /> : <Power className={c.status === 'liberado' ? 'text-emerald-600' : 'text-muted-foreground'} />}
                        </Button>
                      )}
                      <Link href={`/admin/cronogramas/${c.id}`} title="Editar grade (metas e pacotes)" className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}><ListChecks /></Link>
                      {perm.editar && <Button size="icon-sm" variant="ghost" title="Mover para outra divisão" onClick={() => setMover([c])}><FolderInput /></Button>}
                      {perm.excluir && <Button size="icon-sm" variant="ghost" title="Excluir" disabled={executando} onClick={() => excluirVarios([c])}><Trash2 className="text-destructive" /></Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PaginacaoBib total={total} page={page} pp={pp} opcoesPP={PP} selecionados={sel.size} carregando={navegando}
        onPage={(p) => ir({ pag: p > 1 ? String(p) : undefined })} onPP={(n) => ir({ pps: String(n), pag: undefined })} />

      {sel.size > 0 && createPortal(
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card px-3 py-2 shadow-xl" role="toolbar" aria-label="Ações em massa">
          <b className="mr-1 text-sm">{sel.size} {sel.size === 1 ? 'selecionado' : 'selecionados'}</b>
          {perm.liberar && <Button size="sm" variant="outline" disabled={executando} onClick={() => lote(true)}>Liberar</Button>}
          {perm.liberar && <Button size="sm" variant="outline" disabled={executando} onClick={() => lote(false)}>Voltar a rascunho</Button>}
          {perm.editar && <Button size="sm" variant="outline" disabled={executando} onClick={() => setMover(alvo)}><FolderInput />Mover de divisão</Button>}
          {perm.excluir && <Button size="sm" variant="destructive" disabled={executando} onClick={() => excluirVarios(alvo)}><Trash2 />Excluir</Button>}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={limpar}><X />Limpar seleção</Button>
          {executando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>, document.body,
      )}

      {mover && <MoverDialog lista={mover} categorias={categorias} ocupado={executando} onClose={() => setMover(null)} onMover={(id) => moverPara(mover, id)} />}
    </>
  )
}

function MoverDialog({ lista, categorias, ocupado, onClose, onMover }: {
  lista: CronogramaLista[]; categorias: CategoriaRow[]; ocupado: boolean; onClose: () => void; onMover: (categoriaId: string | null) => void
}) {
  const [dest, setDest] = useState<string>(lista.length === 1 ? (lista[0].categoria_id ?? NADA) : NADA)
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mover {lista.length === 1 ? `“${lista[0].nome}”` : `${lista.length} cronogramas`}</DialogTitle>
          <DialogDescription>Escolha a divisão de destino. Para criar divisões, use “Divisões”.</DialogDescription>
        </DialogHeader>
        <select value={dest} onChange={(e) => setDest(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm">
          <option value={NADA}>Sem divisão</option>
          {categorias.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}
        </select>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={ocupado}>Cancelar</Button>
          <Button onClick={() => onMover(dest === NADA ? null : dest)} disabled={ocupado}>{ocupado ? 'Movendo…' : 'Mover'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Gerenciamento das divisões (categorias do catálogo): criar, renomear, excluir — actions atuais. */
export function DivisoesBotao({ categorias, podeEditar }: { categorias: CategoriaRow[]; podeEditar: boolean }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [nova, setNova] = useState('')
  const [pend, iniciar] = useTransition()

  function adicionar() {
    const nome = nova.trim()
    if (!nome) return
    iniciar(async () => {
      const r = await criarCategoria(nome, null)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível criar.'); return }
      toast.success(`Divisão "${nome}" criada`); setNova(''); router.refresh()
    })
  }
  function renomear(c: CategoriaRow, nome: string) {
    iniciar(async () => {
      const r = await atualizarCategoria(c.id, nome, c.cor)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível renomear.'); return }
      toast.success('Divisão renomeada'); router.refresh()
    })
  }
  function remover(c: CategoriaRow) {
    iniciar(async () => {
      const ok = await confirmar({
        titulo: 'Excluir divisão',
        mensagem: c.usos > 0 ? `"${c.nome}" está em ${c.usos} cronograma(s). Eles não são excluídos — apenas ficam sem divisão.` : `Excluir a divisão "${c.nome}"?`,
        destrutivo: true,
      })
      if (!ok) return
      const r = await excluirCategoria(c.id)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível excluir.'); return }
      toast.success('Divisão excluída'); router.refresh()
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}><Tags />Divisões</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Divisões</DialogTitle>
            <DialogDescription>Agrupam o catálogo. Renomear vale para todos os cronogramas; excluir não apaga cronograma nenhum, só o deixa sem divisão.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {categorias.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma divisão cadastrada ainda.</p>}
            {categorias.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Input defaultValue={c.nome} disabled={!podeEditar} onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== c.nome) renomear(c, n) }} />
                <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">{c.usos === 0 ? 'sem uso' : `${c.usos} cronograma(s)`}</span>
                {podeEditar && <Button size="icon-sm" variant="ghost" onClick={() => remover(c)} disabled={pend}><Trash2 className="text-destructive" /></Button>}
              </div>
            ))}
            {podeEditar && (
              <div className="flex items-center gap-2 border-t pt-3">
                <Input value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }} placeholder="Nome da divisão (ex.: Pré-Edital)" />
                <Button size="sm" onClick={adicionar} disabled={pend || !nova.trim()}><Plus /></Button>
              </div>
            )}
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setAberto(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
