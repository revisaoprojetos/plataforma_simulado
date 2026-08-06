'use client'

import { useState, useTransition, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Check, Trash2, Loader2, GripVertical, ChevronUp, ChevronDown, ChevronRight, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { removerQuestoes, reordenarQuestoesBanco, carregarDetalheQuestao, type DetalheQuestao } from '@/app/admin/banco-questoes/actions'
import { CopiarCodigo } from '@/components/admin/copiar-codigo'
import { MarkdownContent } from '@/components/markdown-content'
import { codigoQuestao } from '@/lib/codigo-questao'
import { useOrdenacao, SortButton } from '@/components/admin/th-ordenavel'

const difRank: Record<string, number> = { facil: 0, medio: 1, dificil: 2 }
const stRank: Record<string, number> = { publicada: 0, rascunho: 1, arquivada: 2 }
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']

interface Q { id: string; enunciado: string; tipo?: string | null; nivel_dificuldade?: string | null; status?: string | null; disciplina?: string | null; assunto?: string | null }

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

export function BancoQuestoesTable({ bancoId, questoes, acao, cor = '#6d28d9' }: { bancoId: string; questoes: Q[]; acao?: React.ReactNode; cor?: string }) {
  const [busca, setBusca] = useState('')
  const [disc, setDisc] = useState('all')
  const [status, setStatus] = useState('all')
  const [dif, setDif] = useState('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const router = useRouter()

  // Ordem local (permite reordenar com setas/arrastar sem recarregar).
  const [ordered, setOrdered] = useState<Q[]>(questoes)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [savingOrder, startOrder] = useTransition()

  // Expandir/recolher a linha (mostra enunciado completo + alternativas + comentários, formatados).
  // Carrega o detalhe SOB DEMANDA ao abrir (bancos grandes não trazem tudo no load) e memoiza.
  const [aberto, setAberto] = useState<Set<string>>(new Set())
  const [detalhes, setDetalhes] = useState<Map<string, 'loading' | 'erro' | DetalheQuestao>>(new Map())
  async function toggleExpand(id: string) {
    const estaAberta = aberto.has(id)
    setAberto((p) => { const n = new Set(p); estaAberta ? n.delete(id) : n.add(id); return n })
    if (!estaAberta && !detalhes.has(id)) {
      setDetalhes((p) => new Map(p).set(id, 'loading'))
      const r = await carregarDetalheQuestao(id)
      setDetalhes((p) => new Map(p).set(id, r.ok && r.detalhe ? r.detalhe : 'erro'))
    }
  }

  const disciplinas = useMemo(() => [...new Set(ordered.map((q) => q.disciplina).filter(Boolean))].sort() as string[], [ordered])
  const discItems = useMemo(() => ({ all: 'Todas matérias', ...Object.fromEntries(disciplinas.map((d) => [d, d])) }), [disciplinas])
  const statusItems = { all: 'Status', publicada: 'Ativa', rascunho: 'Rascunho', arquivada: 'Arquivada' }
  const difItems = { all: 'Dific.', facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }

  const { sort, ordenarPor } = useOrdenacao<'enunciado' | 'disciplina' | 'assunto' | 'dif' | 'status'>()
  // Reordenar (arrastar/setas) só quando NÃO há filtro NEM ordenação por coluna.
  const travado = busca.trim() !== '' || disc !== 'all' || status !== 'all' || dif !== 'all' || sort !== null
  const filtroAtivo = travado

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

  function toggle(id: string) {
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSel((p) => p.size === visiveis.length ? new Set() : new Set(visiveis.map((q) => q.id)))
  }
  function remover() {
    if (sel.size === 0) return
    start(async () => {
      const r = await removerQuestoes(bancoId, [...sel])
      if (r.ok) { toast.success(`${sel.size} questão(ões) removida(s)`); setSel(new Set()); router.refresh() }
      else toast.error(r.error ?? 'Erro')
    })
  }

  // ── Reordenação ──
  function persistir(lista: Q[]) {
    startOrder(async () => {
      const r = await reordenarQuestoesBanco(bancoId, lista.map((q) => q.id))
      if (!r.ok) toast.error(r.error ?? 'Erro ao salvar a ordem')
    })
  }
  function mover(from: number, to: number) {
    if (filtroAtivo || from === to || to < 0 || to >= ordered.length) return
    const arr = [...ordered]
    const [it] = arr.splice(from, 1)
    arr.splice(to, 0, it)
    setOrdered(arr)
    persistir(arr)
  }

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      {/* Cabeçalho da seção */}
      <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><ListChecks className="h-5 w-5" /></span>
        <div>
          <h3 className="text-sm font-semibold leading-tight">Questões do banco</h3>
          <p className="text-xs text-muted-foreground">{ordered.length} {ordered.length === 1 ? 'questão' : 'questões'} · filtre, reordene e importe</p>
        </div>
      </div>

      {/* Linha 1: busca + remover + adicionar (sem borda: agrupa com os filtros abaixo) */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar enunciado, assunto…" className="pl-8" />
        </div>
        {savingOrder && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> salvando ordem</span>}
        {sel.size > 0 && (
          <Button variant="destructive" size="sm" onClick={remover} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Remover {sel.size}
          </Button>
        )}
        {acao}
      </div>

      {/* Linha 2: filtros */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 pt-0 pb-3">
        <Select value={disc} onValueChange={(v) => setDisc(v ?? '')} items={discItems}>
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
        {travado && <span className="text-xs text-muted-foreground">Limpe filtros e ordenação para reordenar as questões.</span>}
      </div>

      <CardContent className="p-0">
        <div className="max-h-[60vh] overflow-auto">
          {/* table-fixed: a tabela nunca excede o container (as colunas seguem as larguras do
              cabeçalho; a de Enunciado pega o resto). Sem isto, o conteúdo longo (ex.: detalhe
              expandido) fazia a tabela crescer e gerava scroll horizontal. */}
          <table className="w-full table-fixed caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-10">
                  <button type="button" onClick={toggleAll} className={cn('flex h-4 w-4 items-center justify-center rounded border',
                    visiveis.length > 0 && sel.size === visiveis.length ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                    {visiveis.length > 0 && sel.size === visiveis.length && <Check className="h-3 w-3" />}
                  </button>
                </TableHead>
                <TableHead className="w-14 text-center">Ordem</TableHead>
                <TableHead className="w-10">#</TableHead>
                <TableHead><SortButton label="Enunciado" k="enunciado" sort={sort} onSort={ordenarPor} /></TableHead>
                <TableHead className="w-44"><SortButton label="Disciplina" k="disciplina" sort={sort} onSort={ordenarPor} /></TableHead>
                <TableHead className="w-48"><SortButton label="Assunto" k="assunto" sort={sort} onSort={ordenarPor} /></TableHead>
                <TableHead className="w-12 text-center"><SortButton label="Dif." k="dif" sort={sort} onSort={ordenarPor} className="mx-auto" /></TableHead>
                <TableHead className="w-20"><SortButton label="Status" k="status" sort={sort} onSort={ordenarPor} /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Nenhuma questão.</TableCell></TableRow>
              ) : (
                visiveis.map((q, i) => {
                  const on = sel.has(q.id)
                  const d = difCfg[q.nivel_dificuldade ?? '']
                  const st = statusCfg[q.status ?? ''] ?? { label: q.status ?? '—', cls: 'bg-muted text-muted-foreground' }
                  const enun = q.enunciado.length > 70 ? q.enunciado.slice(0, 70) + '…' : q.enunciado
                  const open = aberto.has(q.id)
                  const det = detalhes.get(q.id)
                  return (
                    <Fragment key={q.id}>
                    <TableRow
                      draggable={!filtroAtivo}
                      onDragStart={() => !filtroAtivo && setDragIdx(i)}
                      onDragOver={(e) => { if (!filtroAtivo && dragIdx !== null) { e.preventDefault(); setOverIdx(i) } }}
                      onDrop={(e) => { if (!filtroAtivo && dragIdx !== null) { e.preventDefault(); mover(dragIdx, i); setDragIdx(null); setOverIdx(null) } }}
                      onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                      onClick={() => toggle(q.id)}
                      className={cn('cursor-pointer', on && 'bg-primary/5', overIdx === i && dragIdx !== null && 'border-t-2 border-primary', dragIdx === i && 'opacity-50')}
                    >
                      <TableCell>
                        <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {filtroAtivo ? (
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
                      <TableCell className="text-sm text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-start gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleExpand(q.id) }}
                            className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                            title={open ? 'Recolher' : 'Expandir'} aria-label={open ? 'Recolher' : 'Expandir'}
                          >
                            <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
                          </button>
                          <div className="min-w-0">
                            <div className="mb-1"><CopiarCodigo codigo={codigoQuestao(q.id)} /></div>
                            {enun}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal break-words text-xs font-medium uppercase text-muted-foreground">{q.disciplina ?? '—'}</TableCell>
                      <TableCell className="whitespace-normal break-words text-xs text-muted-foreground">{q.assunto ?? '—'}</TableCell>
                      <TableCell className="text-center font-bold">{d ? <span className={d.cls}>{d.letra}</span> : '—'}</TableCell>
                      <TableCell><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', st.cls)}>{st.label}</span></TableCell>
                    </TableRow>
                    {open && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={8} className="whitespace-normal p-0">
                          {/* A célula herda `whitespace-nowrap` (base do TableCell) → o comentário virava
                              UMA linha gigante e esticava a tabela (overflow horizontal). `whitespace-normal`
                              volta a quebrar; `max-w` limita a largura de leitura sem esticar a tabela. */}
                          <div className="max-w-[900px] space-y-2 break-words px-6 py-3">
                            {det === 'loading' && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
                            {det === 'erro' && <p className="text-sm text-rose-600 dark:text-rose-400">Não foi possível carregar os detalhes.</p>}
                            {det && det !== 'loading' && det !== 'erro' && (
                              <>
                                {det.enunciado && (
                                  <div className="rounded-md border bg-background p-2.5 text-sm leading-relaxed">
                                    <MarkdownContent>{det.enunciado}</MarkdownContent>
                                  </div>
                                )}
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
                                {det.comentario_professor && (
                                  <div className="rounded-md border bg-background p-2 text-sm">
                                    <span className="font-semibold">Comentário do professor:</span>{' '}
                                    <MarkdownContent inline className="text-muted-foreground">{det.comentario_professor}</MarkdownContent>
                                  </div>
                                )}
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
            </TableBody>
          </table>
        </div>
        <div className="border-t px-4 py-2 text-right text-xs text-muted-foreground">{ordered.length} {ordered.length === 1 ? 'questão' : 'questões'}</div>
      </CardContent>
    </Card>
  )
}
