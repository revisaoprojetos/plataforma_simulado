'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, SlidersHorizontal, Eraser, Star, ChevronDown, ListChecks, FileText, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBancoNav } from '@/components/aluno/banco-questoes-client'

export type Opt = { id: string; nome: string }
export type AssuntoOpt = { id: string; nome: string; disciplina_id: string | null }

export type FiltrosParams = {
  tipo?: string; minhas?: string; disciplina?: string; assunto?: string
  banca?: string; ano?: string; dificuldade?: string; busca?: string; comentadas?: string; favoritas?: string
}

const DIFICULDADES = [{ v: 'facil', r: 'Fácil' }, { v: 'medio', r: 'Médio' }, { v: 'dificil', r: 'Difícil' }]
const MINHAS = [
  { v: '', r: 'Todas' }, { v: 'resolvidas', r: 'Resolvidas' }, { v: 'nao_resolvidas', r: 'Não resolvidas' },
  { v: 'acertei', r: 'Acertei' }, { v: 'errei', r: 'Errei' },
]

/**
 * Filtros do Banco de Questões num POP-UP: a página mostra só uma barra compacta (botão "Filtros" +
 * chips ativos + contagem). Aplicar navega dentro de uma transição (useBancoNav) → a área dos cards
 * mostra o overlay de carregamento (sem sensação de travamento).
 */
export function QuestoesFiltrosAluno({
  disciplinas, assuntos, bancas, anos, total, params,
}: {
  disciplinas: Opt[]; assuntos: AssuntoOpt[]; bancas: Opt[]; anos: number[]; total: number; params: FiltrosParams
}) {
  const { nav } = useBancoNav()
  const [aberto, setAberto] = useState(false)
  const [f, setF] = useState<FiltrosParams>({ ...params })
  const set = (k: keyof FiltrosParams, v: string) => setF((p) => ({ ...p, [k]: v || undefined }))
  const toggle = (k: keyof FiltrosParams) => setF((p) => ({ ...p, [k]: p[k] ? undefined : '1' }))

  // Ao (re)abrir, sincroniza o rascunho do modal com os filtros aplicados (URL).
  useEffect(() => { if (aberto) setF({ ...params }) }, [aberto, params])
  // Esc fecha.
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto])

  const assuntosDaDisc = useMemo(
    () => (f.disciplina ? assuntos.filter((a) => a.disciplina_id === f.disciplina) : assuntos),
    [assuntos, f.disciplina],
  )

  const urlDe = (merged: FiltrosParams) => {
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) if (v) usp.set(k, String(v))
    return `/aluno/questoes${usp.toString() ? `?${usp}` : ''}`
  }
  function aplicar(extra?: Partial<FiltrosParams>) { nav(urlDe({ ...f, ...extra })); setAberto(false) }
  function limpar() { setF({}); nav('/aluno/questoes'); setAberto(false) }
  function tirar(k: keyof FiltrosParams) { const nv = { ...f, [k]: undefined }; setF(nv); nav(urlDe(nv)) }

  const nomeDe = (arr: { id: string; nome: string }[], id?: string) => arr.find((x) => x.id === id)?.nome
  const chips: { k: keyof FiltrosParams; label: string }[] = []
  if (f.minhas) chips.push({ k: 'minhas', label: MINHAS.find((m) => m.v === f.minhas)?.r ?? f.minhas })
  if (f.disciplina) chips.push({ k: 'disciplina', label: `Disciplina: ${nomeDe(disciplinas, f.disciplina) ?? '—'}` })
  if (f.assunto) chips.push({ k: 'assunto', label: `Assunto: ${nomeDe(assuntos, f.assunto) ?? '—'}` })
  if (f.banca) chips.push({ k: 'banca', label: `Banca: ${nomeDe(bancas, f.banca) ?? '—'}` })
  if (f.ano) chips.push({ k: 'ano', label: `Ano: ${f.ano}` })
  if (f.dificuldade) chips.push({ k: 'dificuldade', label: DIFICULDADES.find((d) => d.v === f.dificuldade)?.r ?? f.dificuldade })
  if (f.comentadas) chips.push({ k: 'comentadas', label: 'Gabarito comentado' })
  if (f.favoritas) chips.push({ k: 'favoritas', label: 'Favoritas' })
  if (f.busca) chips.push({ k: 'busca', label: `"${f.busca}"` })
  const ativos = chips.length

  return (
    <>
      {/* Barra compacta: abrir filtros + chips ativos + contagem. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setAberto(true)}
            className="group inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-95 hover:shadow-md">
            <SlidersHorizontal className="h-4 w-4 transition-transform group-hover:rotate-90" /> Filtros
            {ativos > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground/25 px-1 text-[11px] font-bold tabular-nums leading-none">{ativos}</span>}
          </button>
          {chips.map((c) => (
            <button key={c.k} type="button" onClick={() => tirar(c.k)}
              className="group inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
              {c.label} <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
            </button>
          ))}
          {ativos > 0 && (
            <button type="button" onClick={limpar} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground">
              <Eraser className="h-3.5 w-3.5" /> Limpar tudo
            </button>
          )}
        </div>
        <p className="shrink-0 text-sm text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{total.toLocaleString('pt-BR')}</span> questões</p>
      </div>

      {/* POP-UP com todos os filtros. */}
      {aberto && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm duration-200 animate-in fade-in sm:items-center sm:p-4" onClick={() => setAberto(false)}>
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border bg-card shadow-2xl duration-200 animate-in slide-in-from-bottom-4 sm:rounded-3xl sm:zoom-in-95 sm:slide-in-from-bottom-0" onClick={(e) => e.stopPropagation()}>
            {/* Cabeçalho com faixa colorida */}
            <div className="relative shrink-0 border-b px-5 py-4">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><SlidersHorizontal className="h-5 w-5" /></span>
                  <div>
                    <h2 className="text-base font-bold leading-tight">Filtros</h2>
                    <p className="text-xs text-muted-foreground">Refine as questões do banco</p>
                  </div>
                </div>
                <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
            </div>

            {/* Corpo */}
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <Secao titulo="Minhas questões" icon={<ListChecks className="h-3.5 w-3.5" />}>
                <div className="flex flex-wrap gap-1.5">
                  {MINHAS.map((m) => {
                    const on = (f.minhas ?? '') === m.v
                    return (
                      <button key={m.v || 'todas'} type="button" onClick={() => set('minhas', m.v)}
                        className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                          on ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground')}>
                        {m.r}
                      </button>
                    )
                  })}
                </div>
              </Secao>

              <Secao titulo="Buscar no enunciado" icon={<Search className="h-3.5 w-3.5" />}>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={f.busca ?? ''} onChange={(e) => set('busca', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && aplicar()}
                    placeholder="Palavra-chave…" className="h-10 w-full rounded-xl border bg-background pl-9 pr-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary" />
                </div>
              </Secao>

              <Secao titulo="Categorias" icon={<SlidersHorizontal className="h-3.5 w-3.5" />}>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Campo label="Disciplina">
                    <select value={f.disciplina ?? ''} onChange={(e) => setF((p) => ({ ...p, disciplina: e.target.value || undefined, assunto: undefined }))} className={SEL}>
                      <option value="">Todas</option>
                      {disciplinas.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Assunto">
                    <select value={f.assunto ?? ''} onChange={(e) => set('assunto', e.target.value)} className={SEL}>
                      <option value="">Todos</option>
                      {assuntosDaDisc.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Banca">
                    <select value={f.banca ?? ''} onChange={(e) => set('banca', e.target.value)} className={SEL}>
                      <option value="">Todas</option>
                      {bancas.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Ano">
                    <select value={f.ano ?? ''} onChange={(e) => set('ano', e.target.value)} className={SEL}>
                      <option value="">Todos</option>
                      {anos.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Dificuldade" full>
                    <select value={f.dificuldade ?? ''} onChange={(e) => set('dificuldade', e.target.value)} className={SEL}>
                      <option value="">Todas</option>
                      {DIFICULDADES.map((d) => <option key={d.v} value={d.v}>{d.r}</option>)}
                    </select>
                  </Campo>
                </div>
              </Secao>

              <Secao titulo="Mais opções" icon={<Star className="h-3.5 w-3.5" />}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ToggleCard on={f.comentadas === '1'} onClick={() => toggle('comentadas')} icon={<FileText className="h-4 w-4" />} label="Gabarito comentado" desc="Com comentário do professor" />
                  <ToggleCard on={f.favoritas === '1'} onClick={() => toggle('favoritas')} icon={<Star className="h-4 w-4" />} label="Favoritas" desc="Só as que você favoritou" />
                </div>
              </Secao>
            </div>

            {/* Rodapé */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3.5">
              <button type="button" onClick={limpar} className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
                <Eraser className="h-4 w-4" /> Limpar
              </button>
              <button type="button" onClick={() => aplicar()} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-95 hover:shadow-md">
                <SlidersHorizontal className="h-4 w-4" /> Filtrar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

const SEL = 'h-10 w-full cursor-pointer appearance-none rounded-xl border bg-background px-3 pr-8 text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary'

/** Rótulo de seção do modal (label pequeno + ícone). */
function Secao({ titulo, icon, children }: { titulo: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{icon} {titulo}</span>
      {children}
    </div>
  )
}

/** Campo (select) com rótulo em cima + chevron. */
function Campo({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) {
  return (
    <label className={cn('block', full && 'sm:col-span-2')}>
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        {children}
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </label>
  )
}

/** Opção booleana como "card" clicável (com estado ligado). */
function ToggleCard({ on, onClick, icon, label, desc }: { on: boolean; onClick: () => void; icon: ReactNode; label: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition',
        on ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:border-foreground/20 hover:bg-muted/40')}>
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors', on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">{label}</span>
        <span className="block text-[11px] leading-tight text-muted-foreground">{desc}</span>
      </span>
      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3.5 w-3.5" />}</span>
    </button>
  )
}
