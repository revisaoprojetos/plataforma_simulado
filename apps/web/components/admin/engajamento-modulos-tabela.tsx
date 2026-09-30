'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, BookOpen, HelpCircle, CheckCircle2, Layers, Trophy, Target, Flame } from 'lucide-react'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'
import type { EngajModuloBloco, EngajAulaFeita } from '@/app/admin/leitura/analise/_dados'

type Dir = 'asc' | 'desc'
type ColMod = 'modulo' | 'concluidas' | 'quizzes' | 'pontos' | 'ultima'
type ColAula = 'aula' | 'sequencia' | 'leitura' | 'quiz' | 'acertos'

const cmp = (a: number | string | null, b: number | string | null, dir: Dir) => {
  if (a == null && b == null) return 0
  if (a == null) return 1 // nulos sempre no fim
  if (b == null) return -1
  const r = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'pt-BR') : a < b ? -1 : a > b ? 1 : 0
  return dir === 'asc' ? r : -r
}

function SortHead({ label, ativa, dir, onClick, align = 'left', icon: Icon }: { label: string; ativa: boolean; dir: Dir; onClick: () => void; align?: 'left' | 'right' | 'center'; icon?: typeof Trophy }) {
  const Ico = ativa ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <button type="button" onClick={onClick} className={cn('inline-flex items-center gap-1 hover:text-foreground', align === 'right' && 'flex-row-reverse', ativa && 'text-foreground')}>
      {Icon && <Icon className="h-3 w-3" />} {label} <Ico className={cn('h-3 w-3', !ativa && 'opacity-40')} />
    </button>
  )
}

/** Tabela de módulos (externa) com recolhimento/expansão → tabela de aulas (interna); ambas ordenáveis. */
export function EngajamentoModulosTabela({ modulos, gamAtivo }: { modulos: EngajModuloBloco[]; gamAtivo: boolean }) {
  const [aberto, setAberto] = useState<Set<string>>(() => new Set(modulos.length === 1 ? [modulos[0].moduloId] : []))
  const [sortMod, setSortMod] = useState<{ col: ColMod; dir: Dir }>({ col: 'pontos', dir: 'desc' })
  const [sortAula, setSortAula] = useState<{ col: ColAula; dir: Dir }>({ col: 'aula', dir: 'asc' })

  const toggle = (id: string) => setAberto((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const setMod = (col: ColMod) => setSortMod((s) => ({ col, dir: s.col === col ? (s.dir === 'asc' ? 'desc' : 'asc') : col === 'modulo' ? 'asc' : 'desc' }))
  const setAula = (col: ColAula) => setSortAula((s) => ({ col, dir: s.col === col ? (s.dir === 'asc' ? 'desc' : 'asc') : col === 'aula' ? 'asc' : 'desc' }))

  const modsOrd = useMemo(() => {
    const val = (m: EngajModuloBloco): number | string | null => {
      switch (sortMod.col) {
        case 'modulo': return (m.moduloNome || '').toLowerCase()
        case 'concluidas': return m.aulasConcluidas
        case 'quizzes': return m.quizzesCompletos
        case 'pontos': return m.pontosTotal
        case 'ultima': return m.ultima
      }
    }
    return [...modulos].sort((a, b) => cmp(val(a), val(b), sortMod.dir) || a.moduloNome.localeCompare(b.moduloNome, 'pt-BR'))
  }, [modulos, sortMod])

  const ordenarAulas = (aulas: EngajAulaFeita[]) => {
    const val = (a: EngajAulaFeita): number | string | null => {
      switch (sortAula.col) {
        case 'aula': return a.ordem != null ? a.ordem : Number.MAX_SAFE_INTEGER
        case 'sequencia': return a.sequencia
        case 'leitura': return a.leituraEm
        case 'quiz': return a.qtot === 0 ? -1 : a.qans
        case 'acertos': return a.qtot === 0 ? -1 : a.qcorr
      }
    }
    return [...aulas].sort((x, y) => cmp(val(x), val(y), sortAula.dir) || (x.titulo || '').localeCompare(y.titulo || '', 'pt-BR'))
  }

  const potLabel = gamAtivo ? 'Pontuação' : 'Pontuação (acertos)'

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-10" />
          <col />
          <col className="w-40" />
          <col className="w-28" />
          <col className="w-32" />
          <col className="w-44" />
        </colgroup>
        <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-2 py-2.5" />
            <th className="px-4 py-2.5 text-left"><SortHead label="Módulo" ativa={sortMod.col === 'modulo'} dir={sortMod.dir} onClick={() => setMod('modulo')} icon={Layers} /></th>
            <th className="px-4 py-2.5 text-center"><SortHead label="Aulas concluídas" ativa={sortMod.col === 'concluidas'} dir={sortMod.dir} onClick={() => setMod('concluidas')} align="center" /></th>
            <th className="px-4 py-2.5 text-center"><SortHead label="Quizzes" ativa={sortMod.col === 'quizzes'} dir={sortMod.dir} onClick={() => setMod('quizzes')} align="center" /></th>
            <th className="px-4 py-2.5 text-center"><SortHead label={potLabel} ativa={sortMod.col === 'pontos'} dir={sortMod.dir} onClick={() => setMod('pontos')} align="center" icon={Trophy} /></th>
            <th className="px-4 py-2.5 text-left"><SortHead label="Última atividade" ativa={sortMod.col === 'ultima'} dir={sortMod.dir} onClick={() => setMod('ultima')} /></th>
          </tr>
        </thead>
        <tbody>
          {modsOrd.map((m) => {
            const open = aberto.has(m.moduloId)
            return (
              <Fragment key={m.moduloId}>
                <tr className="cursor-pointer border-t transition-colors hover:bg-muted/40" onClick={() => toggle(m.moduloId)}>
                  <td className="px-2 py-3 text-muted-foreground"><ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} /></td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 truncate font-semibold"><Layers className="h-4 w-4 shrink-0 text-primary" /> <span className="truncate">{m.moduloNome}</span></span>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums"><span className="text-emerald-600 dark:text-emerald-400">{m.aulasConcluidas}</span><span className="text-muted-foreground">/{m.aulasTotal}</span></td>
                  <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">{m.quizzesCompletos}</td>
                  <td className="px-4 py-3 text-center tabular-nums font-semibold text-primary">{m.pontosTotal.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-left text-xs text-muted-foreground">{m.ultima ? formatBrt(m.ultima) : '—'}</td>
                </tr>
                {open && (
                  <tr className="border-t bg-muted/15">
                    <td className="p-0" colSpan={6}>
                      <table className="w-full table-fixed text-sm">
                        <colgroup>
                          <col />
                          <col className="w-52" />
                          <col className="w-60" />
                          <col className="w-32" />
                          <col className="w-28" />
                        </colgroup>
                        <thead className="border-b bg-muted/25 text-[11px] uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="py-2 pl-12 pr-4 text-left"><SortHead label="Aula" ativa={sortAula.col === 'aula'} dir={sortAula.dir} onClick={() => setAula('aula')} /></th>
                            <th className="px-4 py-2 text-center"><SortHead label="Leitura" ativa={sortAula.col === 'leitura'} dir={sortAula.dir} onClick={() => setAula('leitura')} align="center" icon={BookOpen} /></th>
                            <th className="px-4 py-2 text-center"><SortHead label="Quiz" ativa={sortAula.col === 'quiz'} dir={sortAula.dir} onClick={() => setAula('quiz')} align="center" icon={HelpCircle} /></th>
                            <th className="px-4 py-2 text-center"><SortHead label="Sequência" ativa={sortAula.col === 'sequencia'} dir={sortAula.dir} onClick={() => setAula('sequencia')} align="center" icon={Flame} /></th>
                            <th className="py-2 pl-4 pr-8 text-center"><SortHead label="Acertos" ativa={sortAula.col === 'acertos'} dir={sortAula.dir} onClick={() => setAula('acertos')} align="center" icon={Target} /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {ordenarAulas(m.aulas).map((a) => (
                            <tr key={a.docId} className="border-t border-border/60">
                              <td className="py-2.5 pl-12 pr-4">
                                <span className="truncate font-medium">{a.ordem != null ? `${a.ordem}. ` : ''}{a.titulo}</span>
                                {a.concluida && <CheckCircle2 className="ml-1.5 inline h-3.5 w-3.5 align-[-2px] text-emerald-600 dark:text-emerald-400" />}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {a.leituraEm
                                  ? <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /><span className="text-xs text-muted-foreground">{formatBrt(a.leituraEm)}</span></span>
                                  : a.pct > 0
                                    ? <span className="text-xs text-amber-600 dark:text-amber-400">em andamento ({a.pct}%)</span>
                                    : <span className="text-xs text-muted-foreground">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {a.qtot === 0
                                  ? <span className="text-xs text-muted-foreground">sem quiz</span>
                                  : a.quizCompleto
                                    ? <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /><span className="text-xs text-muted-foreground">{a.qans}/{a.qtot}{a.quizUlt ? ` · ${formatBrt(a.quizUlt)}` : ''}</span></span>
                                    : a.qans > 0
                                      ? <span className="text-xs text-amber-600 dark:text-amber-400">{a.qans}/{a.qtot} respondidas</span>
                                      : <span className="text-xs text-muted-foreground">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {a.sequencia != null
                                  ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400"><Flame className="h-3 w-3" /> {a.sequencia}º dia</span>
                                  : <span className="text-xs text-muted-foreground">—</span>}
                              </td>
                              <td className="py-2.5 pl-4 pr-8 text-center tabular-nums">
                                {a.qtot === 0
                                  ? <span className="text-xs text-muted-foreground">—</span>
                                  : <span className={cn(a.gabaritada ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>{a.qcorr}/{a.qtot}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
