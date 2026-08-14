'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, GraduationCap, Timer, Eye, Check, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { SeletorQuestoes } from '@/components/aluno/seletor-questoes'
import { SeletorTempo, formatarTempo } from '@/components/aluno/seletor-tempo'
import { criarMeuSimuladoCompleto, type QuestaoDisponivel } from '@/app/aluno/(portal)/simulados/builder-actions'

type Modo = 'estudo' | 'prova' | 'revisao'
const TIPOS: { id: Modo; nome: string; desc: string; Icon: typeof GraduationCap }[] = [
  { id: 'estudo', nome: 'Estudo', desc: 'Vê o gabarito a cada questão', Icon: GraduationCap },
  { id: 'prova', nome: 'Prova', desc: 'Cronometrada, resultado no fim', Icon: Timer },
  { id: 'revisao', nome: 'Revisão', desc: 'Revisar no seu ritmo', Icon: Eye },
]
const PASSOS: { id: Etapa; nome: string }[] = [
  { id: 'config', nome: 'Configuração' }, { id: 'selecao', nome: 'Questões' }, { id: 'previa', nome: 'Prévia' },
]
type Etapa = 'config' | 'selecao' | 'previa'

/** Criador de simulado personalizado em 3 etapas: configuração → seleção de questões → prévia. */
export function PersonalizadoWizard() {
  const router = useRouter()
  const [etapa, setEtapa] = useState<Etapa>('config')
  const [nome, setNome] = useState('Meu simulado')
  const [modo, setModo] = useState<Modo>('estudo')
  const [tempoMin, setTempoMin] = useState(300) // base 5h
  const [escolhidas, setEscolhidas] = useState<QuestaoDisponivel[]>([])
  const [simuladoId, setSimuladoId] = useState<string | null>(null)

  const irSelecao = () => { if (!nome.trim()) { toast.error('Dê um nome ao simulado.'); return } setEtapa('selecao') }

  // Cria o simulado JÁ com a config e as questões (import em lote) — o "Importando…" é mostrado
  // pelo próprio SeletorQuestoes enquanto esta promessa resolve.
  const concluirSelecao = async (qs: QuestaoDisponivel[]) => {
    const r = await criarMeuSimuladoCompleto({ nome, modo, tempo: tempoMin || null, questaoIds: qs.map((q) => q.id) })
    if (r.error || !r.id) { toast.error(r.error ?? 'Não foi possível criar.'); return }
    setEscolhidas(qs); setSimuladoId(r.id); setEtapa('previa')
  }

  return (
    // Na etapa de seleção o wizard ocupa a altura da tela (dvh, adapta a aparelhos) para o card
    // de questões preencher até perto da barra inferior; nas outras etapas é fluxo normal.
    <div className={cn('flex flex-col gap-5', etapa === 'selecao' && 'h-[calc(100dvh-8.5rem)]')}>
      <div className="flex items-center gap-3">
        <Link href="/aluno/simulados" className="shrink-0 rounded-lg border p-2 text-muted-foreground transition-colors hover:text-foreground" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Criar simulado</h1>
      </div>

      {/* Indicador de etapas */}
      <nav className="flex items-center gap-2 text-sm">
        {PASSOS.map((p, i) => {
          const idx = PASSOS.findIndex((x) => x.id === etapa)
          const estado = i < idx ? 'feito' : i === idx ? 'atual' : 'futuro'
          return (
            <div key={p.id} className="flex items-center gap-2">
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                estado === 'atual' ? 'bg-primary text-primary-foreground' : estado === 'feito' ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground')}>
                {estado === 'feito' ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn(estado === 'futuro' ? 'text-muted-foreground' : 'font-medium text-foreground')}>{p.nome}</span>
              {i < PASSOS.length - 1 && <span className="mx-1 h-px w-5 bg-border sm:w-8" />}
            </div>
          )
        })}
      </nav>

      {etapa === 'config' && (
        <div className="space-y-5 rounded-2xl border bg-card p-4 sm:p-6">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nome do simulado</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Revisão de Constitucional"
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Tipo</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {TIPOS.map(({ id, nome: n, desc, Icon }) => (
                <button key={id} type="button" onClick={() => setModo(id)}
                  className={cn('flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition',
                    modo === id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-foreground/20 hover:bg-muted/40')}>
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', modo === id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}><Icon className="h-4 w-4" /></span>
                  <span className="text-sm font-semibold">{n}</span>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">Tempo</span>
            <SeletorTempo minutos={tempoMin} onChange={setTempoMin} />
            <p className="text-xs text-muted-foreground">Toque para ajustar as horas e minutos.</p>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={irSelecao} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Escolher questões</button>
          </div>
        </div>
      )}

      {etapa === 'selecao' && (
        // flex-1: preenche o espaço restante até o fim (com o respiro que o dvh do wizard deixa).
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card">
          <SeletorQuestoes onConcluir={concluirSelecao} onCancelar={() => setEtapa('config')} textoConcluir="Concluir" />
        </div>
      )}

      {etapa === 'previa' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
            <div>
              <h2 className="text-base font-bold tracking-tight">{nome}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5 capitalize">{TIPOS.find((t) => t.id === modo)?.nome}</span>
                <span>{formatarTempo(tempoMin)}</span>
                <span>{escolhidas.length} {escolhidas.length === 1 ? 'questão' : 'questões'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {simuladoId && <Link href={`/aluno/simulados/personalizados/${simuladoId}`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"><Pencil className="h-4 w-4" /> Editar</Link>}
              <button type="button" onClick={() => { toast.success('Simulado criado!'); router.push('/aluno/simulados') }} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">Concluir</button>
            </div>
          </div>
          <ol className="space-y-2">
            {escolhidas.map((q, i) => (
              <li key={q.id} className="flex items-start gap-3 rounded-xl border bg-card p-3 text-sm shadow-sm">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-foreground">{q.enunciado || '(sem enunciado)'}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {q.disciplina && <span className="rounded-full bg-muted px-2 py-0.5">{q.disciplina}</span>}
                    {q.ano && <span>{q.ano}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
