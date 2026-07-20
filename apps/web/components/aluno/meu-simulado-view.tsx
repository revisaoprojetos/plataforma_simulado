'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { LayoutDashboard, ClipboardCheck, Users, BarChart3, Target, Clock, Crown, BookOpen, Lock, Check, MessageSquare, ListChecks, FileText, ScrollText, Award, TrendingUp, MoreVertical, Download, Loader2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ComparativoTurma } from '@/components/simulado/comparativo-turma'
import type { Comparativo } from '@/lib/simulado/comparativo'
import type { TentativaResumo, QuestaoAgregada } from '@/lib/simulado/resultado-aluno'
import type { DesempenhoSimulado } from '@/lib/simulado/desempenho-aluno'

const notaTone = (n: number) => (n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
const pctBar = (p: number) => (p >= 70 ? 'bg-emerald-500' : p >= 50 ? 'bg-amber-500' : 'bg-rose-500')
const fmtDur = (ms: number) => { const m = Math.floor(ms / 60000), s = Math.round((ms % 60000) / 1000); return m > 0 ? `${m}min ${String(s).padStart(2, '0')}s` : `${s}s` }
const fmtData = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—')
const nota = (n: number | null) => (n == null ? '—' : Number(n).toFixed(1).replace('.', ','))

export function MeuSimuladoView({
  tentativas, questoes, comparativo, desempenho, notaLiberada, gabaritoLiberado, cadernoLiberado, cadernoId, modalidades, estId, simuladoId, simuladoTitulo,
}: {
  tentativas: TentativaResumo[]
  questoes: QuestaoAgregada[]
  comparativo: Comparativo
  desempenho: DesempenhoSimulado[]
  notaLiberada: boolean
  gabaritoLiberado: boolean
  cadernoLiberado: boolean
  cadernoId: string | null
  modalidades: { id: string; nome: string; semGab: boolean; comGab: boolean; pdfUrl?: string }[]
  estId: string
  simuladoId: string
  simuladoTitulo: string
}) {
  const ordenadas = useMemo(() => [...tentativas].sort((a, b) => (a.n ?? 0) - (b.n ?? 0)), [tentativas])

  // Multi-seleção de tentativas DESTE simulado (padrão: todas marcadas).
  const [selTents, setSelTents] = useState<Set<string>>(() => new Set(tentativas.map((t) => t.id)))
  const toggleTent = (id: string) => setSelTents((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selTodasTent = () => setSelTents(new Set(tentativas.map((t) => t.id)))
  const limparTent = () => setSelTents(new Set())
  const tentSel = useMemo(() => ordenadas.filter((t) => selTents.has(t.id)), [ordenadas, selTents])
  const todasTentMarcadas = tentativas.length > 0 && selTents.size === tentativas.length
  const nenhumaTentMarcada = selTents.size === 0

  // Tentativa em foco para os KPIs do topo: a melhor entre as selecionadas.
  const foco = useMemo(() => {
    const pool = tentSel.length ? tentSel : ordenadas
    return [...pool].sort((a, b) => (Number(b.nota ?? -1) - Number(a.nota ?? -1)) || (new Date(b.finalizado ?? 0).getTime() - new Date(a.finalizado ?? 0).getTime()))[0]
  }, [tentSel, ordenadas])

  // Pontos do gráfico = apenas as tentativas selecionadas DESTE simulado (histórico do simulado).
  const pontos = useMemo(() => {
    return tentSel
      .map((t) => ({ nota: t.nota, n: t.n, simulado: simuladoTitulo, simId: simuladoId, finalizado: t.finalizado }))
      .sort((a, b) => new Date(a.finalizado ?? 0).getTime() - new Date(b.finalizado ?? 0).getTime())
  }, [tentSel, simuladoTitulo, simuladoId])

  const notasM = pontos.map((p) => p.nota).filter((n): n is number => n != null)
  const notaMedia = notasM.length ? Math.round((notasM.reduce((a, b) => a + b, 0) / notasM.length) * 10) / 10 : null
  const melhorNota = notasM.length ? Math.max(...notasM) : null
  const nSimulados = new Set(pontos.map((p) => p.simId)).size

  const porDiscM = useMemo(() => {
    const m = new Map<string, { ac: number; tt: number }>()
    const add = (ds: { nome: string; ac: number; tt: number }[]) => { for (const d of ds) { const v = m.get(d.nome) ?? { ac: 0, tt: 0 }; v.ac += d.ac; v.tt += d.tt; m.set(d.nome, v) } }
    for (const t of tentSel) add(t.porDisc)
    return [...m.entries()].map(([nome, v]) => ({ nome, ac: v.ac, tt: v.tt, pct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0 })).sort((a, b) => b.pct - a.pct)
  }, [tentSel])

  // URLs de impressão (PDF) por tentativa.
  const gabaritoUrl = (id: string) => `/imprimir/resultado/${id}`
  // rawimg=1: mantém os fundos em base64 embutido (renderiza direto, sem depender do bucket
  // de storage — evita fundo branco quando o bucket público não está acessível).
  const cadUrl = (id: string, mod: string, gab = false) => `/imprimir/caderno/${cadernoId}?sessao=${id}&aluno=${estId}&mod=${mod}&rawimg=1${gab ? '&gabarito=1' : ''}`
  const abrir = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')

  // Modal de download de cadernos (por tentativa).
  const [modalTent, setModalTent] = useState<TentativaResumo | null>(null)
  const [baixando, setBaixando] = useState<string | null>(null)

  // Baixa o caderno como ARQUIVO PDF (attachment) — 1 clique → salvar arquivo. O servidor
  // renderiza a página de impressão (Edge headless) COM os fundos/cards e devolve o PDF.
  // Fallback: se a geração falhar (ex.: sem navegador no host), abre a página com print=1.
  async function baixarCaderno(sessaoId: string, mod: string, nome: string, gab = false) {
    // Enunciado = PDF importado: entrega direta do arquivo, sem gerar no servidor.
    const md = modalidades.find((m) => m.id === mod)
    if (md?.pdfUrl) { abrir(md.pdfUrl); return }
    if (!cadernoId) { abrir(cadUrl(sessaoId, mod, gab)); return }
    const chave = `${sessaoId}:${mod}:${gab ? 'g' : 's'}`
    if (baixando) return
    const limpar = (s?: string) => (s ?? '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')
    const arquivo = [simuladoTitulo, nome, `tentativa-${modalTent?.n ?? ''}`].map(limpar).filter(Boolean).join('_') || 'caderno'
    const qs = new URLSearchParams({ caderno: cadernoId, sessao: sessaoId, mod, nome: arquivo })
    if (estId) qs.set('aluno', estId)
    if (gab) qs.set('gabarito', '1')
    setBaixando(chave)
    toast.loading('Gerando PDF com o fundo e os cards…', { id: 'cadpdf' })
    try {
      const res = await fetch(`/api/aluno/caderno-pdf?${qs.toString()}`)
      if (!res.ok) throw new Error('falha')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${arquivo}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast.success('Download concluído', { id: 'cadpdf', description: nome })
    } catch {
      toast.error('Não foi possível gerar o PDF agora. Tente novamente em instantes.', { id: 'cadpdf' })
    } finally {
      setBaixando(null)
    }
  }

  return (
    <>
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
            {!notaLiberada && (
              <Bloqueado titulo="Desempenho ainda não liberado" msg="Você concluiu este simulado. Os acertos, o tempo e o desempenho por disciplina aparecem assim que o professor liberar a nota." />
            )}

            {/* MÉTRICA DE DESEMPENHO — só aparece quando a nota está liberada */}
            {notaLiberada && (
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><BarChart3 className="h-4 w-4" /></span>
                <div>
                  <h2 className="text-sm font-semibold leading-tight">Métrica de desempenho</h2>
                  <p className="text-[11px] text-muted-foreground">Comparação das tentativas selecionadas</p>
                </div>
              </div>

              {pontos.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma tentativa selecionada. Marque na lista ao lado.</p>
              ) : (
                <div className="space-y-5 p-4">
                  {foco && notaLiberada && (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border bg-muted/20 px-3.5 py-2.5 text-sm">
                      <span className="inline-flex items-center gap-1.5 font-semibold"><Crown className="h-4 w-4 text-amber-500" /> Melhor tentativa <span className="font-normal text-muted-foreground">#{foco.n}</span></span>
                      <span className="text-muted-foreground"><Target className="mr-1 inline h-3.5 w-3.5" />Acerto <b className="text-foreground">{foco.pct}%</b> <span className="text-xs">({foco.acertos}/{foco.total})</span></span>
                      <span className="text-muted-foreground"><Clock className="mr-1 inline h-3.5 w-3.5" />Tempo <b className="text-foreground">{foco.tempoMs ? fmtDur(foco.tempoMs) : '—'}</b></span>
                      <span className="text-muted-foreground">Posição <b className="text-foreground">{foco.posicao ? `${foco.posicao}º` : '—'}</b></span>
                      <span className="text-muted-foreground">Nota <b className={cn('tabular-nums', foco.nota != null ? notaTone(Number(foco.nota)) : 'text-foreground')}>{nota(foco.nota)}</b></span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <Kpi icon={ListChecks} label="Simulados" value={nSimulados} chip="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" />
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
                              <div className="flex w-full max-w-[46px] flex-col justify-end overflow-hidden rounded-t-md bg-muted" style={{ height: `${Math.max(4, ((p.nota ?? 0) / 100) * 120)}px` }}>
                                <div className={cn('w-full', p.nota != null ? pctBar(p.nota ?? 0) : 'bg-muted')} style={{ height: '100%' }} />
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
                              <span className="text-xs tabular-nums text-muted-foreground">{d.ac}/{d.tt} · <b className={notaTone(d.pct)}>{d.pct}%</b></span>
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
            )}
          </div>

          {/* DIREITA: histórico do simulado selecionado */}
          <div className="lg:col-span-1">
            <div className="overflow-hidden rounded-2xl border bg-card lg:sticky lg:top-4">
              <div className="border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Tentativas</h3>
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{selTents.size}/{tentativas.length}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Marque tentativas para comparar no gráfico.</p>
                {tentativas.length > 1 && (
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={selTodasTent} className={cn('flex-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors', todasTentMarcadas ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>Selecionar todas</button>
                    <button type="button" onClick={limparTent} className={cn('flex-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors', nenhumaTentMarcada ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>Limpar</button>
                  </div>
                )}
              </div>

              <div className="max-h-[560px] overflow-y-auto">
                {/* Tentativas deste simulado — multi-seleção + kebab de download */}
                <div>
                  <div className="divide-y">
                    {ordenadas.map((t) => {
                      const on = selTents.has(t.id)
                      return (
                        <div key={t.id} className={cn('flex items-center gap-1 pr-2 transition-colors', on ? 'bg-primary/5' : 'hover:bg-muted/50')}>
                          <button type="button" onClick={() => toggleTent(t.id)} className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-3 text-left">
                            <CheckBox on={on} />
                            <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums', on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>#{t.n}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium leading-tight">Tentativa {t.n}</p>
                              <p className="text-[11px] text-muted-foreground">{fmtData(t.finalizado)}</p>
                            </div>
                            {notaLiberada
                              ? <span className={cn('shrink-0 text-sm font-bold tabular-nums', t.nota != null && notaTone(Number(t.nota)))}>{nota(t.nota)}</span>
                              : <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          </button>
                          <button type="button" onClick={() => setModalTent(t)} title="Material para download"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
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

    {/* MODAL — download de cadernos (sem gabarito × com gabarito) */}
    <Dialog open={!!modalTent} onOpenChange={(o) => { if (!o) setModalTent(null) }}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Download className="h-4 w-4" /></span>
            Material para download
          </DialogTitle>
          <DialogDescription>
            {modalTent && `Tentativa ${modalTent.n} · ${fmtData(modalTent.finalizado)}${modalTent.nota != null && notaLiberada ? ` · nota ${nota(modalTent.nota)}` : ''}`}
          </DialogDescription>
        </DialogHeader>
        {modalTent && (
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {/* Como você fez — sem gabarito (sempre disponível) */}
            <section className="rounded-2xl border bg-muted/20 p-3">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-sm"><ScrollText className="h-4 w-4" /></span>
                <div className="leading-tight">
                  <h4 className="text-sm font-semibold">Como você fez</h4>
                  <p className="text-[11px] text-muted-foreground">Sem gabarito · sempre disponível</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {modalidades.some((m) => m.semGab)
                  ? modalidades.filter((m) => m.semGab).map((m) => <BtnCaderno key={m.id} nome={m.nome} loading={baixando === `${modalTent.id}:${m.id}:s`} onClick={() => baixarCaderno(modalTent.id, m.id, m.nome)} />)
                  : <BtnCaderno nome="Prova que você fez" onClick={() => abrir(`${gabaritoUrl(modalTent.id)}?sem=1`)} />}
              </div>
            </section>

            {/* Com correção — só com liberação do gabarito */}
            <section className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-3">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm"><FileText className="h-4 w-4" /></span>
                <div className="leading-tight">
                  <h4 className="text-sm font-semibold">Com correção</h4>
                  <p className="text-[11px] text-muted-foreground">Gabarito</p>
                </div>
              </div>
              {!gabaritoLiberado ? (
                <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Disponível quando o professor liberar o gabarito.</p>
              ) : modalidades.some((m) => m.comGab) ? (
                <div className="space-y-1.5">
                  {modalidades.filter((m) => m.comGab).map((m) => <BtnCaderno key={m.id} nome={m.nome} gab loading={baixando === `${modalTent.id}:${m.id}:g`} onClick={() => baixarCaderno(modalTent.id, m.id, m.nome, true)} />)}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <BtnCaderno nome="Espelho da prova (com correção)" gab onClick={() => abrir(gabaritoUrl(modalTent.id))} />
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}

function BtnCaderno({ nome, onClick, gab, loading }: { nome: string; onClick: () => void; gab?: boolean; loading?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className={cn('group flex w-full items-center gap-2.5 rounded-xl border bg-card p-2.5 text-left text-sm shadow-sm transition-all hover:shadow-md disabled:opacity-70', gab ? 'border-primary/20 hover:border-primary/50' : 'hover:border-foreground/20')}>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', gab ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}><FileText className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1 truncate font-medium">{loading ? 'Gerando PDF…' : nome}</span>
      {loading
        ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        : <Download className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5 group-hover:text-foreground" />}
    </button>
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
