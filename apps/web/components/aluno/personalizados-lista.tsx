'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wand2, Plus, Trash2, Loader2, FileQuestion, Play, BarChart3, RotateCcw, Pencil, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { listarMeusSimulados, excluirMeuSimulado, type MeuSimuladoResumo } from '@/app/aluno/(portal)/simulados/builder-actions'

// Nota (0–100) → tom + formatação (mesma régua dos cards oficiais).
const notaTone = (n: number) => (n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
const fmtNota = (n: number | null) => (n == null ? '—' : Number(n).toFixed(1).replace('.', ','))

/**
 * Card de um simulado personalizado. Design "pôster" enxuto: fita roxa da marca (igual à área do
 * simulado), ícone, título + nº de questões, banda de ESTADO (nota/tentativas quando concluído) e
 * ações conforme o estado — com acesso ao RESULTADO, como nos simulados oficiais.
 */
function CardPersonalizado({ s, onExcluir }: { s: MeuSimuladoResumo; onExcluir: () => void }) {
  const router = useRouter()
  const concluido = s.tentativas > 0
  const vazio = s.questoes === 0
  const irEditor = () => router.push(`/aluno/simulados/personalizados/${s.id}`)
  const irFazer = () => router.push(`/aluno/simulados/personalizados/${s.id}/fazer`)
  const irResultado = () => router.push(`/aluno/simulados/personalizados/${s.id}/resultado`)

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      {/* Fita roxa da marca (mesma da área do simulado). */}
      <div className="h-1.5 shrink-0 bg-gradient-to-r from-primary via-primary to-primary/30" />
      <div className="flex flex-1 flex-col p-4">
        {/* Topo: ícone + título (abre o editor) + excluir. */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wand2 className="h-5 w-5" />
          </div>
          <button type="button" onClick={irEditor} className="min-w-0 flex-1 text-left">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug transition-colors group-hover:text-primary">{s.titulo}</h3>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <FileQuestion className="h-3.5 w-3.5" /> {s.questoes} {s.questoes === 1 ? 'questão' : 'questões'}
            </p>
          </button>
          <button type="button" onClick={onExcluir} title="Excluir"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Banda de estado: concluído (nota + tentativas) · em andamento · sem questões · pronto. */}
        <div className="mt-3">
          {concluido ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border bg-muted/40 px-3 py-2">
              <div className="flex items-baseline gap-1.5">
                <span className={cn('text-xl font-bold tabular-nums', s.melhorNota != null && notaTone(s.melhorNota))}>{fmtNota(s.melhorNota)}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">melhor nota</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Repeat className="h-3 w-3" /> {s.tentativas} {s.tentativas === 1 ? 'tentativa' : 'tentativas'}
              </span>
            </div>
          ) : s.emAndamento ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-600 dark:text-sky-400">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Em andamento
            </span>
          ) : vazio ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              Sem questões — edite para adicionar
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Pronto para fazer</span>
          )}
        </div>

        {/* Ações — variam pelo estado; "Ver resultado" dá o acesso às notas (como nos oficiais). */}
        <div className="mt-auto flex items-center gap-2 pt-4">
          {concluido ? (
            <>
              <button type="button" onClick={irResultado}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
                <BarChart3 className="h-4 w-4" /> Ver resultado
              </button>
              <button type="button" onClick={irFazer} title="Refazer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
                <RotateCcw className="h-4 w-4" /> <span className="hidden sm:inline">Refazer</span>
              </button>
            </>
          ) : !vazio ? (
            <>
              <button type="button" onClick={irFazer}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
                <Play className="h-4 w-4" /> {s.emAndamento ? 'Continuar' : 'Fazer'}
              </button>
              <button type="button" onClick={irEditor} title="Editar"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
                <Pencil className="h-4 w-4" /> <span className="hidden sm:inline">Editar</span>
              </button>
            </>
          ) : (
            <button type="button" onClick={irEditor}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
              <Pencil className="h-4 w-4" /> Editar simulado
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Aba "Personalizados": lista os simulados criados pelo próprio aluno + criar/abrir/excluir. */
export function PersonalizadosLista() {
  const router = useRouter()
  const [itens, setItens] = useState<MeuSimuladoResumo[] | null>(null)

  const carregar = () => listarMeusSimulados().then(setItens).catch(() => setItens([]))
  useEffect(() => { carregar() }, [])

  // Abre o criador em etapas (configuração → questões → prévia).
  const criar = () => router.push('/aluno/simulados/personalizados/novo')

  const excluir = async (s: MeuSimuladoResumo) => {
    const ok = await confirmar({ titulo: 'Excluir simulado', mensagem: `Excluir "${s.titulo}"? Isso não pode ser desfeito.`, confirmar: 'Excluir', destrutivo: true })
    if (!ok) return
    const r = await excluirMeuSimulado(s.id)
    if (r.error) { toast.error(r.error); return }
    toast.success('Simulado excluído.')
    setItens((prev) => (prev ?? []).filter((x) => x.id !== s.id))
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Wand2 className="h-4 w-4 text-primary" /> Seus simulados
          {itens && <span className="text-xs font-normal text-muted-foreground">({itens.length})</span>}
        </h2>
        <button type="button" onClick={criar}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
          <Plus className="h-4 w-4" /> Criar simulado
        </button>
      </div>

      {itens == null ? (
        <div className="flex items-center gap-2 rounded-2xl border bg-muted/30 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando seus simulados…
        </div>
      ) : itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <Wand2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <h3 className="text-base font-semibold">Monte seu primeiro simulado</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Escolha as questões que quiser (dos simulados que você tem acesso), organize e depois faça — no seu ritmo.
          </p>
          <button type="button" onClick={criar}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Criar simulado
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {itens.map((s) => <CardPersonalizado key={s.id} s={s} onExcluir={() => excluir(s)} />)}
        </div>
      )}
    </section>
  )
}
