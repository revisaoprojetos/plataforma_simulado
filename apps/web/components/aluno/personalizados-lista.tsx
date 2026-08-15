'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wand2, Plus, Trash2, Loader2, FileQuestion, ChevronRight, Play } from 'lucide-react'
import { toast } from 'sonner'
import { confirmar } from '@/components/ui/confirm-dialog'
import { listarMeusSimulados, excluirMeuSimulado, type MeuSimuladoResumo } from '@/app/aluno/(portal)/simulados/builder-actions'

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
          {itens.map((s) => (
            <div key={s.id} className="group relative flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
              <button type="button" onClick={() => router.push(`/aluno/simulados/personalizados/${s.id}`)} className="absolute inset-0 z-0" aria-label={`Abrir ${s.titulo}`} />
              <div className="relative z-10 flex items-start justify-between gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Wand2 className="h-4 w-4" /></div>
                <button type="button" onClick={() => excluir(s)} title="Excluir"
                  className="pointer-events-auto relative z-10 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <h3 className="relative z-0 mt-3 line-clamp-2 text-sm font-semibold">{s.titulo}</h3>
              <div className="relative z-0 mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><FileQuestion className="h-3.5 w-3.5" /> {s.questoes} {s.questoes === 1 ? 'questão' : 'questões'}</span>
                {s.status === 'rascunho' && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-400">Rascunho</span>}
              </div>
              <div className="relative z-10 mt-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">Abrir <ChevronRight className="h-3.5 w-3.5" /></span>
                {s.questoes > 0 && (
                  <button type="button" onClick={() => router.push(`/aluno/simulados/personalizados/${s.id}/fazer`)}
                    className="pointer-events-auto inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90">
                    <Play className="h-3.5 w-3.5" /> Fazer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
