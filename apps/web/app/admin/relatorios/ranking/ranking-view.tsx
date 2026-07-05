'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trophy, SlidersHorizontal, FileSpreadsheet, Crown, Medal, Users, Star, FolderTree, RefreshCw, Download, Shield, RotateCcw } from 'lucide-react'
import { baixarCsv } from '@/components/admin/relatorios/kit'
import { usePdfDownloads } from '@/components/pdf-downloads-provider'
import { CriteriosForm } from './criterios-form'
import { salvarCriteriosRanking } from './actions'
import { ordenarRanking, rotuloCriterio, type CriteriosRanking, type EntradaRanking } from '@/lib/simulado/ranking'

type Grupo = { id: string; nome: string; count: number }

const nota = (n: number | null) => (n == null ? '—' : n.toFixed(2).replace('.', ','))
const fmtDataHora = (s?: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

export function RankingView({ simuladoId, titulo, grupos, totalQuestoes, entradas, criteriosIniciais, afetados }: {
  simuladoId: string; titulo: string; grupos: Grupo[]; totalQuestoes: number; entradas: EntradaRanking[]; criteriosIniciais: CriteriosRanking; afetados: number
}) {
  const router = useRouter()
  const { registrar } = usePdfDownloads()
  const [tab, setTab] = useState<'classificacao' | 'criterios'>('classificacao')
  const [criterios, setCriterios] = useState<CriteriosRanking>(criteriosIniciais)
  const [comRecorrecao, setComRecorrecao] = useState(true)
  const [ate, setAte] = useState(50)
  const [baixando, setBaixando] = useState(false)
  const primeiro = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const r = await salvarCriteriosRanking(simuladoId, criterios)
      if (r?.error) toast.error(r.error); else toast.success('Critérios salvos', { duration: 1200 })
    }, 500)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [criterios, simuladoId])

  // Aplica a fonte de pontuação escolhida (com/sem anulações) antes de ordenar.
  const base = useMemo(() => entradas.map((e) => ({ ...e, pontuacao: comRecorrecao ? e.pontuacao : (e.pontuacaoSem ?? e.pontuacao) })), [entradas, comRecorrecao])
  const ranking = useMemo(() => ordenarRanking(base, criterios), [base, criterios])
  const visivel = useMemo(() => ranking.slice(0, Math.max(1, ate || ranking.length)), [ranking, ate])

  const nomeGrupo = (id: string) => grupos.find((g) => g.id === id)?.nome
  const gruposUsados = (criterios.criterios ?? []).filter((cr) => cr.tipo === 'grupo' && cr.grupoId).map((cr) => cr.grupoId!) as string[]

  // KPIs
  const topo = ranking[0]
  const melhorAcerto = ranking.reduce((m, r) => Math.max(m, r.total ? Math.round((r.acertos / r.total) * 100) : 0), 0)

  function exportar() {
    const cab = ['Posição', 'Estudante', 'E-mail', 'Data', 'Pontuação', 'Acertos', '%', ...gruposUsados.map((g) => nomeGrupo(g) ?? 'Grupo'), 'Classificação', 'Idade']
    const linhas: (string | number | null)[][] = [
      ['Ranking', titulo], comRecorrecao ? ['Considerando anulações e trocas'] : ['Sem anulações/trocas'], [],
      cab,
      ...visivel.map((r) => [r.pos, r.nome, r.email ?? '', fmtDataHora(r.data), nota(r.pontuacao), `${r.acertos}/${r.total}`, r.total ? Math.round((r.acertos / r.total) * 100) : 0, ...gruposUsados.map((g) => r.porGrupo[g] ?? 0), r.classificacao ?? '', r.idade ?? '—']),
    ]
    baixarCsv(`${titulo}_ranking`, linhas)
  }

  async function baixarPdf() {
    if (baixando) return
    setBaixando(true)
    try {
      const res = await fetch('/api/pdf/gerar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'ranking', simuladoId, ate, titulo: `Ranking — ${titulo}` }),
      })
      const data = await res.json()
      if (!res.ok || !data.jobId) { toast.error(data.message ?? 'Servidor de PDF indisponível.'); return }
      const limpar = (s: string) => s.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')
      registrar({ id: data.jobId, nome: `Ranking ${titulo}`, arquivo: `${limpar(titulo)}_ranking`, statusUrl: `/api/pdf/jobs/${data.jobId}` })
    } catch { toast.error('Erro de rede ao iniciar a geração.') }
    finally { setBaixando(false) }
  }

  return (
    <div className="space-y-4">
      {/* Barra de comando: tabs (esq) + ações (dir) — SEMPRE no mesmo lugar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border bg-card p-0.5 shadow-sm">
          <button type="button" onClick={() => setTab('classificacao')} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${tab === 'classificacao' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}><Trophy className="h-4 w-4" /> Classificação</button>
          <button type="button" onClick={() => setTab('criterios')} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${tab === 'criterios' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}><SlidersHorizontal className="h-4 w-4" /> Critérios</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => router.refresh()} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted" title="Atualizar">
            <RefreshCw className="h-4 w-4" /> <span className="hidden sm:inline">Atualizar</span>
          </button>
          <button type="button" onClick={exportar} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
            <FileSpreadsheet className="h-4 w-4" /> CSV
          </button>
          <label className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground">
            Até
            <input type="number" min={1} value={ate} onChange={(e) => setAte(Number(e.target.value) || 0)} className="w-14 rounded-md border bg-[var(--input-bg,transparent)] px-2 py-0.5 text-center text-foreground outline-none focus:ring-1 focus:ring-ring" />
          </label>
          <button type="button" onClick={baixarPdf} disabled={baixando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
            <Download className="h-4 w-4" /> {baixando ? 'Gerando…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {tab === 'classificacao' ? (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={<Users className="h-4 w-4" />} tint="bg-blue-500/15 text-blue-600 dark:text-blue-400" rotulo="Participantes" valor={ranking.length} />
            <Kpi icon={<Crown className="h-4 w-4" />} tint="bg-amber-500/15 text-amber-600 dark:text-amber-400" rotulo="1º lugar" valor={topo ? nota(topo.pontuacao) : '—'} />
            <Kpi icon={<Star className="h-4 w-4" />} tint="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" rotulo="Melhor acerto" valor={`${melhorAcerto}%`} />
            <Kpi icon={<FolderTree className="h-4 w-4" />} tint="bg-violet-500/15 text-violet-600 dark:text-violet-400" rotulo="Grupos identificados" valor={grupos.filter((g) => g.count > 0).length} />
          </div>

          {/* Pódio dos 3 primeiros */}
          {ranking.length > 0 && <Podio top={ranking.slice(0, 3)} nota={nota} />}

          {/* resumo dos critérios */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border bg-muted/30 px-3 py-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">Desempate</span>
            <span className="text-muted-foreground/60">Pontuação</span>
            {(criterios.criterios ?? []).map((cr, i) => (
              <ChipCriterio key={cr.id} ativo tag={`${i + 1}º`} texto={rotuloCriterio(cr, nomeGrupo)} />
            ))}
            {(criterios.criterios ?? []).length === 0 && <span className="text-muted-foreground/60">(sem critérios)</span>}
            <button type="button" onClick={() => setTab('criterios')} className="ml-auto text-primary hover:underline">Configurar</button>
          </div>

          {/* toggle anulações/trocas */}
          {afetados > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><RotateCcw className="h-4 w-4" /></span>
                <div>
                  <div className="text-sm font-medium">Considerando anulações e trocas</div>
                  <div className="text-xs text-muted-foreground">Inclui os pontos de questões anuladas / gabaritos trocados — {afetados} aluno(s) afetado(s).</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className={comRecorrecao ? 'text-muted-foreground' : 'font-medium'}>Sem</span>
                <button type="button" onClick={() => setComRecorrecao((v) => !v)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${comRecorrecao ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${comRecorrecao ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
                <span className={comRecorrecao ? 'font-medium' : 'text-muted-foreground'}>Com</span>
              </div>
            </div>
          )}

          {/* linhas */}
          {ranking.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">Sem sessões finalizadas neste simulado.</div>
          ) : (
            <div className="space-y-2">
              {visivel.map((r) => {
                const pct = r.total ? Math.round((r.acertos / r.total) * 100) : 0
                return (
                  <div key={r.estudanteId} className={`flex items-center gap-4 rounded-2xl border p-3 transition ${r.pos <= 3 ? 'bg-gradient-to-r from-amber-50/60 to-transparent dark:from-amber-950/20' : 'bg-card'}`}>
                    <Posicao pos={r.pos} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{r.nome}</span>
                        {r.classificacao && <BadgeClass texto={r.classificacao} />}
                      </div>
                      {r.email && <div className="truncate text-xs text-muted-foreground">{r.email}</div>}
                      {r.data && <div className="text-[11px] text-muted-foreground/80">{fmtDataHora(r.data)}</div>}
                    </div>
                    <div className="hidden w-48 shrink-0 sm:block">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>{r.acertos}/{r.total} acertos</span><span className="font-medium tabular-nums">{pct}%</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div className="shrink-0 border-l pl-4 text-right">
                      <div className="text-2xl font-bold tabular-nums text-primary">{nota(r.pontuacao)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">pontos</div>
                    </div>
                  </div>
                )
              })}
              {ranking.length > visivel.length && (
                <p className="pt-1 text-center text-xs text-muted-foreground">Mostrando {visivel.length} de {ranking.length}. Aumente o “Até” para ver mais.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <CriteriosForm grupos={grupos} totalQuestoes={totalQuestoes} criterios={criterios} onChange={setCriterios} />
      )}
    </div>
  )
}

function Kpi({ icon, tint, rotulo, valor }: { icon: React.ReactNode; tint: string; rotulo: string; valor: string | number }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}>{icon}</span>
      <div>
        <div className="text-xs text-muted-foreground">{rotulo}</div>
        <div className="text-xl font-bold tabular-nums">{valor}</div>
      </div>
    </div>
  )
}

function Podio({ top, nota }: { top: (EntradaRanking & { pos: number })[]; nota: (n: number | null) => string }) {
  const by = (p: number) => top.find((t) => t.pos === p)
  const cols = [by(2), by(1), by(3)].filter(Boolean) as (EntradaRanking & { pos: number })[]
  const ped = (pos: number) => (pos === 1 ? 'h-20 from-amber-300 to-amber-500' : pos === 2 ? 'h-14 from-slate-300 to-slate-400' : 'h-10 from-orange-300 to-amber-700')
  return (
    <div className="flex items-end justify-center gap-4 rounded-2xl border bg-gradient-to-b from-amber-50/50 to-transparent p-4 pt-6 dark:from-amber-950/10 sm:gap-8">
      {cols.map((c) => {
        const pct = c.total ? Math.round((c.acertos / c.total) * 100) : 0
        return (
          <div key={c.estudanteId} className={`flex flex-col items-center text-center ${c.pos === 1 ? 'w-28 sm:w-44' : 'w-24 sm:w-36'}`}>
            <div className={c.pos === 1 ? 'scale-110' : ''}><Posicao pos={c.pos} /></div>
            <div className="mt-2 w-full truncate text-sm font-semibold" title={c.nome}>{c.nome}</div>
            {c.classificacao && <div className="mt-0.5"><BadgeClass texto={c.classificacao} /></div>}
            <div className="mt-1 text-xl font-bold tabular-nums text-primary">{nota(c.pontuacao)}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.acertos}/{c.total} · {pct}%</div>
            <div className={`mt-2 flex w-full items-start justify-center rounded-t-xl bg-gradient-to-b pt-1.5 text-sm font-bold text-white shadow-inner ${ped(c.pos)}`}>{c.pos}º</div>
          </div>
        )
      })}
    </div>
  )
}

function Posicao({ pos }: { pos: number }) {
  if (pos === 1) return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-sm"><Crown className="h-6 w-6" /></span>
  if (pos === 2) return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm"><Medal className="h-6 w-6" /></span>
  if (pos === 3) return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-300 to-amber-700 text-white shadow-sm"><Medal className="h-6 w-6" /></span>
  return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground tabular-nums">{pos}º</span>
}

function BadgeClass({ texto }: { texto: string }) {
  const passa = texto.toLowerCase() === 'passaporte'
  const rotulo = texto.charAt(0).toUpperCase() + texto.slice(1)
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${passa ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' : 'bg-muted text-muted-foreground'}`}>
      {passa && <Shield className="h-3 w-3" />}{rotulo}
    </span>
  )
}

function ChipCriterio({ ativo, tag, texto, icon }: { ativo: boolean; tag: string; texto: string; icon?: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 ${ativo ? 'text-foreground' : 'opacity-50'}`}>
      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${ativo ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`} />
      <span className="font-semibold">{tag}</span>·{icon}<span>{texto}</span>
    </span>
  )
}
