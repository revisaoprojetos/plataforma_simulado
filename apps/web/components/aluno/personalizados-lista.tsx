'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Wand2, Plus, Loader2, FileQuestion, Play, Pencil, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconePersonalizado } from '@/lib/personalizado-visual'
import { listarMeusSimulados, type MeuSimuladoResumo } from '@/app/aluno/(portal)/simulados/builder-actions'

// Nota (0–100) → tom (mesma régua dos cards oficiais).
const notaTone = (n: number) => (n >= 70 ? 'text-emerald-400' : n >= 50 ? 'text-amber-400' : 'text-rose-400')
const fmtNota = (n: number | null) => (n == null ? '—' : Number(n).toFixed(1).replace('.', ','))

/**
 * Card "pôster" de um simulado personalizado — MESMO modelo dos cards do "Simulado Revisão"
 * (CardConcluido): pôster limpo (aspect-[4/5], degradê da marca, ícone marca-d'água, badge de nota,
 * chip de estado + título) SEM botões na capa. Clicar no card abre a PARTE INTERNA: concluído →
 * página de resultado (hero + Visão geral/Questões + Refazer/Editar); senão → editor (com Fazer).
 */
function CardPersonalizado({ s }: { s: MeuSimuladoResumo }) {
  const concluido = s.tentativas > 0
  const cor = s.cor
  const Icone = iconePersonalizado(s.icone) // ícone marca-d'água escolhido pelo aluno
  // Destino do clique (parte interna), como nos oficiais (card → área de detalhe).
  const hrefPrincipal = concluido
    ? `/aluno/simulados/personalizados/${s.id}/resultado`
    : `/aluno/simulados/personalizados/${s.id}`
  const estadoLabel = concluido ? 'Concluído' : s.emAndamento ? 'Em andamento' : 'Rascunho'

  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-white/25">
      {/* Fundo: degradê + ícone marca-d'água (cor e ícone escolhidos pelo aluno). */}
      <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />
      <Icone className="absolute -right-6 -top-6 h-40 w-40 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 opacity-50 transition-opacity duration-300 group-hover:opacity-70" style={{ background: `linear-gradient(to top, ${cor}, transparent)` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5" />

      {/* Card inteiro clicável → parte interna. */}
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

      {/* Rodapé: chip de estado + título (SEM botões na capa — excluir foi p/ a parte interna). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
        <span className="mb-1 inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/85 backdrop-blur">
          {concluido ? <CheckCircle2 className="h-3 w-3" /> : s.emAndamento ? <Play className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
          {estadoLabel}
        </span>
        <h3 className="line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{s.titulo}</h3>
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

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Wand2 className="h-4 w-4 text-primary" /> Seus simulados
          {itens && <span className="text-xs font-normal text-muted-foreground">({itens.length})</span>}
        </h2>
        <button type="button" data-tour="criar-simulado" onClick={criar}
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
          {itens.map((s) => <CardPersonalizado key={s.id} s={s} />)}
        </div>
      )}
    </section>
  )
}
