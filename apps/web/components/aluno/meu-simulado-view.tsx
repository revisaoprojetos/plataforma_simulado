'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { LayoutDashboard, ClipboardCheck, Users, BarChart3, Target, Clock, Crown, BookOpen, Lock, Check, MessageSquare, ListChecks, FileText, FileStack, ScrollText, Award, TrendingUp, MoreVertical } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { ComparativoTurma } from '@/components/simulado/comparativo-turma'
import type { Comparativo } from '@/lib/simulado/comparativo'
import type { TentativaResumo, QuestaoAgregada } from '@/lib/simulado/resultado-aluno'
import type { DesempenhoSimulado } from '@/lib/simulado/desempenho-aluno'

const notaTone = (n: number) => (n >= 7 ? 'text-emerald-600 dark:text-emerald-400' : n >= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
const pctBar = (p: number) => (p >= 70 ? 'bg-emerald-500' : p >= 50 ? 'bg-amber-500' : 'bg-rose-500')
const fmtDur = (ms: number) => { const m = Math.floor(ms / 60000), s = Math.round((ms % 60000) / 1000); return m > 0 ? `${m}min ${String(s).padStart(2, '0')}s` : `${s}s` }
const fmtData = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—')
const nota = (n: number | null) => (n == null ? '—' : Number(n).toFixed(1).replace('.', ','))

export function MeuSimuladoView({
  tentativas, questoes, comparativo, desempenho, notaLiberada, gabaritoLiberado, cadernoLiberado, cadernoId, estId, simuladoId, simuladoTitulo,
}: {
  tentativas: TentativaResumo[]
  questoes: QuestaoAgregada[]
  comparativo: Comparativo
  desempenho: DesempenhoSimulado[]
  notaLiberada: boolean
  gabaritoLiberado: boolean
  cadernoLiberado: boolean
  cadernoId: string | null
  estId: string
  simuladoId: string
  simuladoTitulo: string
}) {
  const ordenadas = useMemo(() => [...tentativas].sort((a, b) => (a.n ?? 0) - (b.n ?? 0)), [tentativas])
  const melhorId = useMemo(() => {
    if (!tentativas.length) return null
    return [...tentativas].sort((a, b) => (Number(b.nota ?? -1) - Number(a.nota ?? -1)) || (new Date(b.finalizado ?? 0).getTime() - new Date(a.finalizado ?? 0).getTime()))[0].id
  }, [tentativas])
  const [selId, setSelId] = useState<string | null>(melhorId)
  const sel = tentativas.find((t) => t.id === selId) ?? ordenadas[0]

  // Seleção da métrica — todos os simulados já vêm marcados.
  const [metrica, setMetrica] = useState<Set<string>>(() => new Set(desempenho.map((s) => s.id)))
  const toggleMetrica = (id: string) => setMetrica((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selecionarTodos = () => setMetrica(new Set(desempenho.map((s) => s.id)))
  const limparSelecao = () => setMetrica(new Set())

  const listaM = useMemo(() => desempenho.filter((s) => metrica.has(s.id)), [desempenho, metrica])
  const notasM = listaM.map((s) => s.nota).filter((n): n is number => n != null)
  const notaMedia = notasM.length ? Math.round((notasM.reduce((a, b) => a + b, 0) / notasM.length) * 10) / 10 : null
  const melhorNota = notasM.length ? Math.max(...notasM) : null
  const pontos = useMemo(() => listaM
    .flatMap((s) => s.tentativas.map((t) => ({ ...t, simulado: s.titulo, simId: s.id })))
    .sort((a, b) => new Date(a.finalizado ?? 0).getTime() - new Date(b.finalizado ?? 0).getTime()), [listaM])
  const porDiscM = useMemo(() => {
    const m = new Map<string, { ac: number; tt: number }>()
    for (const s of listaM) for (const d of s.porDisc) { const v = m.get(d.nome) ?? { ac: 0, tt: 0 }; v.ac += d.ac; v.tt += d.tt; m.set(d.nome, v) }
    return [...m.entries()].map(([nome, v]) => ({ nome, ac: v.ac, tt: v.tt, pct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0 })).sort((a, b) => b.pct - a.pct)
  }, [listaM])

  const outros = useMemo(() => desempenho.filter((s) => s.id !== simuladoId), [desempenho, simuladoId])
  const atualNaMetrica = desempenho.some((s) => s.id === simuladoId)
  const todosMarcados = desempenho.length > 0 && metrica.size === desempenho.length
  const nenhumMarcado = metrica.size === 0
  const notaAtual = desempenho.find((s) => s.id === simuladoId)?.nota ?? (notaLiberada ? (sel?.nota ?? null) : null)

  // URLs de impressão (PDF) por tentativa.
  const gabaritoUrl = (id: string) => `/imprimir/resultado/${id}`
  const cadUrl = (id: string, mod?: string) => (cadernoId ? `/imprimir/caderno/${cadernoId}?sessao=${id}&aluno=${estId}${mod ? `&mod=${mod}` : ''}` : gabaritoUrl(id))
  const abrir = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')

  return (
    <Tabs defaultValue="geral">
      <TabsList>
        <TabsTrigger value="geral"><LayoutDashboard className="h-4 w-4" /> Visão geral</TabsTrigger>
        <TabsTrigger value="questoes"><ClipboardCheck className="h-4 w-4" /> Questões</TabsTrigger>
        <TabsTrigger value="turma"><Users className="h-4 w-4" /> Comparativo</TabsTrigger>
      </TabsList>

      <TabsContent value="geral" className="pt-1">
        <div className="grid gap-5 lg:grid-cols-3">
          {/* ESQUERDA: desempenho da tentativa + métrica consolidada */}
          <div className="space-y-5 lg:col-span-2">
            {!notaLiberada ? (
              <Bloqueado titulo="Desempenho ainda não liberado" msg="Você concluiu este simulado. Os acertos, o tempo e o desempenho por disciplina aparecem assim que o professor liberar a nota." />
            ) : sel ? (
              <>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <Kpi icon={Target} label="Acerto" value={`${sel.pct}%`} sub={`${sel.acertos}/${sel.total}`} chip="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" />
                  <Kpi icon={Clock} label="Tempo" value={sel.tempoMs ? fmtDur(sel.tempoMs) : '—'} chip="bg-violet-500/15 text-violet-600 dark:text-violet-400" />
                  <Kpi icon={Crown} label="Posição" value={sel.posicao ? `${sel.posicao}º` : '—'} chip="bg-amber-500/15 text-amber-600 dark:text-amber-400" />
                  <Kpi icon={ListChecks} label="Nota" value={nota(sel.nota)} chip="bg-sky-500/15 text-sky-600 dark:text-sky-400" />
                </div>
              </>
            ) : null}

            {/* MÉTRICA DE DESEMPENHO — reflete os simulados marcados ao lado */}
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><BarChart3 className="h-4 w-4" /></span>
                <div>
                  <h2 className="text-sm font-semibold leading-tight">Métrica de desempenho</h2>
                  <p className="text-[11px] text-muted-foreground">Progresso entre os simulados marcados</p>
                </div>
              </div>

              {desempenho.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Conclua simulados com nota liberada para ver sua métrica consolidada.</p>
              ) : listaM.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Nenhum simulado selecionado. Marque na lista ao lado.</p>
              ) : (
                <div className="space-y-5 p-4">
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <Kpi icon={ListChecks} label="Simulados" value={listaM.length} chip="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" />
                    <Kpi icon={TrendingUp} label="Tentativas" value={pontos.length} chip="bg-sky-500/15 text-sky-600 dark:text-sky-400" />
                    <Kpi icon={Award} label="Nota média" value={nota(notaMedia)} chip="bg-violet-500/15 text-violet-600 dark:text-violet-400" />
                    <Kpi icon={Crown} label="Melhor nota" value={nota(melhorNota)} chip="bg-amber-500/15 text-amber-600 dark:text-amber-400" />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Progresso por tentativa</h3><span className="text-xs text-muted-foreground">({pontos.length})</span></div>
                    <div className="overflow-x-auto rounded-xl border bg-muted/20 p-3">
                      <div className="flex min-w-full items-end gap-2" style={{ height: 160 }}>
                        {pontos.map((p, i) => {
                          const prev = i > 0 ? pontos[i - 1].nota : null
                          const subiu = p.nota != null && prev != null ? p.nota - prev : null
                          return (
                            <div key={`${p.simId}-${p.n}-${i}`} className="flex min-w-[42px] flex-1 flex-col items-center justify-end gap-1" title={`${p.simulado} · Tentativa ${p.n}`}>
                              <span className={cn('text-xs font-bold tabular-nums', p.nota != null && notaTone(p.nota))}>{nota(p.nota)}</span>
                              <div className="flex w-full max-w-[46px] flex-col justify-end overflow-hidden rounded-t-md bg-muted" style={{ height: `${Math.max(4, ((p.nota ?? 0) / 10) * 120)}px` }}>
                                <div className={cn('w-full', p.nota != null ? pctBar((p.nota ?? 0) * 10) : 'bg-muted')} style={{ height: '100%' }} />
                              </div>
                              <span className={cn('flex h-3 items-center text-[9px] font-semibold tabular-nums', subiu == null ? 'text-transparent' : subiu > 0 ? 'text-emerald-600 dark:text-emerald-400' : subiu < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                                {subiu != null && subiu !== 0 ? `${subiu > 0 ? '▲' : '▼'}${Math.abs(Math.round(subiu * 10) / 10)}` : '·'}
                              </span>
                              <span className="w-full truncate text-center text-[10px] text-muted-foreground">{p.simulado}</span>
                              <span className="text-[9px] text-muted-foreground">#{p.n}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {porDiscM.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Acerto por disciplina (consolidado)</h3></div>
                      <div className="space-y-3">
                        {porDiscM.map((d) => (
                          <div key={d.nome}>
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                              <span className="text-sm font-medium">{d.nome}</span>
                              <span className="text-xs tabular-nums text-muted-foreground">{d.ac}/{d.tt} · <b className={notaTone(d.pct / 10)}>{d.pct}%</b></span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', pctBar(d.pct))} style={{ width: `${d.pct}%` }} /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* DIREITA: histórico + seleção da métrica (tudo junto) */}
          <div className="lg:col-span-1">
            <div className="overflow-hidden rounded-2xl border bg-card lg:sticky lg:top-4">
              <div className="border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Histórico e simulados</h3>
                </div>
                {desempenho.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={selecionarTodos} className={cn('flex-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors', todosMarcados ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>Selecionar todos</button>
                    <button type="button" onClick={limparSelecao} className={cn('flex-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors', nenhumMarcado ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>Limpar seleção</button>
                  </div>
                )}
              </div>

              <div className="max-h-[560px] overflow-y-auto">
                {/* Simulado atual + tentativas (histórico com kebab de download) */}
                <div className="border-l-2 border-primary">
                  <button type="button" onClick={() => atualNaMetrica && toggleMetrica(simuladoId)} disabled={!atualNaMetrica}
                    className={cn('flex w-full items-center gap-2.5 bg-primary/5 px-3 py-2.5 text-left', atualNaMetrica && 'hover:bg-primary/10')}>
                    <CheckBox on={metrica.has(simuladoId)} disabled={!atualNaMetrica} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight">{simuladoTitulo}</p>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-primary/80">Este simulado</p>
                    </div>
                    <span className={cn('shrink-0 text-sm font-bold tabular-nums', notaAtual != null ? notaTone(notaAtual) : 'text-muted-foreground')}>{nota(notaAtual)}</span>
                  </button>

                  <div className="divide-y">
                    {ordenadas.map((t) => {
                      const on = t.id === sel?.id
                      return (
                        <div key={t.id} className={cn('flex items-center gap-1 pr-2 transition-colors', on ? 'bg-primary/10' : 'hover:bg-muted/50')}>
                          <button type="button" onClick={() => setSelId(t.id)} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-6 text-left">
                            <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums', on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>#{t.n}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium leading-tight">Tentativa {t.n}</p>
                              <p className="text-[11px] text-muted-foreground">{fmtData(t.finalizado)}</p>
                            </div>
                            {notaLiberada
                              ? <span className={cn('shrink-0 text-sm font-bold tabular-nums', t.nota != null && notaTone(Number(t.nota)))}>{nota(t.nota)}</span>
                              : <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          </button>
                          {cadernoLiberado ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground" title="Baixar cadernos">
                                <MoreVertical className="h-4 w-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel>Cadernos · Tentativa {t.n}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => abrir(gabaritoUrl(t.id))}><FileText className="mr-2 h-4 w-4" /> Gabarito</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => abrir(cadUrl(t.id, 'caderno_completo'))}><FileStack className="mr-2 h-4 w-4" /> Caderno completo</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => abrir(cadUrl(t.id))}><ScrollText className="mr-2 h-4 w-4" /> Prova realizada</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground/40" title="Cadernos ainda não liberados"><Lock className="h-3.5 w-3.5" /></span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Demais simulados (selecionáveis para a métrica) */}
                {outros.length > 0 && (
                  <div className="border-t">
                    <p className="bg-muted/30 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Outros simulados</p>
                    <div className="divide-y">
                      {outros.map((s) => (
                        <button key={s.id} type="button" onClick={() => toggleMetrica(s.id)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50">
                          <CheckBox on={metrica.has(s.id)} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.titulo}</span>
                          <span className={cn('shrink-0 text-xs font-bold tabular-nums', s.nota != null ? notaTone(s.nota) : 'text-muted-foreground')}>{nota(s.nota)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </TabsContent>

      {/* QUESTÕES */}
      <TabsContent value="questoes" className="space-y-3 pt-1">
        <QuestoesAgregadas questoes={questoes} totalTentativas={tentativas.length} revelou={gabaritoLiberado} />
      </TabsContent>

      {/* COMPARATIVO */}
      <TabsContent value="turma" className="pt-1">
        {notaLiberada ? <ComparativoTurma c={comparativo} /> : <Bloqueado titulo="Comparativo indisponível" msg="O comparativo com a turma aparece quando o resultado for liberado." />}
      </TabsContent>
    </Tabs>
  )
}

function CheckBox({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
      disabled ? 'border-muted-foreground/20 bg-muted' : on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
      {on && !disabled && <Check className="h-3 w-3" />}
    </span>
  )
}

function QuestoesAgregadas({ questoes, totalTentativas, revelou }: { questoes: QuestaoAgregada[]; totalTentativas: number; revelou: boolean }) {
  const [filtro, setFiltro] = useState<'todas' | 'erradas' | 'branco'>('todas')
  const comErro = questoes.filter((q) => q.errou > 0).length
  const comBranco = questoes.filter((q) => q.branco > 0).length
  const lista = useMemo(() => {
    if (filtro === 'erradas') return questoes.filter((q) => q.errou > 0)
    if (filtro === 'branco') return questoes.filter((q) => q.branco > 0)
    return questoes
  }, [questoes, filtro])

  if (!questoes.length) return <p className="py-8 text-center text-sm text-muted-foreground">Sem questões para revisar.</p>

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Contagem entre as {totalTentativas} tentativa(s){revelou ? '' : ' — a alternativa correta aparece quando o gabarito for liberado'}.</p>

      {revelou && (
        <div className="flex flex-wrap gap-1.5">
          {([['todas', `Todas (${questoes.length})`], ['erradas', `Com erro (${comErro})`], ['branco', `Em branco (${comBranco})`]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)}
              className={cn('rounded-full border px-3 py-1 text-sm font-medium transition-colors', filtro === v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {lista.map((q) => (
          <div key={q.ordem} className="rounded-2xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-bold tabular-nums text-muted-foreground">{q.ordem}</span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  {q.disciplina && <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{q.disciplina}</span>}
                  {revelou && <><span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Acertou {q.acertou}x</span>
                    <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">Errou {q.errou}x</span></>}
                  {q.branco > 0 && <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Em branco {q.branco}x</span>}
                </div>
                <p className="text-sm text-foreground/90">{q.enunciado}</p>
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              {q.alternativas.map((a) => (
                <div key={a.letra} className={cn('flex items-center gap-2.5 rounded-lg border px-2 py-1.5 text-sm', a.correta ? 'border-emerald-500/40 bg-emerald-500/10' : a.escolhas > 0 ? 'border-primary/30 bg-primary/5' : 'border-transparent')}>
                  <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold', a.correta ? 'bg-emerald-500 text-white' : a.escolhas > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{a.letra}</span>
                  <span className={cn('min-w-0 flex-1 truncate', (a.correta || a.escolhas > 0) && 'font-medium')} title={a.texto}>{a.texto || '—'}</span>
                  {a.escolhas > 0 && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" title="Vezes que você marcou">{a.escolhas}x</span>}
                  {a.correta && <Check className="h-4 w-4 shrink-0 text-emerald-500" />}
                </div>
              ))}
            </div>

            {q.comentario && (
              <div className="mt-3 flex gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Comentário do professor</p><p className="mt-0.5 text-foreground/90">{q.comentario}</p></div>
              </div>
            )}
          </div>
        ))}
        {lista.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma questão nesse filtro.</p>}
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, chip }: { icon: any; label: string; value: React.ReactNode; sub?: string; chip: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', chip)}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-xl font-bold leading-none tabular-nums">{value}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}{sub ? ` · ${sub}` : ''}</p>
        </div>
      </div>
    </div>
  )
}

function Bloqueado({ titulo, msg }: { titulo: string; msg: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card p-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><Lock className="h-6 w-6" /></span>
      <p className="text-base font-semibold">{titulo}</p>
      <p className="max-w-md text-sm text-muted-foreground">{msg}</p>
    </div>
  )
}
