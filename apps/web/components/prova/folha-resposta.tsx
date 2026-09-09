'use client'

import { useState, type ReactNode, type CSSProperties } from 'react'
import { Send, Loader2, Clock, Moon, Sun, ListChecks, Lock, ImageIcon, Maximize2, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { MarkdownContent } from '@/components/markdown-content'
import { QuestaoDiscursivaEnvio } from '@/components/aluno/questao-discursiva-envio'

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

interface AltFolha { id: string; texto: string; ordem: number }
interface QuestaoFolha {
  id: string
  tipo?: string
  enunciado: string
  disciplina?: string | null
  imagem_url?: string | null
  bloqueada?: boolean
  aviso?: { nome: string; cor: string | null; funcao: string } | null
  etiquetas?: { nome: string; cor: string | null }[]
  alternativas: AltFolha[]
}

export interface FolhaRespostaProps {
  titulo: string
  logoUrl?: string | null
  logoBg?: string
  logoEstilo?: string
  questoes: QuestaoFolha[]
  respostas: Record<string, string>
  discPaginas: Record<string, number>
  onResponder: (questaoId: string, alternativaId: string) => void
  onFinalizar: () => void
  isFinalizando: boolean
  tempoLabel: string | null
  timerWarning: boolean
  mostrarTempo: boolean
  onToggleTempo: () => void
  dark: boolean
  onToggleDark: () => void
  fontControl: ReactNode
  provaVars: CSSProperties
  sessaoId: string
  onDiscCount: (questaoId: string, n: number) => void
}

/** "Respondida": objetiva = alternativa marcada; discursiva = ≥1 foto; bloqueada = conta como resolvida. */
function ehRespondida(q: QuestaoFolha, respostas: Record<string, string>, disc: Record<string, number>) {
  if (q.bloqueada) return true
  if (q.tipo === 'discursiva') return (disc[q.id] ?? 0) > 0
  return !!respostas[q.id]
}

/**
 * Folha de respostas estilo ENEM: uma tela só, com todas as questões em linhas de bolhas (A–E),
 * em colunas de 10. O aluno marca uma alternativa por questão e finaliza direto para o resultado.
 * O botão ⤢ de cada linha abre um pop-up (enunciado em cima, alternativas embaixo).
 */
export function FolhaResposta(p: FolhaRespostaProps) {
  const [expandidaId, setExpandidaId] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const total = p.questoes.length
  const respondidas = p.questoes.filter((q) => ehRespondida(q, p.respostas, p.discPaginas)).length
  const progresso = total > 0 ? (respondidas / total) * 100 : 0
  const expandida = p.questoes.find((q) => q.id === expandidaId) ?? null
  const idxExpandida = expandida ? p.questoes.findIndex((q) => q.id === expandida.id) : -1

  // Colunas de 10 questões (folha estilo ENEM): 5 colunas ocupando a largura toda no desktop.
  const colunas: QuestaoFolha[][] = []
  for (let i = 0; i < p.questoes.length; i += 10) colunas.push(p.questoes.slice(i, i + 10))

  return (
    <div style={p.provaVars} className="fixed inset-0 z-50 flex flex-col bg-muted text-foreground dark:bg-background">
      {/* Cabeçalho full-width */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-card/90 px-3 py-2.5 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {p.logoUrl ? (
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden', p.logoEstilo === 'quadrado' ? 'rounded-none' : 'rounded-lg', p.logoEstilo === 'borda' && 'border')} style={{ background: p.logoBg ?? '#ffffff' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.logoUrl} alt="" className="h-full w-full object-contain" />
            </span>
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-primary-foreground" style={{ background: 'var(--prova-marcada, var(--primary))' }}><ListChecks className="h-5 w-5" /></span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{p.titulo}</p>
            <p className="text-[11px] leading-tight text-muted-foreground">Folha de respostas · {respondidas}/{total} respondidas</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {p.tempoLabel && (
            <button onClick={p.onToggleTempo} title={p.mostrarTempo ? 'Ocultar tempo' : 'Mostrar tempo'}
              className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-sm font-semibold tabular-nums transition-colors', p.timerWarning ? 'border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'text-foreground hover:bg-muted')}>
              <Clock className="h-4 w-4" />
              {p.mostrarTempo ? p.tempoLabel : '••:••'}
            </button>
          )}
          {p.fontControl}
          <button onClick={p.onToggleDark} aria-label="Alternar tema" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            {p.dark ? <Sun className="h-[1.1rem] w-[1.1rem]" /> : <Moon className="h-[1.1rem] w-[1.1rem]" />}
          </button>
          <button onClick={() => setShowConfirm(true)} disabled={p.isFinalizando}
            className="ml-0.5 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-60"
            style={{ background: 'var(--prova-finalizar, var(--primary))' }}>
            <Send className="h-4 w-4" /> <span className="hidden sm:inline">Finalizar</span>
          </button>
        </div>
      </header>

      {/* Barra de progresso */}
      <div className="h-1 shrink-0 bg-muted">
        <div className="h-full transition-[width] duration-300" style={{ width: `${progresso}%`, background: 'var(--prova-marcada, var(--primary))' }} />
      </div>

      {/* Corpo — folha rolável */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-3 sm:p-6">
          <div className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground shadow-sm">
            <ListChecks className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--prova-marcada, var(--primary))' }} />
            <span>Marque a alternativa de cada questão. Toque em <Maximize2 className="mx-0.5 inline h-3.5 w-3.5" /> para ver o enunciado. Ao terminar, clique em <strong>Finalizar</strong> no topo.</span>
          </div>

          {/* Folha estilo ENEM: colunas de 10 questões. auto-fill encaixa quantas colunas couberem na
              largura (1 no celular → 3,4,5,6… conforme o monitor); o mínimo (17rem) garante a linha
              nº+bolhas+⤢ sem quebrar. O maxWidth = total de colunas existentes + mx-auto: quando cabem
              todas numa linha, o grid fica menor que a tela → CENTRALIZADO; quando não cabem, ocupa 100%
              e quebra alinhado à ESQUERDA. */}
          <div className="mx-auto grid w-full grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-2.5"
            style={{ maxWidth: `${colunas.length * 17 + (colunas.length - 1) * 0.625 + 0.5}rem` }}>
            {colunas.map((col, colIdx) => (
              <div key={colIdx} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                {col.map((q, j) => {
                  const gi = colIdx * 10 + j
                  const alts = [...q.alternativas].sort((a, b) => a.ordem - b.ordem)
                  const marcada = p.respostas[q.id]
                  const discEnviada = q.tipo === 'discursiva' && (p.discPaginas[q.id] ?? 0) > 0
                  return (
                    <div key={q.id} className="flex items-center gap-2 border-b py-2 pl-1.5 pr-2.5 last:border-0">
                      {/* Número da questão — à esquerda, com um respiro até as alternativas. */}
                      <span className="mr-2 w-7 shrink-0 text-right font-mono text-sm font-bold text-muted-foreground">{gi + 1}</span>

                      {q.bloqueada ? (
                        <span className="flex flex-1 items-center gap-1 text-[11px] font-medium text-muted-foreground"><Lock className="h-3.5 w-3.5" /> {q.aviso?.nome ?? 'Anulada'}</span>
                      ) : q.tipo === 'discursiva' ? (
                        <span className={cn('flex flex-1 items-center gap-1 text-[11px] font-medium', discEnviada ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                          <ImageIcon className="h-3.5 w-3.5" /> Discursiva{discEnviada ? ' · enviada' : ''}
                        </span>
                      ) : (
                        <div className="flex flex-1 flex-wrap items-center justify-center gap-1">
                          {alts.map((a, idx) => {
                            const sel = marcada === a.id
                            return (
                              <button key={a.id} type="button" onClick={() => p.onResponder(q.id, a.id)}
                                aria-label={`Questão ${gi + 1}, alternativa ${LETRA[idx] ?? idx + 1}`} aria-pressed={sel}
                                className={cn('flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition-all', sel ? 'border-transparent text-white shadow-sm' : 'border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-foreground')}
                                style={sel ? { background: 'var(--prova-marcada, var(--primary))' } : undefined}>
                                {LETRA[idx] ?? idx + 1}
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {/* Expandir — abre o pop-up com enunciado + alternativas. */}
                      <button type="button" onClick={() => setExpandidaId(q.id)} title={`Expandir questão ${gi + 1}`} aria-label={`Expandir questão ${gi + 1}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        <Maximize2 className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Barra inferior no mobile: Finalizar sempre acessível (no desktop o botão do topo já basta). */}
      <div className="shrink-0 border-t bg-card/95 p-3 backdrop-blur sm:hidden">
        <button onClick={() => setShowConfirm(true)} disabled={p.isFinalizando}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-60"
          style={{ background: 'var(--prova-finalizar, var(--primary))' }}>
          <Send className="h-4 w-4" /> Finalizar e ver resultado
        </button>
      </div>

      {/* Pop-up: expandir questão — ENUNCIADO em cima, ALTERNATIVAS embaixo (coluna única). */}
      <Dialog open={!!expandida} onOpenChange={(v) => !v && setExpandidaId(null)}>
        <DialogContent className="flex max-h-[92vh] w-[92vw] flex-col gap-0 overflow-hidden p-0 duration-300 ease-out data-open:slide-in-from-bottom-4 data-closed:slide-out-to-bottom-4 motion-reduce:duration-0 sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl" style={p.provaVars}>
          {expandida && (() => {
            const alts = [...expandida.alternativas].sort((a, b) => a.ordem - b.ordem)
            const marcadaIdx = alts.findIndex((a) => a.id === p.respostas[expandida.id])
            const marcadaLetra = marcadaIdx >= 0 ? (LETRA[marcadaIdx] ?? String(marcadaIdx + 1)) : null
            const objetiva = !expandida.bloqueada && expandida.tipo !== 'discursiva'
            const ring = { '--tw-ring-color': 'color-mix(in oklab, var(--prova-marcada, var(--primary)) 55%, transparent)' } as CSSProperties
            return (
              <>
                {/* Cabeçalho fixo */}
                <DialogHeader className="shrink-0 space-y-0 border-b bg-card p-4 pr-14 text-left">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 min-w-11 items-center justify-center rounded-xl px-2 font-mono text-lg font-bold text-white shadow-sm" style={{ background: 'var(--prova-marcada, var(--primary))' }}>{idxExpandida + 1}</span>
                    <div className="min-w-0">
                      <DialogTitle className="truncate text-base font-semibold leading-tight">{expandida.disciplina ?? 'Questão'}</DialogTitle>
                      <DialogDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs leading-none">
                        <span>Questão {idxExpandida + 1} de {total}</span>
                        {objetiva && (marcadaLetra
                          ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: 'var(--prova-marcada, var(--primary))' }}><CheckCircle2 className="h-3 w-3" /> Marcada: {marcadaLetra}</span>
                          : <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Sem resposta</span>)}
                      </DialogDescription>
                    </div>
                  </div>
                  {expandida.aviso && (
                    <p className="mt-3 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium" style={{ color: expandida.aviso.cor ?? undefined, borderColor: 'color-mix(in oklab, currentColor 40%, transparent)' }}><Lock className="h-3.5 w-3.5" /> {expandida.aviso.nome}</p>
                  )}
                  {expandida.etiquetas && expandida.etiquetas.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {expandida.etiquetas.map((e) => (
                        <span key={e.nome} className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${e.cor ?? '#64748b'}22`, color: e.cor ?? '#64748b' }}>{e.nome}</span>
                      ))}
                    </div>
                  )}
                </DialogHeader>

                {/* Corpo rolável — enunciado em cima, alternativas embaixo */}
                <div className="flex-1 overflow-y-auto">
                  {/* Enunciado */}
                  <section className="border-b p-5">
                    <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Enunciado</p>
                    <MarkdownContent className="text-[15px] leading-relaxed">{expandida.enunciado}</MarkdownContent>
                    {expandida.imagem_url && (
                      <div className="mt-4 overflow-hidden rounded-lg border bg-muted/30 p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={expandida.imagem_url} alt="Imagem da questão" className="mx-auto max-h-[50vh] w-auto object-contain" />
                      </div>
                    )}
                  </section>

                  {/* Alternativas / discursiva / bloqueada */}
                  <section className="p-5">
                    {expandida.bloqueada ? (
                      <p className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground"><Lock className="h-4 w-4" /> {expandida.aviso?.nome ?? 'Questão anulada'} — não é necessário responder.</p>
                    ) : expandida.tipo === 'discursiva' ? (
                      <QuestaoDiscursivaEnvio key={expandida.id} sessaoId={p.sessaoId} questaoId={expandida.id} bloqueada={false} onCount={(n) => p.onDiscCount(expandida.id, n)} />
                    ) : (
                      <>
                        <div className="mb-2.5 flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Alternativas</p>
                          {marcadaLetra && <span className="text-[11px] font-medium text-muted-foreground">toque de novo p/ desmarcar</span>}
                        </div>
                        <div className="space-y-2.5">
                          {alts.map((a, idx) => {
                            const sel = p.respostas[expandida.id] === a.id
                            return (
                              <button key={a.id} type="button" onClick={() => p.onResponder(expandida.id, a.id)} aria-pressed={sel}
                                className={cn('group/alt flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none', sel ? 'shadow-sm' : 'hover:border-primary/40 hover:bg-muted/50')}
                                style={sel ? { ...ring, borderColor: 'var(--prova-marcada, var(--primary))', background: 'color-mix(in oklab, var(--prova-marcada, var(--primary)) 8%, transparent)' } : ring}>
                                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors', sel ? 'border-transparent text-white' : 'border-muted-foreground/30 text-muted-foreground group-hover/alt:border-primary/50 group-hover/alt:text-foreground')}
                                  style={sel ? { background: 'var(--prova-marcada, var(--primary))' } : undefined}>{LETRA[idx] ?? idx + 1}</span>
                                <MarkdownContent inline className="min-w-0 flex-1 break-words pt-1 text-[15px] leading-relaxed">{a.texto}</MarkdownContent>
                                {sel && <CheckCircle2 className="mt-1 h-5 w-5 shrink-0" style={{ color: 'var(--prova-marcada, var(--primary))' }} />}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </section>
                </div>

                {/* Rodapé fixo: navegação entre questões. mx-0/mb-0 anulam as margens negativas do
                    DialogFooter base (-mx-4 -mb-4), que com p-0 no content estouravam a borda e cortavam os botões. */}
                <DialogFooter className="mx-0 mb-0 shrink-0 flex-row items-center justify-between gap-2 rounded-none border-t bg-muted/40 p-3 sm:justify-between">
                  <Button variant="outline" size="sm" onClick={() => setExpandidaId(idxExpandida > 0 ? p.questoes[idxExpandida - 1].id : expandida.id)} disabled={idxExpandida <= 0}>
                    <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
                  </Button>
                  <span className="hidden text-xs font-medium text-muted-foreground sm:block">{idxExpandida + 1} / {total}</span>
                  {idxExpandida < total - 1
                    ? <Button size="sm" onClick={() => setExpandidaId(p.questoes[idxExpandida + 1].id)} style={{ background: 'var(--prova-marcada, var(--primary))', color: '#fff' }}>Próxima <ChevronRight className="ml-1 h-4 w-4" /></Button>
                    : <Button size="sm" onClick={() => setExpandidaId(null)} style={{ background: 'var(--prova-marcada, var(--primary))', color: '#fff' }}>Concluir</Button>}
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Pop-up: confirmar envio */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent style={p.provaVars}>
          <DialogHeader>
            <DialogTitle>Finalizar folha de respostas</DialogTitle>
            <DialogDescription>
              Você marcou <strong>{respondidas}</strong> de <strong>{total}</strong> questões.
              {respondidas < total && (
                <span className="mt-1 block text-amber-600 dark:text-amber-400">Ainda há {total - respondidas} em branco.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Após finalizar, não será possível alterar as respostas. Você irá direto para o resultado.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={p.isFinalizando}>Voltar</Button>
            <Button onClick={() => { setShowConfirm(false); p.onFinalizar() }} disabled={p.isFinalizando} style={{ background: 'var(--prova-finalizar, var(--primary))', color: '#fff' }}>
              {p.isFinalizando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</> : 'Finalizar e ver resultado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
