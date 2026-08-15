'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Wand2, Plus, Trash2, Loader2, FileQuestion, Play, BarChart3, Pencil, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { listarMeusSimulados, excluirMeuSimulado, type MeuSimuladoResumo } from '@/app/aluno/(portal)/simulados/builder-actions'

// Nota (0–100) → tom (mesma régua dos cards oficiais).
const notaTone = (n: number) => (n >= 70 ? 'text-emerald-400' : n >= 50 ? 'text-amber-400' : 'text-rose-400')
const fmtNota = (n: number | null) => (n == null ? '—' : Number(n).toFixed(1).replace('.', ','))
const COR = '#6d28d9' // roxo da marca (default dos pôsteres, igual ao card oficial sem capa)

/**
 * Card "pôster" de um simulado personalizado — MESMO modelo dos cards do "Simulado Revisão"
 * (CardConcluido): aspect-[4/5], degradê da marca, ícone marca-d'água, badge de nota no canto,
 * chip de estado + título embaixo. Clicar no card faz a ação principal (concluído → resultado);
 * uma pill secundária (Refazer/Editar) fica no rodapé, e excluir aparece no hover.
 */
function CardPersonalizado({ s, onExcluir }: { s: MeuSimuladoResumo; onExcluir: () => void }) {
  const concluido = s.tentativas > 0
  const vazio = s.questoes === 0
  // Destino do clique no card (área principal), como nos oficiais (card → resultado).
  const hrefPrincipal = concluido
    ? `/aluno/simulados/personalizados/${s.id}/resultado`
    : vazio
      ? `/aluno/simulados/personalizados/${s.id}`
      : `/aluno/simulados/personalizados/${s.id}/fazer`
  const estadoLabel = concluido ? 'Concluído' : s.emAndamento ? 'Em andamento' : 'Rascunho'

  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-white/25">
      {/* Fundo: degradê da marca + ícone marca-d'água (sem capa, igual ao oficial). */}
      <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${COR} 0%, #0f172a 135%)` }} />
      <Wand2 className="absolute -right-6 -top-6 h-40 w-40 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 opacity-50 transition-opacity duration-300 group-hover:opacity-70" style={{ background: `linear-gradient(to top, ${COR}, transparent)` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5" />

      {/* Área principal clicável (cobre o card). */}
      <Link href={hrefPrincipal} className="absolute inset-0 z-10" aria-label={s.titulo} />

      {/* Nota (concluído) OU nº de questões — canto superior direito. */}
      {concluido ? (
        <span className="pointer-events-none absolute right-3 top-3 z-20 rounded-lg bg-black/45 px-2 py-1 text-right backdrop-blur">
          <span className={cn('block text-lg font-bold leading-none tabular-nums text-white', s.melhorNota != null && notaTone(s.melhorNota))}>{fmtNota(s.melhorNota)}</span>
          <span className="block text-[9px] uppercase tracking-wide text-white/70">nota</span>
        </span>
      ) : (
        <span className="pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-lg bg-black/45 px-2 py-1 text-[10px] font-medium text-white/85 backdrop-blur">
          <FileQuestion className="h-3 w-3" /> {s.questoes}
        </span>
      )}

      {/* Selo "Personalizado" — canto superior esquerdo (no lugar da modalidade do oficial). */}
      <span className="pointer-events-none absolute left-3 top-3 z-20 inline-flex items-center gap-1 rounded-lg bg-black/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/85 backdrop-blur">
        <Wand2 className="h-3 w-3" /> Personalizado
      </span>

      {/* Excluir — hover, canto inferior direito (não colide com as pills à esquerda). */}
      <button type="button" onClick={onExcluir} title="Excluir"
        className="absolute bottom-3 right-3 z-30 rounded-full bg-black/45 p-2 text-white/80 opacity-0 backdrop-blur transition-all hover:bg-destructive hover:text-white group-hover:opacity-100">
        <Trash2 className="h-4 w-4" />
      </button>

      {/* Rodapé: chip de estado + título + pill(s) de ação secundária. */}
      <div className="absolute inset-x-0 bottom-0 z-20 p-4">
        <span className="mb-1 inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/85 backdrop-blur">
          {concluido ? <CheckCircle2 className="h-3 w-3" /> : s.emAndamento ? <Play className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
          {estadoLabel}
        </span>
        <h3 className="line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{s.titulo}</h3>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {concluido ? (
            // Refazer NÃO fica na frente: a parte interna (tela de resultado) já tem "Refazer simulado".
            <>
              <span className="pointer-events-none inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-900"><BarChart3 className="h-3.5 w-3.5" /> Ver resultado</span>
              <Link href={`/aluno/simulados/personalizados/${s.id}`} onClick={(e) => e.stopPropagation()}
                className="pointer-events-auto relative z-30 inline-flex items-center gap-1 rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"><Pencil className="h-3.5 w-3.5" /> Editar</Link>
            </>
          ) : !vazio ? (
            <>
              <span className="pointer-events-none inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-900"><Play className="h-3.5 w-3.5" /> {s.emAndamento ? 'Continuar' : 'Fazer'}</span>
              <Link href={`/aluno/simulados/personalizados/${s.id}`} onClick={(e) => e.stopPropagation()}
                className="pointer-events-auto relative z-30 inline-flex items-center gap-1 rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"><Pencil className="h-3.5 w-3.5" /> Editar</Link>
            </>
          ) : (
            <span className="pointer-events-none inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-900"><Pencil className="h-3.5 w-3.5" /> Editar</span>
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
        // Mesma grade dos cards oficiais (pôsteres).
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {itens.map((s) => <CardPersonalizado key={s.id} s={s} onExcluir={() => excluir(s)} />)}
        </div>
      )}
    </section>
  )
}
