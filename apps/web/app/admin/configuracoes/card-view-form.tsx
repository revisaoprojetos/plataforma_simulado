'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, LayoutGrid, StretchHorizontal, Check, GraduationCap, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolverCardView, type CardView } from '@/lib/card-view'

const OPCOES: { v: CardView; nome: string; desc: string }[] = [
  { v: 'poster', nome: 'Pôster (4:5)', desc: 'Card alto no formato pôster, com a imagem preenchendo tudo e o texto sobreposto na base. É o padrão.' },
  { v: 'ticket', nome: 'Ticket (retangular)', desc: 'Card baixo e horizontal: a imagem ocupa a metade esquerda e o nome + informações ficam à direita.' },
]

/** Mini-prévia de cada estilo de card. */
function Previa({ modo }: { modo: CardView }) {
  const cor = 'var(--brand-primary, var(--primary))'
  if (modo === 'ticket') {
    return (
      <div className="flex h-[104px] w-[104px] items-center">
        <div className="flex h-11 w-full overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="h-full w-2/5 shrink-0" style={{ background: `linear-gradient(150deg, ${cor}, #0f172a)` }} />
          <div className="flex-1 space-y-1 p-1.5">
            <div className="h-1.5 w-4/5 rounded bg-foreground/30" />
            <div className="h-1 w-2/3 rounded bg-muted-foreground/40" />
            <div className="h-2 w-1/2 rounded" style={{ background: cor }} />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-[104px] w-[104px] items-center justify-center">
      <div className="relative h-full w-[72px] overflow-hidden rounded-lg border shadow-sm" style={{ background: `linear-gradient(155deg, ${cor}, #0f172a)` }}>
        <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-5">
          <div className="h-1.5 w-4/5 rounded bg-white/80" />
          <div className="h-2 w-full rounded bg-white/25" />
        </div>
      </div>
    </div>
  )
}

/** Grupo de seleção (pôster × ticket) de UMA área — reusado para aluno e admin. */
function SeletorEstilo({ valor, onEscolher }: { valor: CardView; onEscolher: (v: CardView) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {OPCOES.map((o) => {
        const on = valor === o.v
        const Icon = o.v === 'poster' ? LayoutGrid : StretchHorizontal
        return (
          <button key={o.v} type="button" onClick={() => onEscolher(o.v)}
            className={cn('flex gap-3 rounded-xl border p-3 text-left transition-colors', on ? 'border-primary/50 bg-primary/[0.06]' : 'hover:bg-muted/50')}>
            <Previa modo={o.v} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {o.nome}</span>
                {on ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"><Check className="h-3.5 w-3.5" /> ativo</span> : <span className="text-[11px] text-muted-foreground">selecionar</span>}
              </div>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">{o.desc}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Escolhe o estilo dos CARDS de simulado, decidido no CONSOLE (por tenant). Duas áreas independentes:
 * `card_view` = portal do aluno; `card_view_admin` = painel do admin (fallback p/ `card_view`, retrocompatível).
 * O admin normal e o aluno apenas obedecem: não há alternador nas telas deles.
 */
export function CardViewForm({ tema, salvarTema }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const [aluno, setAluno] = useState<CardView>(resolverCardView(tema?.card_view))
  const [admin, setAdmin] = useState<CardView>(resolverCardView(tema?.card_view_admin ?? tema?.card_view))
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()

  function salvar() {
    start(async () => {
      try { await salvarTema({ card_view: aluno, card_view_admin: admin }); setDirty(false); toast.success('Estilo dos cards salvo!') }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao salvar') }
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Como os simulados aparecem em lista. Escolha o estilo <span className="font-medium text-foreground">separadamente</span> para o portal do aluno e para o painel do admin. Definido aqui no console — os administradores não trocam por conta própria.
      </p>

      {/* Portal do aluno */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><GraduationCap className="h-4 w-4" /></span>
          <span className="text-sm font-semibold">Portal do aluno</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Cards dos simulados que o estudante vê na Home e em “Meus Simulados”.</p>
        <SeletorEstilo valor={aluno} onEscolher={(v) => { setAluno(v); setDirty(true) }} />
      </div>

      {/* Painel do admin */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></span>
          <span className="text-sm font-semibold">Painel do admin</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Cards dos simulados no board de gestão (Simulados).</p>
        <SeletorEstilo valor={admin} onEscolher={(v) => { setAdmin(v); setDirty(true) }} />
      </div>

      <button type="button" onClick={salvar} disabled={pending || !dirty}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar estilo dos cards
      </button>
    </div>
  )
}
