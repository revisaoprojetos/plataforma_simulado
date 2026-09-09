'use client'

import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Cabeçalho de seção (número + título + descrição) da coluna de controles do assistente.
 *
 * No layout "split ao vivo" cada seção é recolhível (`colapsavel`): o título vira um botão que
 * abre/fecha o corpo, para a coluna esquerda caber sem rolar demais enquanto a prévia à direita
 * fica sempre visível.
 */
export function Secao({
  numero,
  titulo,
  descricao,
  children,
  colapsavel = false,
  defaultAberto = true,
  acessorio,
  completo = false,
}: {
  numero: number
  titulo: string
  descricao?: string
  children: React.ReactNode
  colapsavel?: boolean
  defaultAberto?: boolean
  /** Conteúdo à direita do cabeçalho (ex.: resumo/contagem), visível mesmo fechado. */
  acessorio?: React.ReactNode
  /** Marca a seção como concluída — o número vira ✓ verde. */
  completo?: boolean
}) {
  const [aberto, setAberto] = useState(defaultAberto)

  const cabecalho = (
    <>
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition', completo ? 'bg-emerald-500 text-white' : 'bg-primary/10 text-primary')}>
        {completo ? <Check className="h-4 w-4" /> : numero}
      </span>
      <div className="min-w-0 flex-1 text-left">
        <h2 className="text-sm font-semibold leading-tight">{titulo}</h2>
        {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
      </div>
      {acessorio}
      {colapsavel && <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', aberto ? '' : '-rotate-90')} />}
    </>
  )

  if (!colapsavel) {
    return (
      <section id={`secao-${numero}`} className="scroll-mt-20 space-y-2.5">
        <div className="flex items-center gap-2.5">{cabecalho}</div>
        {children}
      </section>
    )
  }

  return (
    <section id={`secao-${numero}`} className="scroll-mt-20">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-2.5 py-3 text-left transition hover:opacity-80">
        {cabecalho}
      </button>
      {aberto && <div className="pb-3">{children}</div>}
    </section>
  )
}
