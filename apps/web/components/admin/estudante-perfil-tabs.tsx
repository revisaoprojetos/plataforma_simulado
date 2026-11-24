'use client'

import { useState, type ReactNode } from 'react'
import { AbasLinha } from '@/components/ui/abas-linha'

export interface PerfilTab {
  key: string
  label: string
  icon: ReactNode
  count?: number | null
  panel: ReactNode
  /** Quando definido, a aba NAVEGA para outra página (dados paginados na URL) em vez de trocar o painel. */
  href?: string
}

/**
 * Abas do perfil do aluno (admin). Troca client-side instantânea — todos os painéis já vêm
 * renderizados do servidor (dados buscados uma vez) e só alternamos a visibilidade.
 * `inicial` casa com o deep-link `?tab=` (ex.: vindo de Assinaturas & Engajamento).
 */
export function EstudantePerfilTabs({ tabs, inicial }: { tabs: PerfilTab[]; inicial?: string }) {
  const valido = tabs.some((t) => t.key === inicial && !t.href)
  const [ativa, setAtiva] = useState(valido ? inicial! : tabs[0]?.key)

  return (
    <div className="space-y-5">
      <AbasLinha
        ativo={ativa ?? ''}
        itens={tabs.map((t) =>
          t.href
            ? { key: t.key, label: t.label, href: t.href }
            : { key: t.key, label: t.label, badge: t.count ?? undefined, onClick: () => setAtiva(t.key) },
        )}
      />

      {/* Renderiza SÓ o painel ativo: painéis ocultos no DOM poluíam a ordem/índices do CascataEntrada
          (cards apareciam fora de sequência e o painel visível entrava atrasado). A entrada em si é do
          CascataEntrada/root da página — sem animação por painel aqui. Trocar de aba reinicia o estado
          interno (busca/filtros), o que é aceitável. */}
      {tabs.filter((t) => t.key === ativa && !t.href).map((t) => (
        <div key={t.key}>{t.panel}</div>
      ))}
    </div>
  )
}
