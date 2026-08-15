'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Play, Loader2, GraduationCap, Timer, Eye, ListChecks, Layers, BookOpen, Download, ListOrdered, Sparkles, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { formatarTempo } from '@/components/aluno/seletor-tempo'
import { PersonalizadoRunner } from '@/components/aluno/personalizado-runner'
import { abrirSessaoPessoal, type ResumoPessoal, type ModoPessoal, type SessaoPessoal } from '@/app/aluno/(portal)/simulados/runner-actions'

const MODO: Record<ModoPessoal, { nome: string; desc: string; Icon: typeof GraduationCap }> = {
  estudo: { nome: 'Estudo', desc: 'Gabarito a cada questão', Icon: GraduationCap },
  prova: { nome: 'Prova', desc: 'Cronometrada, resultado no fim', Icon: Timer },
  revisao: { nome: 'Revisão', desc: 'Ver gabarito no seu ritmo', Icon: Eye },
}
// Paleta de barras por matéria — a 1ª usa o ROXO DA MARCA (var(--brand-primary), vinculado à
// personalização do tenant); as demais são acentos distintos p/ diferenciar as matérias. Ciclam.
const CORES = ['var(--brand-primary)', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#84cc16']

/** Tela de INÍCIO (HUD animada) do simulado pessoal: mostra nome, nº de questões, quebra por
 *  matéria, estilo, ordenação e download do caderno. Ao Iniciar, abre a sessão e entra no runner. */
export function PersonalizadoStart({ resumo }: { resumo: ResumoPessoal }) {
  const router = useRouter()
  const [sessao, setSessao] = useState<SessaoPessoal | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [animar, setAnimar] = useState(false)

  useEffect(() => { const t = setTimeout(() => setAnimar(true), 60); return () => clearTimeout(t) }, [])

  const iniciar = async (reiniciar = false) => {
    setCarregando(true)
    const r = await abrirSessaoPessoal(resumo.simuladoId, reiniciar)
    if (r.error || !r.sessao) { toast.error(r.error ?? 'Não foi possível iniciar.'); setCarregando(false); return }
    setSessao(r.sessao)
  }
  const reiniciar = async () => {
    const ok = await confirmar({
      titulo: 'Reiniciar simulado',
      mensagem: 'Isso descarta a tentativa em andamento (respostas e tempo) e começa do zero. Não pode ser desfeito.',
      confirmar: 'Reiniciar', destrutivo: true,
    })
    if (ok) await iniciar(true)
  }

  if (sessao) return <PersonalizadoRunner sessao={sessao} onSair={() => setSessao(null)} />

  const { Icon } = MODO[resumo.modo]
  const max = Math.max(1, ...resumo.porDisciplina.map((d) => d.count))
  const ordenacao = resumo.temSecoes ? `${resumo.secoes.length} ${resumo.secoes.length === 1 ? 'seção' : 'seções'}` : 'Sequencial'
  const continuar = resumo.emAndamento && resumo.respondidas > 0
  // Utilitário de entrada animada (stagger) via tw-animate-css.
  const entra = (delayMs: number) => cn('duration-500 fill-mode-both', animar ? 'animate-in fade-in slide-in-from-bottom-4' : 'opacity-0')
  const delay = (ms: number) => ({ animationDelay: `${ms}ms` } as React.CSSProperties)

  const tiles = [
    { Icon: ListChecks, label: 'Questões', valor: String(resumo.total) },
    { Icon: Icon, label: 'Estilo', valor: MODO[resumo.modo].nome },
    { Icon: Timer, label: 'Tempo', valor: resumo.tempoLimiteMin ? formatarTempo(resumo.tempoLimiteMin) : 'Livre' },
    { Icon: ListOrdered, label: 'Ordenação', valor: ordenacao },
  ]

  return (
    // Tela cheia imersiva; --primary := --brand-primary (roxo forte do sistema, vinculado à personalização).
    <div className="fixed inset-0 z-50 overflow-y-auto bg-muted dark:bg-background" style={{ ['--primary' as any]: 'var(--brand-primary)' }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-3 py-5 sm:px-4">
      <button type="button" onClick={() => router.push('/aluno/simulados?aba=personalizados')}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      {/* HERO animado */}
      <div className={cn('relative overflow-hidden rounded-3xl border bg-card p-6 shadow-sm sm:p-8', entra(0))} style={delay(0)}>
        {/* brilho de fundo */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" style={{ animation: 'lu-halo 4s ease-in-out infinite' }} />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl" style={{ animation: 'lu-halo 5s ease-in-out infinite' }} />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Seu simulado
          </span>
          <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{resumo.titulo}</h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Icon className="h-4 w-4" /> Modo {MODO[resumo.modo].nome} · {MODO[resumo.modo].desc}
          </p>

          {/* Tiles de stats */}
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {tiles.map((t, i) => (
              <div key={t.label} className={cn('rounded-2xl border bg-background/60 p-3 backdrop-blur', entra(0))} style={delay(120 + i * 70)}>
                <t.Icon className="h-4 w-4 text-primary" />
                <div className="mt-1.5 truncate text-lg font-bold leading-none">{t.valor}</div>
                <div className="text-[11px] text-muted-foreground">{t.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quebra por matéria */}
      {resumo.porDisciplina.length > 0 && (
        <div className={cn('rounded-2xl border bg-card p-4 shadow-sm sm:p-5', entra(0))} style={delay(420)}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4 text-primary" /> Questões por matéria</h2>
          <div className="space-y-2.5">
            {resumo.porDisciplina.map((d, i) => (
              <div key={d.nome} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-foreground">{d.nome}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{d.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: animar ? `${Math.round((d.count / max) * 100)}%` : '0%', background: CORES[i % CORES.length], transitionDelay: `${500 + i * 80}ms` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seções (ordenação) */}
      {resumo.temSecoes && (
        <div className={cn('rounded-2xl border bg-card p-4 shadow-sm sm:p-5', entra(0))} style={delay(500)}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ListOrdered className="h-4 w-4 text-primary" /> Seções</h2>
          <div className="flex flex-wrap gap-2">
            {resumo.secoes.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">{i + 1}</span>
                {s.nome} <span className="text-muted-foreground">· {s.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ações */}
      <div className={cn('sticky bottom-2 z-10 flex flex-col gap-2 rounded-2xl border bg-card/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center', entra(0))} style={delay(560)}>
        <a href={`/aluno/simulados/personalizados/${resumo.simuladoId}/caderno`} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted">
          <Download className="h-4 w-4" /> Baixar caderno de questões
        </a>
        {/* Reiniciar — só quando há tentativa em andamento; abre confirmação */}
        {continuar && (
          <button type="button" onClick={reiniciar} disabled={carregando}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-70">
            <RotateCcw className="h-4 w-4" /> Reiniciar
          </button>
        )}
        <button type="button" onClick={() => iniciar()} disabled={carregando}
          className="group inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-95 hover:shadow-md disabled:opacity-70 sm:py-2.5">
          {carregando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 transition-transform group-hover:scale-110" />}
          {continuar ? `Continuar (${resumo.respondidas}/${resumo.total})` : 'Iniciar simulado'}
        </button>
      </div>
      {continuar && <p className="-mt-1 text-center text-xs text-muted-foreground">Você tem uma tentativa em andamento — vamos retomar de onde parou.</p>}
      </div>
    </div>
  )
}
