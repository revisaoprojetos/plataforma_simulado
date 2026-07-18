'use client'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, Clock, BookOpen, Send, Loader2, Flag, Eye, EyeOff, Scissors } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FitaTopo, FITA_GRADIENT } from '@/components/prova/fita-topo'
import { ThemeToggle } from '@/components/prova/theme-toggle'

const LETRA = ['A', 'B', 'C', 'D', 'E']

// Indicadores do navegador (recoloridos via CSS vars do tema do caderno) — cores sólidas.
const PRIM = 'var(--primary)'
const MARCADA = 'var(--prova-marcada, var(--primary))'
const REVISAR = 'var(--prova-revisar, #f59e0b)'
const CARD = 'var(--card)'
const TOPTX = 'var(--prova-topbar-texto, var(--foreground))'
const TIMER = 'var(--prova-timer, var(--foreground))'
const TIMER_BG = 'var(--prova-timer-fundo, var(--muted))' // fundo da pílula do cronômetro (normal)
const TIMER_FIM = 'var(--destructive)' // cor "Alerta (tempo acabando)"
const SEL = 'var(--prova-selecionada, var(--primary))' // alternativa marcada
const FINALIZAR = 'var(--prova-finalizar, var(--primary))' // botão Finalizar

function frameLogo(estilo?: string): string {
  if (estilo === 'quadrado') return 'rounded-none'
  if (estilo === 'borda') return 'rounded-lg border'
  return 'rounded-lg'
}

export type ProvaHudAlternativa = { id: string; texto: string }
export type ProvaHudQuestao = { id: string; tipo?: string; enunciado: string; alternativas: ProvaHudAlternativa[] }

export interface ProvaHudProps {
  titulo: string
  questaoIndex: number
  totalQuestoes: number
  totalRespondidas: number
  salvando: boolean
  tempoLabel: string | null
  timerWarning: boolean
  progresso: number
  questaoAtual: ProvaHudQuestao
  respostaId?: string
  respondidas: boolean[]
  onResponder: (altId: string) => void
  /** tesoura: eliminar/reativar alternativas da questão atual (ids). Opcional. */
  eliminadas?: string[]
  onToggleEliminar?: (altId: string) => void
  onGoto: (i: number) => void
  onPrev: () => void
  onNext: () => void
  onRevisar: () => void
  isFinalizando?: boolean
  /** marcar questões p/ revisar (Flag) — opcional; sem isso o recurso some. */
  marcadas?: boolean[]
  marcadaAtual?: boolean
  numMarcadas?: number
  onToggleMarcar?: () => void
  /** ocultar tempo (olho) — opcional. */
  mostrarTempo?: boolean
  onToggleTempo?: () => void
  /** estados de re-correção — só aparecem no navegador/legenda se houver algum. */
  anuladas?: boolean[]
  altTrocadas?: boolean[]
  /** branding do header (logo + nome) — segue a configuração do sistema (tenant). */
  logoUrl?: string | null
  logoBg?: string
  logoEstilo?: string
  /** compact = dentro de um preview (sem min-h-screen / header não-sticky). */
  compact?: boolean
  /** tema claro/escuro — mostra o sol/lua na top bar. */
  dark?: boolean
  onToggleDark?: () => void
}

/** HUD do simulado em andamento — usado pela prova real E pelo preview do caderno (idênticos). */
export function ProvaHud(p: ProvaHudProps) {
  const { questaoAtual: q, compact } = p
  const isLast = p.questaoIndex === p.totalQuestoes - 1
  const mostrarTempo = p.mostrarTempo ?? true
  const podeMarcar = !!p.onToggleMarcar
  const branco = p.totalQuestoes - p.totalRespondidas

  return (
    <div className={cn('flex flex-col bg-background text-foreground', compact ? 'h-full' : 'min-h-screen')}>
      {/* Header — barra superior com cor própria (distinta do fundo) */}
      <header className={cn('z-50 border-b backdrop-blur', !compact && 'sticky top-0')} style={{ background: 'var(--prova-topbar, var(--background))' }}>
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <div className="flex flex-1 items-center gap-2" style={{ color: TOPTX }}>
            {p.logoUrl ? (
              <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden', frameLogo(p.logoEstilo))} style={{ background: p.logoBg ?? '#ffffff' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.logoUrl} alt="" className="h-full w-full object-contain" />
              </span>
            ) : (
              <BookOpen className="h-5 w-5 shrink-0 opacity-70" />
            )}
            <span className="truncate text-sm font-semibold">{p.titulo}</span>
          </div>

          <div className="flex-1 text-center text-sm font-medium" style={{ color: TOPTX }}>Questão {p.questaoIndex + 1} de {p.totalQuestoes}</div>

          <div className="flex flex-1 items-center justify-end gap-2">
            {p.salvando && <span className="hidden text-xs opacity-70 sm:inline" style={{ color: TOPTX }}><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Salvando...</span>}
            {p.tempoLabel !== null && (
              <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-sm font-medium"
                style={p.timerWarning && mostrarTempo
                  ? { background: `color-mix(in oklab, ${TIMER_FIM} 15%, var(--background))`, color: TIMER_FIM }
                  : { background: TIMER_BG, color: TIMER }}>
                <Clock className={cn('h-4 w-4', p.timerWarning && mostrarTempo && 'animate-pulse')} />
                <span className="tabular-nums">{mostrarTempo ? p.tempoLabel : '--:--'}</span>
                {p.onToggleTempo && (
                  <button type="button" onClick={p.onToggleTempo} title={mostrarTempo ? 'Ocultar tempo' : 'Mostrar tempo'} className="ml-0.5 opacity-70 transition-opacity hover:opacity-100">
                    {mostrarTempo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            )}
            {p.onToggleDark && <ThemeToggle dark={!!p.dark} onToggle={p.onToggleDark} />}
            <Button size="sm" onClick={p.onRevisar} disabled={p.isFinalizando} style={{ background: FINALIZAR, color: '#fff' }}><Send className="mr-1.5 h-3.5 w-3.5" />Finalizar</Button>
          </div>
        </div>
        <Progress value={p.progresso} className="h-1 rounded-none" />
      </header>

      {/* Conteúdo */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_14rem] lg:gap-10">
          {/* Coluna da questão */}
          <div className="flex flex-col gap-6">
            <Card className="relative overflow-hidden">
              {/* fita "encaixa" após o número: número no canto + fita seguindo até o fim */}
              <div className="absolute inset-x-0 top-0 z-10 flex items-start">
                <span className="rounded-br-lg border-b border-r bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{p.questaoIndex + 1} / {p.totalQuestoes}</span>
                <div className="h-1.5 flex-1" style={{ background: FITA_GRADIENT }} />
              </div>
              <CardContent className="pt-10"><p className="leading-relaxed">{q.enunciado}</p></CardContent>
            </Card>

            <div className="space-y-2">
              {q.alternativas.map((alt, i) => {
                const eliminada = !!p.eliminadas?.includes(alt.id)
                const isSelected = p.respostaId === alt.id && !eliminada
                const podeCortar = !!p.onToggleEliminar
                return (
                  <div key={alt.id} className="flex items-center gap-2">
                    {podeCortar && (
                      <button type="button" onClick={() => p.onToggleEliminar?.(alt.id)}
                        title={eliminada ? 'Reativar alternativa' : 'Eliminar alternativa'}
                        className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors',
                          !eliminada && 'border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground')}
                        style={eliminada ? { borderColor: SEL, color: SEL, background: `color-mix(in oklab, ${SEL} 10%, var(--card))` } : undefined}>
                        <Scissors className="h-4 w-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => (eliminada ? p.onToggleEliminar?.(alt.id) : p.onResponder(alt.id))}
                      className={cn('flex-1 rounded-lg border p-4 text-left transition-all',
                        eliminada ? 'border-border bg-[var(--prova-alt-fundo,var(--card))] opacity-50'
                          : isSelected ? ''
                          : 'border-border bg-[var(--prova-alt-fundo,var(--card))] hover:border-primary/50 hover:bg-[var(--prova-alt-hover,var(--muted))]')}
                      style={isSelected ? { borderColor: SEL, background: `color-mix(in oklab, ${SEL} 12%, var(--card))` } : undefined}>
                      <div className="flex items-start gap-3">
                        <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold', !isSelected && 'border-muted-foreground/30 text-muted-foreground')}
                          style={isSelected ? { background: SEL, borderColor: SEL, color: '#fff' } : undefined}>
                          {LETRA[i] ?? i + 1}
                        </span>
                        <span className={cn('text-sm leading-relaxed', isSelected && 'font-medium', eliminada && 'text-muted-foreground line-through')}>{alt.texto}</span>
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={p.onPrev} disabled={p.questaoIndex === 0} style={{ background: CARD }}><ChevronLeft className="mr-1 h-4 w-4" />Voltar</Button>
              {podeMarcar && (
                <Button variant={p.marcadaAtual ? 'default' : 'outline'} onClick={p.onToggleMarcar}
                  style={p.marcadaAtual ? { background: REVISAR, color: '#fff' } : { background: CARD }}>
                  <Flag className="mr-1 h-4 w-4" />Revisar
                </Button>
              )}
              <Button variant={isLast ? 'default' : 'outline'} onClick={() => (isLast ? p.onRevisar() : p.onNext())}
                style={isLast ? { background: FINALIZAR, color: '#fff' } : { background: CARD }}>
                {isLast ? <><Send className="mr-1 h-4 w-4" />Finalizar</> : <>Próxima<ChevronRight className="ml-1 h-4 w-4" /></>}
              </Button>
            </div>
          </div>

          {/* Navegador de questões — card lateral direito */}
          <aside>
            <Card className="relative overflow-hidden pb-2 pt-3 lg:sticky lg:top-20">
              <FitaTopo />
              <CardContent className="px-4 pb-0 pt-0">
                <p className="text-center text-sm font-semibold">Navegador de questões</p>
                <div className="mt-2 mb-3 border-t" />
                {/* Rolável: com muitas questões (ex.: 100) o navegador não estica a página. */}
                <div className="grid max-h-[46vh] grid-cols-5 gap-1.5 overflow-y-auto px-1.5 py-1 [scrollbar-width:thin]">
                  {p.respondidas.map((respondida, i) => {
                    const atual = i === p.questaoIndex
                    const marcada = !!p.marcadas?.[i]
                    let st: React.CSSProperties | undefined
                    let cls = 'bg-muted text-muted-foreground hover:bg-muted/80'
                    // Anulada/alterada só são analisadas depois da prova — aqui não colorem.
                    if (respondida) { cls = 'text-white'; st = { background: MARCADA } }
                    // atual = preenchimento sólido + halo com a cor do texto (destaca dos respondidos)
                    if (atual) { cls = 'bg-primary text-primary-foreground'; st = { boxShadow: '0 0 0 2px var(--background), 0 0 0 4px var(--foreground)' } }
                    return (
                      <button key={i} onClick={() => p.onGoto(i)} title={`Questão ${i + 1}${marcada ? ' • marcada p/ revisar' : ''}`}
                        className={cn('relative flex aspect-square items-center justify-center rounded-md text-xs font-bold transition-colors', cls)}
                        style={st}>
                        {i + 1}
                        {marcada && <Flag className="absolute -right-1 -top-1 h-3 w-3 rounded-full p-0.5 text-white" style={{ background: REVISAR }} />}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-4 space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: PRIM, boxShadow: '0 0 0 1.5px var(--foreground)' }} /> Questão atual</div>
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: MARCADA }} /> Marcadas ({p.totalRespondidas})</div>
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-muted" /> Em branco ({branco})</div>
                  {podeMarcar && <div className="flex items-center gap-2"><Flag className="h-3 w-3" style={{ color: REVISAR }} /> Para revisar ({p.numMarcadas ?? 0})</div>}
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  )
}
