'use client'

import { usePathname } from 'next/navigation'
import { AbasLinha } from '@/components/ui/abas-linha'

// Abas de topo do Estúdio de Conteúdo (texto, sem ícone — como no designer). `match` acende a aba
// para TODA a subárea (ex.: "Materiais" fica ativa em qualquer /admin/conteudos/materiais/*).
const TABS: { label: string; href: string; match: string }[] = [
  { label: 'Produtos', href: '/admin/conteudos/produtos', match: '/admin/conteudos/produtos' },
  { label: 'Materiais', href: '/admin/conteudos/materiais/aulas', match: '/admin/conteudos/materiais' },
  { label: 'Vídeos', href: '/admin/conteudos/videos', match: '/admin/conteudos/videos' },
  { label: 'Flashcards', href: '/admin/conteudos/flashcards', match: '/admin/conteudos/flashcards' },
  { label: 'Trilhas', href: '/admin/conteudos/trilhas', match: '/admin/conteudos/trilhas' },
  { label: 'Oferta', href: '/admin/conteudos/ofertas', match: '/admin/conteudos/ofertas' },
  { label: 'Classificação', href: '/admin/conteudos/classificacao', match: '/admin/conteudos/classificacao' },
]

/** Abas (tab de linha / sublinhado) do shell do Estúdio de Conteúdo. */
export function ConteudosTabs() {
  const pathname = usePathname()
  const ativo = TABS.find((t) => pathname === t.match || pathname.startsWith(t.match + '/'))?.href ?? ''
  return <AbasLinha ativo={ativo} itens={TABS.map((t) => ({ key: t.href, label: t.label, href: t.href }))} />
}
