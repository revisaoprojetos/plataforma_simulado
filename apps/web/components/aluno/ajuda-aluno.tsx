'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  PlayCircle, ListChecks, Download, BarChart3, BookOpen, Flag,
  ChevronRight, ImageIcon, Lightbulb, ArrowUpRight, Play,
} from 'lucide-react'
import { TOURS_ALUNO } from '@/lib/ajuda/tours-aluno'
import { iniciarTourGuia } from '@/components/aluno/guia-tour-runner'

type Passo = { t: string; d: string; dica?: string }
type Guia = { id: string; titulo: string; resumo: string; icon: React.ComponentType<{ className?: string }>; link?: { href: string; label: string }; passos: Passo[] }

const GUIAS: Guia[] = [
  {
    id: 'iniciar', titulo: 'Como iniciar um simulado', resumo: 'Do menu até o cronômetro começar.', icon: PlayCircle, link: { href: '/aluno/simulado', label: 'Ir para Simulados' },
    passos: [
      { t: 'Abra "Simulados"', d: 'No menu à esquerda, toque em Simulados para ver o que está disponível para você.' },
      { t: 'Escolha o simulado', d: 'Clique no card do simulado. Você verá as regras: tempo, número de tentativas e questões.' },
      { t: 'Toque em "Iniciar"', d: 'Ao iniciar, o cronômetro começa. Você pode responder na ordem que quiser.', dica: 'Prefere ver antes? Alguns simulados deixam você baixar o caderno pelos 3 pontinhos do card.' },
    ],
  },
  {
    id: 'responder', titulo: 'Respondendo as questões', resumo: 'Marcar, cortar alternativas, revisar e enviar.', icon: ListChecks,
    passos: [
      { t: 'Marque a alternativa', d: 'Clique na letra (A–E) que você acha correta. Sua resposta é salva na hora — pode trocar quantas vezes quiser.' },
      { t: 'Use a tesoura', d: 'Corte as alternativas que já descartou para focar nas que sobraram.' },
      { t: 'Marque para revisar', d: 'Ficou em dúvida? Marque a questão e volte nela antes de enviar.' },
      { t: 'Revise e envie', d: 'Na tela de revisão você vê o que respondeu, o que ficou em branco e o que marcou. Aí é só enviar.', dica: 'Depois de enviar não dá para voltar — confira a revisão com calma.' },
    ],
  },
  {
    id: 'baixar', titulo: 'Baixar o caderno e materiais', resumo: 'Onde clicar para baixar em PDF.', icon: Download,
    passos: [
      { t: 'Abra o simulado ou o resultado', d: 'Entre no simulado (ou no seu resultado, se já finalizou).' },
      { t: 'Toque nos 3 pontos do card', d: 'No canto do card há um menu (⋮) com as opções: caderno de questões, gabarito e material.' },
      { t: 'Escolha o que baixar', d: 'O PDF é gerado e baixado. O caderno vem na sua ordem de questões.' },
    ],
  },
  {
    id: 'resultado', titulo: 'Ver resultado e desempenho', resumo: 'Sua nota, acertos por matéria e evolução.', icon: BarChart3, link: { href: '/aluno/desempenho', label: 'Abrir Meu Desempenho' },
    passos: [
      { t: 'Abra "Meu Desempenho"', d: 'Veja sua evolução, acertos por disciplina e a comparação com a turma.' },
      { t: 'Abra "Meus Simulados"', d: 'Cada simulado finalizado mostra sua nota e o gabarito (quando liberado).' },
    ],
  },
  {
    id: 'banco', titulo: 'Banco de questões e favoritos', resumo: 'Treine questões avulsas e organize seu estudo.', icon: BookOpen, link: { href: '/aluno/questoes', label: 'Abrir Banco de Questões' },
    passos: [
      { t: 'Banco de Questões', d: 'Resolva questões avulsas com filtros por matéria, banca, dificuldade e ano — quantas vezes quiser.' },
      { t: 'Favoritos', d: 'Salve questões importantes tocando na estrela para revê-las depois.' },
      { t: 'Cadernos', d: 'Monte cadernos de estudo com as questões que quer revisar.' },
    ],
  },
  {
    id: 'reportar', titulo: 'Reportar um erro numa questão', resumo: 'Achou um problema? Avise a equipe.', icon: Flag,
    passos: [
      { t: 'Abra a questão', d: 'Na questão, procure a opção "Reportar erro".' },
      { t: 'Descreva o problema', d: 'Escolha o motivo (gabarito, enunciado, desatualizada) e explique. A equipe recebe e te responde.' },
    ],
  },
]

export function AjudaAluno() {
  const [selId, setSelId] = useState<string>(GUIAS[0].id)
  const sel = GUIAS.find((g) => g.id === selId) ?? GUIAS[0]

  return (
    <div className="flex flex-col gap-6 lg:h-full lg:min-h-0 lg:flex-row">
      {/* Índice (barra lateral) — igual ao admin */}
      <nav className="lg:h-full lg:max-h-[calc(100vh-12rem)] lg:min-h-0 lg:w-[260px] lg:shrink-0 lg:overflow-y-auto lg:pr-1">
        <div className="space-y-1 rounded-2xl border bg-card p-3">
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Guias</p>
          {GUIAS.map((g) => (
            <button key={g.id} type="button" onClick={() => setSelId(g.id)}
              className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition',
                g.id === selId ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted')}>
              <g.icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{g.titulo}</span>
              {g.id === selId && <ChevronRight className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      </nav>

      {/* Conteúdo do guia — painel com rolagem própria */}
      <div key={sel.id} className="min-w-0 rounded-2xl border bg-muted/20 lg:h-full lg:max-h-[calc(100vh-12rem)] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <div className="p-3 sm:p-4">
          <article className="min-w-0 space-y-6">
            <header className="flex items-start gap-3 rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm"><sel.icon className="h-6 w-6" /></span>
              <div>
                <h2 className="text-xl font-bold tracking-tight">{sel.titulo}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{sel.resumo}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {TOURS_ALUNO[sel.id] && (
                    <button type="button" onClick={() => iniciarTourGuia(sel.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
                      <Play className="h-4 w-4 fill-current" /> Iniciar passo a passo
                    </button>
                  )}
                  {sel.link && (
                    <Link href={sel.link.href} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-muted">
                      {sel.link.label} <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            </header>

            <ol className="space-y-5">
              {sel.passos.map((p, i) => (
                <li key={i} className="relative rounded-2xl border bg-card p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold leading-snug">{p.t}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{p.d}</p>
                      {p.dica && (
                        <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" /> <span>{p.dica}</span>
                        </div>
                      )}
                      <Captura guia={sel.id} passo={i + 1} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </div>
    </div>
  )
}

/**
 * Captura de tela do passo, por convenção de nome: `public/ajuda/aluno-<guia>-<n>.png`.
 * Enquanto o arquivo não existe, mostra um placeholder com o nome exato a adicionar.
 */
function Captura({ guia, passo }: { guia: string; passo: number }) {
  const arquivo = `ajuda/aluno-${guia}-${passo}.png`
  const [erro, setErro] = useState(false)
  if (erro) {
    return (
      <div className="mt-3 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-8 text-center">
        <ImageIcon className="h-7 w-7 text-muted-foreground/60" />
        <p className="text-xs font-medium text-muted-foreground">Captura de tela deste passo</p>
        <p className="text-[11px] text-muted-foreground/70">Adicione o arquivo <code className="rounded bg-muted px-1 py-0.5">public/{arquivo}</code></p>
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/${arquivo}`} alt={`Passo ${passo}`} onError={() => setErro(true)} className="mt-3 w-full rounded-xl border shadow-sm" />
}
