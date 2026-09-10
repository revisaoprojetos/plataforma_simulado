'use client'

import { useState, useTransition, useMemo, useEffect, Fragment } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Check, Trash2, Loader2, GripVertical, ChevronUp, ChevronDown, ChevronRight, ListChecks, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { carregarDetalheQuestao as carregarDetalhePadrao, type DetalheQuestao } from '@/app/admin/banco-questoes/actions'
import { CopiarCodigo } from '@/components/admin/copiar-codigo'
import { MarkdownContent } from '@/components/markdown-content'
import { codigoQuestao } from '@/lib/codigo-questao'
import { useOrdenacao, SortButton } from '@/components/admin/th-ordenavel'

const difRank: Record<string, number> = { facil: 0, medio: 1, dificil: 2 }
const stRank: Record<string, number> = { publicada: 0, rascunho: 1, arquivada: 2 }
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']
const POR_PAGINA = 10

// Linha base de questão (mesma da aba Questões do banco) — REUTILIZÁVEL por qualquer tabela de questões.
export interface QuestaoLinha {
  id: string; enunciado: string; tipo?: string | null; nivel_dificuldade?: string | null; status?: string | null
  disciplina?: string | null; assunto?: string | null; assuntoDetalhe?: string | null
  banca?: string | null; orgao?: string | null; ano?: number | null
}

const difCfg: Record<string, { letra: string; cls: string }> = {
  facil: { letra: 'F', cls: 'text-green-600' },
  medio: { letra: 'M', cls: 'text-amber-600' },
  dificil: { letra: 'D', cls: 'text-red-600' },
}
const statusCfg: Record<string, { label: string; cls: string }> = {
  publicada: { label: 'Ativa', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  rascunho: { label: 'Rascunho', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  arquivada: { label: 'Arquivada', cls: 'bg-muted text-muted-foreground' },
}

/**
 * TABELA BASE de questões (busca + filtros disciplina/status/dificuldade + expandir com detalhe sob
 * demanda + colunas #/Enunciado/Disciplina/Assunto/Dif./Status). É a MESMA da aba Questões do banco,
 * extraída para servir de base a qualquer área de questões (banco, quiz do conteúdo, futuras).
 * `onReordenar` habilita reordenar (setas/arrastar); `onRemover` habilita selecionar/remover.
 */
export function QuestoesTabelaBase({
  questoes, titulo, subtitulo, acao, cor = '#6d28d9', icone, editHrefBase = '/admin/questoes',
  carregarDetalhe = carregarDetalhePadrao, onRemover, onReordenar, semCabecalho = false,
}: {
  questoes: QuestaoLinha[]
  titulo: string
  subtitulo?: string
  acao?: React.ReactNode
  cor?: string
  icone?: React.ReactNode
  editHrefBase?: string
  carregarDetalhe?: (id: string) => Promise<{ ok: boolean; detalhe?: DetalheQuestao; error?: string }>
  onRemover?: (ids: string[]) => Promise<{ ok: boolean; error?: string }>
  onReordenar?: (ids: string[]) => Promise<{ ok: boolean; error?: string }>
  /** Oculta o cabeçalho da seção (título/contagem) — ex.: quando a página já tem o título. */
  semCabecalho?: boolean
}) {
  const [busca, setBusca] = useState('')
  const [disc, setDisc] = useState('all')
  const [status, setStatus] = useState('all')
  const [dif, setDif] = useState('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const [pagina, setPagina] = useState(0)

  const podeRemover = !!onRemover
  const podeReordenar = !!onReordenar

  // Ordem local (reordenar sem recarregar). Sincroniza quando a fonte muda (add/remover no pai / refresh).
  const [ordered, setOrdered] = useState<QuestaoLinha[]>(questoes)
  useEffect(() => { setOrdered(questoes) }, [questoes])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [savingOrder, startOrder] = useTransition()

  // Expandir/recolher (enunciado + alternativas + comentários), detalhe SOB DEMANDA e memoizado.
  const [aberto, setAberto] = useState<Set<string>>(new Set())
  const [detalhes, setDetalhes] = useState<Map<string, 'loading' | 'erro' | DetalheQuestao>>(new Map())
  async function toggleExpand(id: string) {
    const estaAberta = aberto.has(id)
    setAberto((p) => { const n = new Set(p); estaAberta ? n.delete(id) : n.add(id); return n })
    if (!estaAberta && !detalhes.has(id)) {
      setDetalhes((p) => new Map(p).set(id, 'loading'))
      const r = await carregarDetalhe(id)
      setDetalhes((p) => new Map(p).set(id, r.ok && r.detalhe ? r.detalhe : 'erro'))
    }
  }

  const disciplinas = useMemo(() => [...new Set(ordered.map((q) => q.disciplina).filter(Boolean))].sort() as string[], [ordered])
  const statusItems = { all: 'Status', publicada: 'Ativa', rascunho: 'Rascunho', arquivada: 'Arquivada' }
  const difItems = { all: 'Dific.', facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }

  const { sort, ordenarPor } = useOrdenacao<'enunciado' | 'disciplina' | 'assunto' | 'dif' | 'status'>()
  const travado = busca.trim() !== '' || disc !== 'all' || status !== 'all' || dif !== 'all' || sort !== null

  const filtradas = useMemo(() => {
    const q = busca.toLowerCase().trim()
    return ordered.filter((x) => {
      if (disc !== 'all' && x.disciplina !== disc) return false
      if (status !== 'all' && x.status !== status) return false
      if (dif !== 'all' && x.nivel_dificuldade !== dif) return false
      if (q && !(`${x.enunciado} ${x.disciplina ?? ''} ${x.assunto ?? ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [ordered, busca, disc, status, dif])

  const visiveis = useMemo(() => {
    if (!sort) return filtradas
    const dir = sort.dir === 'asc' ? 1 : -1
    const txt = (s?: string | null) => s || ''
    return [...filtradas].sort((a, b) => {
      switch (sort.key) {
        case 'enunciado': return txt(a.enunciado).localeCompare(txt(b.enunciado), 'pt-BR') * dir
        case 'disciplina': return txt(a.disciplina).localeCompare(txt(b.disciplina), 'pt-BR') * dir
        case 'assunto': return txt(a.assunto).localeCompare(txt(b.assunto), 'pt-BR') * dir
        case 'dif': return ((difRank[a.nivel_dificuldade ?? ''] ?? 99) - (difRank[b.nivel_dificuldade ?? ''] ?? 99)) * dir
        case 'status': return ((stRank[a.status ?? ''] ?? 99) - (stRank[b.status ?? ''] ?? 99)) * dir
        default: return 0
      }
    })
  }, [filtradas, sort])

  // Paginação (10/página) sobre a lista filtrada/ordenada.
  const totalPag = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA))
  const pageItens = useMemo(() => visiveis.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA), [visiveis, pagina])
  useEffect(() => { setPagina(0) }, [busca, disc, status, dif, sort])
  useEffect(() => { if (pagina > totalPag - 1) setPagina(0) }, [totalPag, pagina])

  const colSpan = 10 + (podeRemover ? 1 : 0) + (podeReordenar ? 1 : 0)

  function toggle(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleAll() { setSel((p) => (p.size === visiveis.length ? new Set() : new Set(visiveis.map((q) => q.id)))) }
  function remover() {
    if (!onRemover || sel.size === 0) return
    const ids = [...sel]
    start(async () => {
      const r = await onRemover(ids)
      if (r.ok) { setOrdered((o) => o.filter((q) => !sel.has(q.id))); setSel(new Set()); toast.success(`${ids.length} questão(ões) removida(s)`) }
      else toast.error(r.error ?? 'Erro ao remover')
    })
  }
  function persistirOrdem(lista: QuestaoLinha[]) {
    if (!onReordenar) return
    startOrder(async () => { const r = await onReordenar(lista.map((q) => q.id)); if (!r.ok) toast.error(r.error ?? 'Erro ao salvar a ordem') })
  }
  function mover(from: number, to: number) {
    if (travado || from === to || to < 0 || to >= ordered.length) return
    const arr = [...ordered]; const [it] = arr.splice(from, 1); arr.splice(to, 0, it)
    setOrdered(arr); persistirOrdem(arr)
  }

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      {!semCabecalho && (
        <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}>{icone ?? <ListChecks className="h-5 w-5" />}</span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">{titulo}</h3>
            <p className="text-xs text-muted-foreground">{ordered.length} {ordered.length === 1 ? 'questão' : 'questões'}{subtitulo ? ` · ${subtitulo}` : ''}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar enunciado, assunto…" className="pl-8" />
        </div>
        {savingOrder && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> salvando ordem</span>}
        {podeRemover && sel.size > 0 && (
          <Button variant="destructive" size="sm" onClick={remover} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Remover {sel.size}
          </Button>
        )}
        {acao}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b px-4 pb-3 pt-0">
        <Select value={disc} onValueChange={(v) => setDisc(v ?? '')} items={{ all: 'Todas matérias', ...Object.fromEntries(disciplinas.map((d) => [d, d])) }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas matérias</SelectItem>
            {disciplinas.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v ?? '')} items={statusItems}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="publicada">Ativa</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="arquivada">Arquivada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dif} onValueChange={(v) => setDif(v ?? '')} items={difItems}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas dific.</SelectItem>
            <SelectItem value="facil">Fácil</SelectItem>
            <SelectItem value="medio">Médio</SelectItem>
            <SelectItem value="dificil">Difícil</SelectItem>
          </SelectContent>
        </Select>
        {podeReordenar && travado && <span className="text-xs text-muted-foreground">Limpe filtros e ordenação para reordenar.</span>}
      </div>

      <CardContent className="p-0">
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full min-w-[1180px] caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                {podeRemover && (
                  <TableHead className="w-10">
                    <button type="button" onClick={toggleAll} className={cn('flex h-4 w-4 items-center justify-center rounded border', visiveis.length > 0 && sel.size === visiveis.length ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                      {visiveis.length > 0 && sel.size === visiveis.length && <Check className="h-3 w-3" />}
                    </button>
                  </TableHead>
                )}
                {podeReordenar && <TableHead className="w-14 text-center">Ordem</TableHead>}
                <TableHead className="w-10">#</TableHead>
                <TableHead className="min-w-[280px]"><SortButton label="Enunciado" k="enunciado" sort={sort} onSort={ordenarPor} /></TableHead>
                <TableHead className="w-40"><SortButton label="Disciplina" k="disciplina" sort={sort} onSort={ordenarPor} /></TableHead>
                <TableHead className="w-44"><SortButton label="Assunto" k="assunto" sort={sort} onSort={ordenarPor} /></TableHead>
                <TableHead className="w-44">Assunto específico</TableHead>
                <TableHead className="w-40">Banca</TableHead>
                <TableHead className="w-40">Órgão</TableHead>
                <TableHead className="w-16 text-center">Ano</TableHead>
                <TableHead className="w-12 text-center"><SortButton label="Dif." k="dif" sort={sort} onSort={ordenarPor} className="mx-auto" /></TableHead>
                <TableHead className="w-20"><SortButton label="Status" k="status" sort={sort} onSort={ordenarPor} /></TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              {visiveis.length === 0 ? (
                <TableRow><TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">Nenhuma questão.</TableCell></TableRow>
              ) : (
                pageItens.map((q, localIdx) => {
                  const i = pagina * POR_PAGINA + localIdx
                  const on = sel.has(q.id)
                  const d = difCfg[q.nivel_dificuldade ?? '']
                  const st = statusCfg[q.status ?? ''] ?? { label: q.status ?? '—', cls: 'bg-muted text-muted-foreground' }
                  const enun = q.enunciado.length > 70 ? q.enunciado.slice(0, 70) + '…' : q.enunciado
                  const open = aberto.has(q.id)
                  const det = detalhes.get(q.id)
                  return (
                    <Fragment key={q.id}>
                      <TableRow
                        draggable={podeReordenar && !travado}
                        onDragStart={() => podeReordenar && !travado && setDragIdx(i)}
                        onDragOver={(e) => { if (podeReordenar && !travado && dragIdx !== null) { e.preventDefault(); setOverIdx(i) } }}
                        onDrop={(e) => { if (podeReordenar && !travado && dragIdx !== null) { e.preventDefault(); mover(dragIdx, i); setDragIdx(null); setOverIdx(null) } }}
                        onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                        onClick={() => podeRemover && toggle(q.id)}
                        className={cn(podeRemover && 'cursor-pointer', on && 'bg-primary/5', overIdx === i && dragIdx !== null && 'border-t-2 border-primary', dragIdx === i && 'opacity-50')}
                      >
                        {podeRemover && (
                          <TableCell>
                            <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                          </TableCell>
                        )}
                        {podeReordenar && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {travado ? (
                              <span className="flex justify-center text-muted-foreground/40"><GripVertical className="h-4 w-4" /></span>
                            ) : (
                              <div className="flex items-center justify-center gap-0.5">
                                <span className="cursor-grab text-muted-foreground active:cursor-grabbing" title="Arraste para reordenar"><GripVertical className="h-4 w-4" /></span>
                                <div className="flex flex-col">
                                  <button type="button" onClick={() => mover(i, i - 1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Subir"><ChevronUp className="h-3.5 w-3.5" /></button>
                                  <button type="button" onClick={() => mover(i, i + 1)} disabled={i === visiveis.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Descer"><ChevronDown className="h-3.5 w-3.5" /></button>
                                </div>
                              </div>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-sm text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-start gap-1.5">
                            <button type="button" onClick={(e) => { e.stopPropagation(); toggleExpand(q.id) }} className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground" title={open ? 'Recolher' : 'Expandir'} aria-label={open ? 'Recolher' : 'Expandir'}>
                              <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
                            </button>
                            <div className="min-w-0">
                              <div className="mb-1 flex items-center gap-1.5">
                                <CopiarCodigo codigo={codigoQuestao(q.id)} />
                                <Link href={`${editHrefBase}/${q.id}/editar`} onClick={(e) => e.stopPropagation()} title="Abrir esta questão no editor" className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                                  <ExternalLink className="h-3 w-3" /> Abrir
                                </Link>
                              </div>
                              <Link href={`${editHrefBase}/${q.id}/editar`} onClick={(e) => e.stopPropagation()} className="block transition-colors hover:text-primary hover:underline">{enun}</Link>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-normal break-words text-xs font-medium uppercase text-muted-foreground">{q.disciplina ?? '—'}</TableCell>
                        <TableCell className="whitespace-normal break-words text-xs text-muted-foreground">{q.assunto ?? '—'}</TableCell>
                        <TableCell className="whitespace-normal break-words text-xs text-muted-foreground">{q.assuntoDetalhe ?? '—'}</TableCell>
                        <TableCell className="whitespace-normal break-words text-xs text-muted-foreground">{q.banca ?? '—'}</TableCell>
                        <TableCell className="whitespace-normal break-words text-xs text-muted-foreground">{q.orgao ?? '—'}</TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">{q.ano ?? '—'}</TableCell>
                        <TableCell className="text-center font-bold">{d ? <span className={d.cls}>{d.letra}</span> : '—'}</TableCell>
                        <TableCell><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', st.cls)}>{st.label}</span></TableCell>
                      </TableRow>
                      {open && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={colSpan} className="whitespace-normal p-0">
                            <div className="max-w-[900px] space-y-2 break-words px-6 py-3">
                              {det === 'loading' && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
                              {det === 'erro' && <p className="text-sm text-rose-600 dark:text-rose-400">Não foi possível carregar os detalhes.</p>}
                              {det && det !== 'loading' && det !== 'erro' && (
                                <>
                                  {det.enunciado && <div className="rounded-md border bg-background p-2.5 text-sm leading-relaxed"><MarkdownContent>{det.enunciado}</MarkdownContent></div>}
                                  <p className="text-xs font-medium text-muted-foreground">{det.alternativas.length} alternativa(s)</p>
                                  {det.alternativas.length === 0 && <p className="text-xs text-muted-foreground">Sem alternativas.</p>}
                                  {det.alternativas.map((a) => (
                                    <div key={a.ordem} className="rounded-md border bg-background p-2 text-sm">
                                      <p className={cn('font-semibold', a.correta && 'text-emerald-600 dark:text-emerald-400')}>
                                        {LETRAS[a.ordem] ?? '?'}){a.correta ? ' ✓ correta' : ''} <MarkdownContent inline className="font-normal text-foreground">{a.texto}</MarkdownContent>
                                      </p>
                                      {a.lei && <p className="mt-1 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Lei:</span> {a.lei}</p>}
                                      {a.comentario && <div className="mt-0.5 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Comentário:</span> <MarkdownContent inline>{a.comentario}</MarkdownContent></div>}
                                    </div>
                                  ))}
                                  {det.comentario_professor && <div className="rounded-md border bg-background p-2 text-sm"><span className="font-semibold">Comentário do professor:</span> <MarkdownContent inline className="text-muted-foreground">{det.comentario_professor}</MarkdownContent></div>}
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
          <span>{visiveis.length.toLocaleString('pt-BR')} de {ordered.length.toLocaleString('pt-BR')} {ordered.length === 1 ? 'questão' : 'questões'}</span>
          {totalPag > 1 && (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} className="rounded-md border px-2 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40">Anterior</button>
              <span className="px-1 tabular-nums">Pág. {pagina + 1}/{totalPag}</span>
              <button type="button" onClick={() => setPagina((p) => Math.min(totalPag - 1, p + 1))} disabled={pagina >= totalPag - 1} className="rounded-md border px-2 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40">Próxima</button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
