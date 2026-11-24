'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * PADRÃO ÚNICO de abas do admin (referência: "Gerenciar produtos"). Texto simples, sem ícone/pill/fundo,
 * uma única linha de base (`border-b`) com a aba ativa sublinhada (`border-primary`) em negrito.
 * Largura canônica: a linha ocupa a largura do conteúdo (como ConteudosTabs).
 * Posição: logo abaixo do título (gap-4 no EstudioHeader).
 */
export const ABAS_LINHA_LISTA =
  'flex flex-wrap items-center gap-x-7 gap-y-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

const ABAS_LINHA_BASE =
  '-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[14px] tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

export function abasLinhaItem(ativo: boolean): string {
  return cn(
    ABAS_LINHA_BASE,
    ativo
      ? 'border-primary font-extrabold text-foreground'
      : 'border-transparent font-semibold text-muted-foreground hover:text-foreground',
  )
}

export interface AbaLinhaItem {
  key: string
  label: ReactNode
  /** Navegação (renderiza <Link>). */
  href?: string
  /** Estado (renderiza <button type="button">). */
  onClick?: () => void
  /** Contador discreto, em texto muted. */
  badge?: ReactNode
  disabled?: boolean
  /** Tooltip nativo (frase curta). */
  title?: string
  /** Só para `href`: `false` desliga o prefetch automático do Link (default do Next quando omitido). */
  prefetch?: boolean
}

interface AbasLinhaProps {
  itens: AbaLinhaItem[]
  /** Chave (`key`) da aba ativa. */
  ativo: string
  className?: string
  'aria-label'?: string
}

/** Abas de linha: serve a links (href) e a botões (onClick), no mesmo visual. */
export function AbasLinha({ itens, ativo, className, 'aria-label': ariaLabel }: AbasLinhaProps) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn(ABAS_LINHA_LISTA, className)}>
      {itens.map((it) => {
        const on = it.key === ativo
        const conteudo = (
          <>
            {it.label}
            {it.badge != null && it.badge !== '' && (
              <span className="ml-1.5 text-[12px] font-medium tabular-nums text-muted-foreground">{it.badge}</span>
            )}
          </>
        )
        const cls = cn(abasLinhaItem(on), it.disabled && 'pointer-events-none opacity-50')
        if (it.href && !it.disabled) {
          return (
            <Link key={it.key} href={it.href} title={it.title} prefetch={it.prefetch} role="tab" aria-selected={on} aria-current={on ? 'page' : undefined} className={cls}>
              {conteudo}
            </Link>
          )
        }
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on}
            aria-disabled={it.disabled || undefined}
            disabled={it.disabled}
            title={it.title}
            onClick={it.onClick}
            className={cls}
          >
            {conteudo}
          </button>
        )
      })}
    </div>
  )
}

interface AbasLinhaControladaProps<T extends string> {
  itens: { valor: T; label: ReactNode; badge?: ReactNode; disabled?: boolean }[]
  valor: T
  onChange: (valor: T) => void
  className?: string
  'aria-label'?: string
}

/** Variante controlada por estado (valor/onChange). */
export function AbasLinhaControlada<T extends string>({ itens, valor, onChange, className, 'aria-label': ariaLabel }: AbasLinhaControladaProps<T>) {
  return (
    <AbasLinha
      ativo={valor}
      className={className}
      aria-label={ariaLabel}
      itens={itens.map((i) => ({ key: i.valor, label: i.label, badge: i.badge, disabled: i.disabled, onClick: () => onChange(i.valor) }))}
    />
  )
}
