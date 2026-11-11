'use client'

// PÚBLICO RÁPIDO — escolher GRUPOS e ALUNOS específicos (em massa ou um a um) em vez de montar condições.
// Por baixo continua sendo um segmento: a seleção vira (ou reaproveita) um segmento "OU" com
// "Grupo de acesso · está no grupo X" e "E-mail · igual a Y". Quem está em QUALQUER item da seleção entra.
// Usado pelas abas Visibilidade, Liberação e Capa do modal de Segmentos.

import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Search, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { novaCondicao, novoGrupo, validarRegra, type RegraSegmento, type Segmento } from '@/lib/segmentos/tipos'
import { salvarSegmentoAction } from './visibilidade-actions'
import { listarGruposSelecaoAction, buscarAlunosSelecaoAction } from './segmento-regras-actions'

export type ItemGrupo = { id: string; nome: string }
export type ItemAluno = { id: string; nome: string; email: string }
export type ModoPublico = 'rapido' | 'avancado'

export interface PublicoApi {
  modo: ModoPublico
  setModo: (m: ModoPublico) => void
  grupos: ItemGrupo[]
  setGrupos: React.Dispatch<React.SetStateAction<ItemGrupo[]>>
  alunos: ItemAluno[]
  setAlunos: React.Dispatch<React.SetStateAction<ItemAluno[]>>
  vazio: boolean
  /** Segmento já existente equivalente à seleção rápida ('' se ainda não existe / modo avançado). */
  existenteId: string
  /** Modo rápido: acha ou CRIA o segmento da seleção. Avançado: devolve o escolhido. null = nada escolhido; false = falhou (já avisou). */
  resolver: (avancadoId: string) => Promise<{ id: string; nome: string } | null | false>
}

const tokensDaSelecao = (g: ItemGrupo[], a: ItemAluno[]) => [...g.map((x) => `g:${x.id}`), ...a.map((x) => `e:${x.email.trim().toLowerCase()}`)].sort().join('|')
/** Assinatura de um segmento gerado pelo seletor rápido (1 grupo "OU" só com grupo/e-mail); null se for outro tipo de segmento. */
function assinaturaDoSegmento(r: RegraSegmento): string | null {
  if (r.grupos.length !== 1) return null
  const t: string[] = []
  for (const c of r.grupos[0].condicoes) {
    if (c.campo === 'grupo' && c.operador === 'possui' && c.ref) t.push(`g:${c.ref}`)
    else if (c.campo === 'aluno_email' && c.operador === 'igual' && c.valor) t.push(`e:${String(c.valor).trim().toLowerCase()}`)
    else return null
  }
  return t.length ? t.sort().join('|') : null
}

export function usePublico(c: { segs: Segmento[]; onMudou: () => void | Promise<void>; nomeSeg: (id: string) => string }): PublicoApi {
  const [modo, setModo] = useState<ModoPublico>('rapido')
  const [grupos, setGrupos] = useState<ItemGrupo[]>([])
  const [alunos, setAlunos] = useState<ItemAluno[]>([])
  const vazio = grupos.length === 0 && alunos.length === 0
  const existenteId = useMemo(() => {
    if (modo !== 'rapido' || vazio) return ''
    const sig = tokensDaSelecao(grupos, alunos)
    return c.segs.find((s) => assinaturaDoSegmento(s.regra) === sig)?.id ?? ''
  }, [modo, vazio, grupos, alunos, c.segs])

  async function resolver(avancadoId: string) {
    if (modo === 'avancado') return avancadoId ? { id: avancadoId, nome: c.nomeSeg(avancadoId) } : null
    if (vazio) return null
    const nome = nomeDaSelecao(grupos, alunos)
    if (existenteId) return { id: existenteId, nome: c.nomeSeg(existenteId) }
    const cond = [
      ...grupos.map((g) => novaCondicao('grupo', g.id)),
      ...alunos.map((a) => ({ ...novaCondicao('aluno_email'), operador: 'igual' as const, valor: a.email })),
    ]
    const regra: RegraSegmento = { op: 'e', grupos: [{ ...novoGrupo(), op: 'ou', condicoes: cond }] }
    const erro = validarRegra(regra)
    if (erro) { toast.error(erro); return false }
    const r = await salvarSegmentoAction({ nome, descricao: 'Criado pela seleção rápida de grupos e alunos.', regra })
    if ('error' in r) { toast.error(r.error); return false }
    void c.onMudou()
    return { id: r.segmento.id, nome }
  }
  return { modo, setModo, grupos, setGrupos, alunos, setAlunos, vazio, existenteId, resolver }
}

export function nomeDaSelecao(g: ItemGrupo[], a: ItemAluno[]): string {
  const partes: string[] = []
  if (g.length) partes.push(`${g.slice(0, 2).map((x) => x.nome).join(', ')}${g.length > 2 ? ` +${g.length - 2}` : ''}`)
  if (a.length) partes.push(`${a.length} aluno${a.length === 1 ? '' : 's'}`)
  return `Seleção: ${partes.join(' + ')}`.slice(0, 250)
}

// ───────────────────────── UI ─────────────────────────
/** Resumo do público escolhido + botão que abre o POP-UP grande de seleção (grupos e alunos). */
export function PublicoRapido({ pub, produtoId, vazioSignifica }: { pub: PublicoApi; produtoId: string; vazioSignifica?: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-3">
        <button type="button" onClick={() => setAberto(true)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/5">
          <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" />{pub.vazio ? 'Escolher grupos e alunos' : 'Editar seleção'}</span>
          <span className="text-xs font-normal text-muted-foreground">{pub.grupos.length} grupo(s) · {pub.alunos.length} aluno(s)</span>
        </button>
        {!pub.vazio && (
          <div className="mt-2 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {pub.grupos.slice(0, 10).map((g) => <span key={g.id} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"><span className="truncate">{g.nome}</span></span>)}
            {pub.grupos.length > 10 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">+{pub.grupos.length - 10} grupos</span>}
            {pub.alunos.slice(0, 6).map((a) => <span key={a.id} title={a.email} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium"><span className="truncate">{a.nome}</span></span>)}
            {pub.alunos.length > 6 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">+{pub.alunos.length - 6} alunos</span>}
          </div>
        )}
      </div>
      <p className="flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span>{pub.vazio ? (vazioSignifica ?? 'Escolha ao menos um grupo ou aluno.') : <>Vale para quem estiver em <b>qualquer</b> dos {pub.grupos.length} grupo(s){pub.alunos.length ? ` ou for um dos ${pub.alunos.length} aluno(s)` : ''}.{pub.existenteId ? ' Reaproveita um segmento igual que já existe.' : ' Cria um segmento com esta seleção.'}</>}</span></p>
      {aberto && <SeletorPublicoDialog produtoId={produtoId} grupos={pub.grupos} alunos={pub.alunos} onClose={() => setAberto(false)} onConfirmar={(g, a) => { pub.setGrupos(g); pub.setAlunos(a); setAberto(false) }} />}
    </div>
  )
}

/** POP-UP de seleção: grupos (lista grande, paginada, com busca) à esquerda; alunos específicos à direita. */
function SeletorPublicoDialog({ produtoId, grupos, alunos, onClose, onConfirmar }: {
  produtoId: string; grupos: ItemGrupo[]; alunos: ItemAluno[]; onClose: () => void; onConfirmar: (g: ItemGrupo[], a: ItemAluno[]) => void
}) {
  const [selG, setSelG] = useState<ItemGrupo[]>(grupos)
  const [selA, setSelA] = useState<ItemAluno[]>(alunos)
  const [qG, setQG] = useState('')
  const [page, setPage] = useState(1)
  const [lista, setLista] = useState<null | { rows: { id: string; nome: string; noProduto: boolean }[]; total: number }>(null)
  const [qA, setQA] = useState('')
  const [achados, setAchados] = useState<ItemAluno[]>([])
  const [buscandoA, setBuscandoA] = useState(false)
  const marcado = useMemo(() => new Set(selG.map((g) => g.id)), [selG])
  const alunoMarcado = useMemo(() => new Set(selA.map((a) => a.id)), [selA])

  useEffect(() => { setPage(1) }, [qG])
  useEffect(() => {
    let vivo = true
    const t = setTimeout(() => {
      setLista((l) => l && { ...l })
      listarGruposSelecaoAction(produtoId, qG, page).then((r) => { if (vivo) setLista('ok' in r ? { rows: r.rows, total: r.total } : { rows: [], total: 0 }) }).catch(() => { if (vivo) setLista({ rows: [], total: 0 }) })
    }, qG ? 250 : 0)
    return () => { vivo = false; clearTimeout(t) }
  }, [produtoId, qG, page])
  useEffect(() => {
    if (qA.trim().length < 2) { setAchados([]); return }
    let vivo = true; setBuscandoA(true)
    const t = setTimeout(() => { buscarAlunosSelecaoAction(qA).then((r) => { if (vivo) setAchados('ok' in r ? r.rows : []) }).catch(() => { if (vivo) setAchados([]) }).finally(() => { if (vivo) setBuscandoA(false) }) }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [qA])

  const alternar = (g: ItemGrupo) => setSelG((p) => (p.some((x) => x.id === g.id) ? p.filter((x) => x.id !== g.id) : [...p, g]))
  const pagina = lista?.rows ?? []
  const paginaToda = pagina.length > 0 && pagina.every((g) => marcado.has(g.id))
  const marcarPagina = () => setSelG((p) => { const ids = new Set(p.map((x) => x.id)); return paginaToda ? p.filter((x) => !pagina.some((l) => l.id === x.id)) : [...p, ...pagina.filter((l) => !ids.has(l.id)).map((l) => ({ id: l.id, nome: l.nome }))] })
  const total = lista?.total ?? 0, pp = 100, ultima = Math.max(1, Math.ceil(total / pp))

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="flex h-[min(88vh,820px)] w-[min(1100px,calc(100vw-2rem))] max-w-[min(1100px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,calc(100vw-2rem))]">
        <div className="shrink-0 border-b px-6 py-4"><DialogTitle className="text-lg">Escolher grupos e alunos</DialogTitle><p className="text-sm text-muted-foreground">Quem estiver em qualquer grupo marcado, ou for um dos alunos escolhidos, entra no público.</p></div>
        <div className="grid min-h-0 flex-1 md:grid-cols-2">
          {/* Grupos */}
          <section className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
            <div className="shrink-0 space-y-2 p-4">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Grupos de acesso <span className="font-normal text-muted-foreground">({total})</span></h3>
                <span className="flex items-center gap-3 text-xs">
                  {pagina.length > 0 && <button type="button" onClick={marcarPagina} className="font-medium text-primary hover:underline">{paginaToda ? 'Desmarcar esta página' : `Marcar esta página (${pagina.length})`}</button>}
                  {selG.length > 0 && <button type="button" onClick={() => setSelG([])} className="text-muted-foreground hover:text-foreground">Limpar ({selG.length})</button>}
                </span></div>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={qG} onChange={(e) => setQG(e.target.value)} placeholder="Buscar grupo…" className="h-10 pl-9" /></div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto border-y">
              {lista === null ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando grupos…</div>
                : pagina.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Nenhum grupo encontrado.</p>
                : <div>{pagina.map((g) => (
                  <button key={g.id} type="button" onClick={() => alternar({ id: g.id, nome: g.nome })} className={cn('flex w-full items-center gap-3 border-b px-4 py-2.5 text-left text-sm last:border-0 hover:bg-muted', marcado.has(g.id) && 'bg-primary/5')}>
                    <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded border', marcado.has(g.id) ? 'border-primary bg-primary text-primary-foreground' : 'bg-background')}>{marcado.has(g.id) && <Check className="h-3.5 w-3.5" />}</span>
                    <span className="min-w-0 flex-1 truncate" title={g.nome}>{g.nome}</span>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', g.noProduto ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{g.noProduto ? 'No produto' : 'Fora do produto'}</span>
                  </button>))}</div>}
            </div>
            <div className="flex shrink-0 items-center justify-between px-4 py-2 text-xs text-muted-foreground">
              <span>Página {page} de {ultima}</span>
              <span className="flex gap-1">
                <button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="rounded-lg border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-40">Anterior</button>
                <button type="button" disabled={page >= ultima} onClick={() => setPage((n) => n + 1)} className="rounded-lg border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-40">Próxima</button>
              </span>
            </div>
          </section>

          {/* Alunos */}
          <section className="flex min-h-0 flex-col bg-muted/20">
            <div className="shrink-0 space-y-2 p-4">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Alunos específicos <span className="font-normal text-muted-foreground">({selA.length})</span></h3>
                {selA.length > 0 && <button type="button" onClick={() => setSelA([])} className="text-xs text-muted-foreground hover:text-foreground">Limpar</button>}</div>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={qA} onChange={(e) => setQA(e.target.value)} placeholder="Buscar por nome ou e-mail (mín. 2 letras)…" className="h-10 pl-9" /></div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto border-t">
              {qA.trim().length >= 2 && (
                <div className="border-b bg-card">
                  <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Resultados {buscandoA && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}</div>
                  {achados.length === 0 && !buscandoA ? <p className="px-4 pb-3 text-sm text-muted-foreground">Ninguém encontrado.</p> : achados.map((a) => (
                    <button key={a.id} type="button" onClick={() => setSelA((p) => (p.some((x) => x.id === a.id) ? p : [...p, a]))} disabled={alunoMarcado.has(a.id)} className="flex w-full items-center gap-3 border-t px-4 py-2 text-left hover:bg-muted disabled:opacity-50">
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.nome}</span><span className="block truncate text-xs text-muted-foreground">{a.email}</span></span>
                      {alunoMarcado.has(a.id) ? <Check className="h-4 w-4 shrink-0 text-primary" /> : <span className="shrink-0 rounded-lg border px-2 py-0.5 text-xs font-medium text-primary">Adicionar</span>}
                    </button>))}
                </div>
              )}
              <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Selecionados</div>
              {selA.length === 0 ? <p className="px-4 pb-4 text-sm text-muted-foreground">Nenhum aluno específico. Busque acima e clique em Adicionar.</p> : selA.map((a) => (
                <div key={a.id} className="flex items-center gap-3 border-t bg-card px-4 py-2">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.nome}</span><span className="block truncate text-xs text-muted-foreground">{a.email}</span></span>
                  <button type="button" onClick={() => setSelA((p) => p.filter((x) => x.id !== a.id))} aria-label={`Remover ${a.nome}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"><X className="h-4 w-4" /></button>
                </div>))}
            </div>
          </section>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-card px-6 py-3">
          <span className="text-sm text-muted-foreground"><b className="text-foreground">{selG.length}</b> grupo(s) · <b className="text-foreground">{selA.length}</b> aluno(s)</span>
          <span className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={() => onConfirmar(selG, selA)}><Check className="h-4 w-4" />Confirmar seleção</Button></span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
