'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ABAS_LINHA_LISTA, abasLinhaItem } from '@/components/ui/abas-linha'

export type ModuloTab = 'aulas' | 'acessos' | 'config' | 'ranking' | 'relatorio' | 'trilha' | 'regulamento' | 'medalhas'
export const MODULO_TABS: { id: ModuloTab; label: string }[] = [
  { id: 'aulas', label: 'Aulas' },
  { id: 'trilha', label: 'Editar trilha' },
  { id: 'regulamento', label: 'Regulamento' },
  { id: 'acessos', label: 'Acessos' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'medalhas', label: 'Medalhas' },
  { id: 'relatorio', label: 'Relatório' },
  { id: 'config', label: 'Configurações' },
]

/**
 * Barra de abas do módulo — padrão único (abas-linha). `claro` = versão sobre o banner
 * (texto/sublinhado brancos, borda branca translúcida). Navega por ?tab=.
 */
export function ModuloTabsBar({ pastaAtual, moduloTab, claro = false, basePath = '/admin/leitura' }: { pastaAtual: string; moduloTab: ModuloTab; claro?: boolean; basePath?: string }) {
  return (
    <div role="tablist" className={cn(ABAS_LINHA_LISTA, claro && 'border-white/20')}>
      {MODULO_TABS.map(({ id, label }) => {
        const on = moduloTab === id
        return (
          <Link key={id} role="tab" aria-selected={on} aria-current={on ? 'page' : undefined}
            href={`${basePath}?pasta=${pastaAtual}&tab=${id}`}
            className={cn(abasLinhaItem(on), claro && (on ? 'border-white text-white' : 'text-white/70 hover:text-white'))}>
            {label}
          </Link>
        )
      })}
    </div>
  )
}
