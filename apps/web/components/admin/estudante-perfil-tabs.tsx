'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface PerfilTab {
  key: string
  label: string
  icon: ReactNode
  count?: number | null
  panel: ReactNode
}

/**
 * Abas do perfil do aluno (admin). Troca client-side instantânea — todos os painéis já vêm
 * renderizados do servidor (dados buscados uma vez) e só alternamos a visibilidade.
 * `inicial` casa com o deep-link `?tab=` (ex.: vindo de Assinaturas & Engajamento).
 */
export function EstudantePerfilTabs({ tabs, inicial }: { tabs: PerfilTab[]; inicial?: string }) {
  const valido = tabs.some((t) => t.key === inicial)
  const [ativa, setAtiva] = useState(valido ? inicial! : tabs[0]?.key)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1 shadow-sm">
        {tabs.map((t) => {
          const on = ativa === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setAtiva(t.key)}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                on ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center">{t.icon}</span>
              {t.label}
              {t.count != null && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', on ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground')}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Renderiza SÓ o painel ativo: painéis ocultos no DOM poluíam a ordem/índices do CascataEntrada
          (cards apareciam fora de sequência e o painel visível entrava atrasado). A entrada em si é do
          CascataEntrada/root da página — sem animação por painel aqui. Trocar de aba reinicia o estado
          interno (busca/filtros), o que é aceitável. */}
      {tabs.filter((t) => t.key === ativa).map((t) => (
        <div key={t.key}>{t.panel}</div>
      ))}
    </div>
  )
}
