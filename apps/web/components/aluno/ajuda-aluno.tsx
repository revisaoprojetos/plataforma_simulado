'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  PlayCircle, ListChecks, Download, BarChart3, BookOpen, Flag, LifeBuoy,
  ChevronDown, Sparkles, MousePointerClick, Scissors, BookmarkCheck, Send, ImageIcon,
} from 'lucide-react'

type Passo = { t: string; d: string; icon?: React.ComponentType<{ className?: string }> }
type Guia = { id: string; titulo: string; resumo: string; icon: React.ComponentType<{ className?: string }>; tom: string; passos: Passo[] }

const GUIAS: Guia[] = [
  {
    id: 'iniciar', titulo: 'Como iniciar um simulado', resumo: 'Do menu até o cronômetro começar.',
    icon: PlayCircle, tom: 'text-emerald-500',
    passos: [
      { t: 'Abra "Simulados"', d: 'No menu à esquerda, toque em Simulados para ver o que está disponível para você.', icon: MousePointerClick },
      { t: 'Escolha o simulado', d: 'Clique no card do simulado. Você verá as regras: tempo, número de tentativas e questões.', icon: ClipboardIcon },
      { t: 'Toque em "Iniciar"', d: 'Ao iniciar, o cronômetro começa. Você pode responder na ordem que quiser.', icon: PlayCircle },
    ],
  },
  {
    id: 'responder', titulo: 'Respondendo as questões', resumo: 'Marcar, cortar alternativas, revisar e enviar.',
    icon: ListChecks, tom: 'text-sky-500',
    passos: [
      { t: 'Marque a alternativa', d: 'Clique na letra (A–E) que você acha correta. Sua resposta é salva na hora — pode trocar quantas vezes quiser.', icon: MousePointerClick },
      { t: 'Use a tesoura', d: 'Corte as alternativas que você já descartou para focar nas que sobraram.', icon: Scissors },
      { t: 'Marque para revisar', d: 'Ficou em dúvida? Marque a questão para revisar e volte nela antes de enviar.', icon: BookmarkCheck },
      { t: 'Revise e envie', d: 'Na tela de revisão você vê o que respondeu, o que ficou em branco e o que marcou. Aí é só enviar.', icon: Send },
    ],
  },
  {
    id: 'baixar', titulo: 'Baixar o caderno e materiais', resumo: 'Onde clicar para baixar em PDF.',
    icon: Download, tom: 'text-violet-500',
    passos: [
      { t: 'Abra o simulado ou resultado', d: 'Entre no simulado (ou no seu resultado, se já finalizou).', icon: ClipboardIcon },
      { t: 'Toque nos 3 pontos do card', d: 'No canto do card há um menu (⋮) com as opções de download: caderno de questões, gabarito e material.', icon: Download },
      { t: 'Escolha o que baixar', d: 'O PDF é gerado e baixado. O caderno vem na sua ordem de questões.', icon: Download },
    ],
  },
  {
    id: 'resultado', titulo: 'Ver resultado e desempenho', resumo: 'Sua nota, acertos por matéria e evolução.',
    icon: BarChart3, tom: 'text-amber-500',
    passos: [
      { t: 'Abra "Meu Desempenho"', d: 'Veja sua evolução, acertos por disciplina e comparação com a turma.', icon: BarChart3 },
      { t: 'Abra "Meus Simulados"', d: 'Cada simulado finalizado mostra sua nota e o gabarito (quando liberado).', icon: ClipboardIcon },
    ],
  },
  {
    id: 'banco', titulo: 'Banco de questões, favoritos e cadernos', resumo: 'Treine questões avulsas e organize seu estudo.',
    icon: BookOpen, tom: 'text-rose-500',
    passos: [
      { t: 'Banco de Questões', d: 'Resolva questões avulsas com filtros por matéria e assunto — quantas vezes quiser.', icon: BookOpen },
      { t: 'Favoritos', d: 'Salve questões importantes tocando na estrela para revê-las depois.', icon: BookmarkCheck },
      { t: 'Cadernos', d: 'Monte cadernos de estudo com as questões que você quer revisar.', icon: BookOpen },
    ],
  },
  {
    id: 'reportar', titulo: 'Reportar um erro numa questão', resumo: 'Achou um problema? Avise a equipe.',
    icon: Flag, tom: 'text-orange-500',
    passos: [
      { t: 'Abra a questão', d: 'Na questão, procure a opção "Reportar erro".', icon: Flag },
      { t: 'Descreva o problema', d: 'Escolha o motivo (gabarito, enunciado, desatualizada) e explique. A equipe recebe e te responde.', icon: Send },
    ],
  },
]

const KEYFRAMES = `
@keyframes ajudaUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
@keyframes ajudaFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
@keyframes ajudaGrow { from { opacity: 0; transform: translateY(6px) scale(.98) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) { .aj-anim { animation: none !important } }
`

function ClipboardIcon(props: { className?: string }) { return <ListChecks {...props} /> }

export function AjudaAluno() {
  const [aberto, setAberto] = useState<string | null>('iniciar')

  return (
    <div className="space-y-6">
      <style>{KEYFRAMES}</style>

      {/* Hero animado (lugar do futuro mascote) */}
      <div className="aj-anim overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm" style={{ animation: 'ajudaUp .5s ease' }}>
        <div className="flex items-center gap-4">
          <span className="aj-anim flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-inner" style={{ animation: 'ajudaFloat 4s ease-in-out infinite' }}>
            <LifeBuoy className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">Bem-vindo(a)! <Sparkles className="h-4 w-4 text-primary" /></h2>
            <p className="text-sm text-muted-foreground">Aqui você aprende, passo a passo, como usar a plataforma: iniciar simulados, responder, baixar materiais e acompanhar seu desempenho.</p>
          </div>
        </div>
      </div>

      {/* Trilha rápida (3 passos p/ começar) */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { n: 1, t: 'Abra Simulados', d: 'no menu à esquerda' },
          { n: 2, t: 'Escolha um', d: 'e veja as regras' },
          { n: 3, t: 'Toque em Iniciar', d: 'e boa prova!' },
        ].map((p, i) => (
          <div key={p.n} className="aj-anim flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm" style={{ animation: `ajudaGrow .45s ease both`, animationDelay: `${i * 90}ms` }}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{p.n}</span>
            <div className="min-w-0"><p className="text-sm font-semibold leading-tight">{p.t}</p><p className="text-xs text-muted-foreground">{p.d}</p></div>
          </div>
        ))}
      </div>

      {/* Guias (accordion animado) */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Guias completos</h3>
        {GUIAS.map((g, gi) => {
          const on = aberto === g.id
          return (
            <div key={g.id} className="aj-anim overflow-hidden rounded-2xl border bg-card shadow-sm" style={{ animation: 'ajudaGrow .45s ease both', animationDelay: `${gi * 60}ms` }}>
              <button type="button" onClick={() => setAberto(on ? null : g.id)}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40">
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted', g.tom)}><g.icon className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{g.titulo}</p>
                  <p className="truncate text-xs text-muted-foreground">{g.resumo}</p>
                </div>
                <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', on && 'rotate-180')} />
              </button>

              {on && (
                <div className="border-t p-4">
                  <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
                    {/* Passos numerados (staggered) */}
                    <ol className="space-y-3">
                      {g.passos.map((p, i) => {
                        const Icon = p.icon ?? g.icon
                        return (
                          <li key={i} className="aj-anim flex gap-3" style={{ animation: 'ajudaUp .4s ease both', animationDelay: `${i * 80}ms` }}>
                            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 text-sm font-medium"><Icon className="h-3.5 w-3.5 text-muted-foreground" /> {p.t}</p>
                              <p className="text-sm text-muted-foreground">{p.d}</p>
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                    {/* Captura ilustrativa (placeholder — trocaremos por prints reais) */}
                    <div className="aj-anim flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 p-4 text-center" style={{ animation: 'ajudaGrow .5s ease both', animationDelay: '120ms' }}>
                      <ImageIcon className="h-8 w-8 text-muted-foreground/60" />
                      <p className="text-xs text-muted-foreground">Captura de tela em breve</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">Ainda com dúvida? Fale com o suporte da sua plataforma. 💬</p>
    </div>
  )
}
