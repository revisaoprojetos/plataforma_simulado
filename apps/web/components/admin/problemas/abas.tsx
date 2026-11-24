'use client'

// Abas da Auditoria de Problemas — SUBLINHADO (border-b-2), nunca pill. Cada aba é um link (?aba=) e a página só busca os dados dela.
import { AbasLinha } from '@/components/ui/abas-linha'

export const ABAS = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'mapa', label: 'Mapa mental' },
  { id: 'lista', label: 'Lista' },
  { id: 'historico', label: 'Histórico' },
] as const
export type AbaId = (typeof ABAS)[number]['id']

export function ProblemasAbas({ ativa }: { ativa: AbaId }) {
  return (
    <AbasLinha
      ativo={ativa}
      itens={ABAS.map((t) => ({ key: t.id, label: t.label, href: t.id === 'visao' ? '/admin/auditoria/problemas' : `/admin/auditoria/problemas?aba=${t.id}` }))}
    />
  )
}
