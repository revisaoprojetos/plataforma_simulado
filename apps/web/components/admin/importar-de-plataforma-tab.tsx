'use client'

// Aba "Plataformas" do "Nova Questão" (super-admin): escolhe uma plataforma de origem, busca/filtra
// as questões dela (server-side, paginado) e importa as selecionadas pro banco da plataforma atual.
// Tabela selecionável própria (a canônica é client-side e não serve p/ paginação server): scroll
// horizontal com ARRASTAR + linhas EXPANSÍVEIS (ver enunciado completo + todos os campos).

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Search, Loader2, ArrowLeftRight, ChevronLeft, ChevronRight, Check, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { codigoQuestao } from '@/lib/codigo-questao'
import {
  listarPlataformasOrigem,
  buscarQuestoesDePlataforma,
  importarQuestoesDePlataforma,
  detalheQuestaoOrigem,
  type QuestaoOrigem,
} from '@/app/admin/questoes/importar-plataforma-actions'

type Alt = { texto: string; correta: boolean; ordem: number }
type Detalhe = { loading: boolean; alternativas?: Alt[] }

const STATUS_LABEL: Record<string, string> = { publicada: 'Ativa', rascunho: 'Rascunho', arquivada: 'Arquivada' }
const DIF_LABEL: Record<string, string> = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }
const textoLimpo = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const selCls = 'h-9 rounded-lg border bg-background px-2 text-sm'
const DASH = '—'

export function ImportarDePlataformaTab({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const [plataformas, setPlataformas] = useState<{ id: string; nome: string; slug: string }[] | null>(null)
  const [origem, setOrigem] = useState('')
  const [disciplinas, setDisciplinas] = useState<{ id: string; nome: string }[]>([])

  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [disciplinaId, setDisciplinaId] = useState('')
  const [dificuldade, setDificuldade] = useState('')
  const [page, setPage] = useState(1)

  const [questoes, setQuestoes] = useState<QuestaoOrigem[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())
  const [detalhes, setDetalhes] = useState<Record<string, Detalhe>>({})

  const [buscando, startBuscar] = useTransition()
  const [importando, startImportar] = useTransition()

  useEffect(() => { listarPlataformasOrigem().then((r) => setPlataformas(r.plataformas ?? [])) }, [])

  const buscar = useCallback((origemId: string, p: number, resetDisc: boolean) => {
    if (!origemId) return
    startBuscar(async () => {
      const r = await buscarQuestoesDePlataforma(origemId, { busca, status, disciplinaId, dificuldade, page: p })
      if (r.error) { toast.error(r.error); return }
      setQuestoes(r.questoes ?? [])
      setTotal(r.total ?? 0)
      setTotalPages(r.totalPages ?? 1)
      setExpandidas(new Set()); setDetalhes({})
      if (resetDisc && r.disciplinas) setDisciplinas(r.disciplinas)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, status, disciplinaId, dificuldade])

  // Debounce de busca/filtros → volta p/ pág. 1 (só com origem selecionada).
  useEffect(() => {
    if (!origem) return
    const t = setTimeout(() => { setPage(1); buscar(origem, 1, false) }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, status, disciplinaId, dificuldade])

  function trocarOrigem(id: string) {
    setOrigem(id)
    setSel(new Set()); setExpandidas(new Set()); setDetalhes({})
    setBusca(''); setStatus(''); setDisciplinaId(''); setDificuldade('')
    setPage(1); setDisciplinas([])
    if (id) buscar(id, 1, true)
    else { setQuestoes([]); setTotal(0); setTotalPages(1) }
  }

  function irPara(p: number) { const np = Math.min(Math.max(1, p), totalPages); setPage(np); buscar(origem, np, false) }
  function toggle(id: string) { setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleExpand(id: string) {
    setExpandidas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    if (!detalhes[id]) {
      setDetalhes((d) => ({ ...d, [id]: { loading: true } }))
      detalheQuestaoOrigem(origem, id)
        .then((r) => setDetalhes((d) => ({ ...d, [id]: { loading: false, alternativas: r.alternativas ?? [] } })))
        .catch(() => setDetalhes((d) => ({ ...d, [id]: { loading: false, alternativas: [] } })))
    }
  }
  const todasVisiveisSel = questoes.length > 0 && questoes.every((q) => sel.has(q.id))
  function toggleTodasVisiveis() {
    setSel((s) => { const n = new Set(s); if (todasVisiveisSel) questoes.forEach((q) => n.delete(q.id)); else questoes.forEach((q) => n.add(q.id)); return n })
  }

  function importar() {
    if (!origem || sel.size === 0) return
    const ids = [...sel]
    startImportar(async () => {
      const r = await importarQuestoesDePlataforma(origem, ids)
      if (r.error) { toast.error(r.error); return }
      const partes = [`${r.copiadas ?? 0} importada(s)`]
      if (r.jaExistiam) partes.push(`${r.jaExistiam} já existia(m)`)
      if (r.falhas) partes.push(`${r.falhas} falhou(aram)`)
      toast.success(partes.join(' · '))
      onDone(); router.refresh()
    })
  }

  // Arrastar-para-o-lado (drag-scroll) na tabela, distinguindo de clique (seleção).
  const scRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ down: false, moved: false, x: 0, left: 0 })
  const onDown = (e: React.MouseEvent) => { const el = scRef.current; if (!el) return; drag.current = { down: true, moved: false, x: e.pageX, left: el.scrollLeft } }
  const onMove = (e: React.MouseEvent) => { const el = scRef.current; if (!el || !drag.current.down) return; const dx = e.pageX - drag.current.x; if (Math.abs(dx) > 4) drag.current.moved = true; el.scrollLeft = drag.current.left - dx }
  const endDrag = () => { drag.current.down = false }
  const cliqueLinha = (id: string) => { if (drag.current.moved) { drag.current.moved = false; return } toggle(id) }

  const nomePlataforma = useMemo(() => plataformas?.find((p) => p.id === origem)?.nome ?? '', [plataformas, origem])
  const cel = 'whitespace-nowrap px-2 py-2 text-left align-top'
  const th = 'whitespace-nowrap px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'
  const chip = 'rounded-full bg-muted px-2 py-0.5 text-[11px]'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-6 pt-4">
        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" /> Plataforma de origem
        </label>
        <Select value={origem || undefined} onValueChange={(v) => trocarOrigem(v ?? '')} disabled={plataformas === null}>
          <SelectTrigger className="h-11 w-full rounded-xl border-primary/20 bg-primary/5 px-3 text-sm font-medium shadow-sm transition-colors hover:bg-primary/10 focus:ring-2 focus:ring-primary/30">
            <span className="flex items-center gap-2.5 truncate">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><Building2 className="h-3.5 w-3.5" /></span>
              <span className={cn('truncate', !origem && 'font-normal text-muted-foreground')}>
                {origem ? nomePlataforma : (plataformas === null ? 'Carregando plataformas…' : 'Selecione uma plataforma…')}
              </span>
            </span>
          </SelectTrigger>
          <SelectContent>
            {(plataformas ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex flex-col">
                  <span className="font-medium">{p.nome}</span>
                  {p.slug ? <span className="text-[11px] text-muted-foreground">{p.slug}</span> : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!origem ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-14 text-center text-muted-foreground">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ArrowLeftRight className="h-7 w-7" /></span>
          <p className="max-w-sm text-sm">Escolha uma plataforma acima para buscar e selecionar questões a importar para a plataforma atual.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-6 pt-3">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar enunciado ou código…" className="pl-8" />
            </div>
            <select value={disciplinaId} onChange={(e) => setDisciplinaId(e.target.value)} className={selCls}>
              <option value="">Todas as disciplinas</option>
              {disciplinas.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={selCls}>
              <option value="">Status</option><option value="publicada">Ativa</option><option value="rascunho">Rascunho</option><option value="arquivada">Arquivada</option>
            </select>
            <select value={dificuldade} onChange={(e) => setDificuldade(e.target.value)} className={selCls}>
              <option value="">Dificuldade</option><option value="facil">Fácil</option><option value="medio">Médio</option><option value="dificil">Difícil</option>
            </select>
          </div>

          <div className="flex items-center gap-2 px-6 pb-1 pt-2 text-xs text-muted-foreground">
            {buscando ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> buscando…</span> : <span>{total} questã{total === 1 ? 'o' : 'ões'} em {nomePlataforma}</span>}
            {sel.size > 0 ? <span className="font-medium text-foreground">· {sel.size} selecionada(s)</span> : null}
            <span className="ml-auto hidden items-center gap-1 sm:inline-flex"><ArrowLeftRight className="h-3 w-3" /> arraste para ver mais colunas</span>
          </div>

          {/* Tabela com scroll horizontal (arrastar) */}
          <div
            ref={scRef}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}
            className="min-h-0 flex-1 cursor-grab select-none overflow-auto border-y active:cursor-grabbing"
          >
            {buscando && questoes.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
            ) : questoes.length === 0 ? (
              <div className="m-6 rounded-lg border border-dashed bg-muted/30 py-12 text-center text-sm text-muted-foreground">Nenhuma questão encontrada.</div>
            ) : (
              <table className="w-full min-w-[1000px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_var(--border)]">
                  <tr>
                    <th className={cn(th, 'w-10 pl-6')}>
                      <button type="button" onClick={toggleTodasVisiveis}
                        className={cn('flex h-4 w-4 items-center justify-center rounded border', todasVisiveisSel ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                        {todasVisiveisSel && <Check className="h-3 w-3" />}
                      </button>
                    </th>
                    <th className={cn(th, 'w-8')}></th>
                    <th className={cn(th, 'w-20')}>Código</th>
                    <th className={th}>Enunciado</th>
                    <th className={th}>Disciplina</th>
                    <th className={th}>Assunto</th>
                    <th className={th}>Banca</th>
                    <th className={th}>Órgão</th>
                    <th className={th}>Cargo</th>
                    <th className={th}>Ano</th>
                    <th className={th}>Dif.</th>
                    <th className={cn(th, 'pr-6')}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {questoes.map((q) => {
                    const on = sel.has(q.id)
                    const aberta = expandidas.has(q.id)
                    const cod = codigoQuestao(q.id, q.codigo)
                    const det = detalhes[q.id]
                    return (
                      <Fragment key={q.id}>
                        <tr onClick={() => cliqueLinha(q.id)}
                          className={cn('cursor-pointer border-t transition-colors hover:bg-muted/40', on && 'bg-primary/5')}>
                          <td className={cn(cel, 'pl-6')}>
                            <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                              {on && <Check className="h-3 w-3" />}
                            </span>
                          </td>
                          <td className={cel}>
                            <button type="button" aria-label={aberta ? 'Recolher' : 'Expandir'} title={aberta ? 'Recolher' : 'Expandir informações'}
                              onClick={(e) => { e.stopPropagation(); toggleExpand(q.id) }}
                              className={cn('flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-muted', aberta ? 'text-primary' : 'text-muted-foreground')}>
                              <ChevronRight className={cn('h-4 w-4 transition-transform duration-200', aberta && 'rotate-90')} />
                            </button>
                          </td>
                          <td className={cn(cel, 'font-mono text-xs text-muted-foreground')}>{cod}</td>
                          <td className="px-2 py-2 align-top">
                            <div className="max-w-[380px] truncate text-sm text-foreground">{textoLimpo(q.enunciado) || '(sem enunciado)'}</div>
                          </td>
                          <td className={cel}>{q.disciplina ? <span className={chip}>{q.disciplina}</span> : DASH}</td>
                          <td className={cel}>{q.assunto ?? DASH}</td>
                          <td className={cel}>{q.banca ?? DASH}</td>
                          <td className={cel}>{q.orgao ?? DASH}</td>
                          <td className={cel}>{q.cargo ?? DASH}</td>
                          <td className={cel}>{q.ano ?? DASH}</td>
                          <td className={cel}>{q.nivel_dificuldade ? (DIF_LABEL[q.nivel_dificuldade] ?? q.nivel_dificuldade) : DASH}</td>
                          <td className={cn(cel, 'pr-6')}>
                            {q.status ? <span className={cn('rounded-full px-2 py-0.5 text-[11px]', q.status === 'publicada' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400')}>{STATUS_LABEL[q.status] ?? q.status}</span> : DASH}
                          </td>
                        </tr>
                        {/* Linha expandida (animada via grid-rows 0fr↔1fr). */}
                        <tr>
                          <td colSpan={12} className="p-0">
                            <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: aberta ? '1fr' : '0fr' }}>
                              <div className="overflow-hidden">
                                <div className="bg-muted/30 px-6 py-3.5">
                                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{textoLimpo(q.enunciado) || '(sem enunciado)'}</p>
                                  <div className="mt-3">
                                    {det?.loading ? (
                                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando alternativas…</span>
                                    ) : det?.alternativas && det.alternativas.length > 0 ? (
                                      <ul className="space-y-1.5">
                                        {det.alternativas.map((a, i) => (
                                          <li key={i} className={cn('flex items-start gap-2.5 rounded-lg border px-2.5 py-1.5 text-sm', a.correta ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20' : 'border-border/60 bg-background')}>
                                            <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold', a.correta ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground')}>{String.fromCharCode(65 + i)}</span>
                                            <span className="min-w-0 flex-1 whitespace-pre-wrap">{textoLimpo(a.texto) || DASH}</span>
                                            {a.correta ? <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Gabarito</span> : null}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">Sem alternativas cadastradas (questão discursiva ou sem gabarito).</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-6 py-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => irPara(page - 1)} disabled={page <= 1 || buscando}><ChevronLeft className="h-4 w-4" /></Button>
              <span>Pág. {page} / {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => irPara(page + 1)} disabled={page >= totalPages || buscando}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Button onClick={importar} disabled={sel.size === 0 || importando} className="gap-1.5">
              {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
              Importar {sel.size > 0 ? sel.size : ''} questã{sel.size === 1 ? 'o' : 'ões'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
