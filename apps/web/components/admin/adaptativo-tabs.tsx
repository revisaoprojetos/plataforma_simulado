'use client'

import { usePathname } from 'next/navigation'
import { AbasLinha } from '@/components/ui/abas-linha'
import { useDentroDoShellCronogramas } from '@/components/admin/cronograma/shell-context'

// Abas do admin do Cronograma Adaptativo (sublinhado, padrão do projeto): 17 telas (Liberação … Inteligência, Lei seca).
const TABS = [
  { href: '/admin/cronogramas/adaptativo', label: 'Liberação' },
  { href: '/admin/cronogramas/adaptativo/metas', label: 'Metas & inteligência' },
  { href: '/admin/cronogramas/adaptativo/catalogo', label: 'Catálogo de metas' },
  { href: '/admin/cronogramas/adaptativo/definicoes', label: 'Análise das metas' },
  { href: '/admin/cronogramas/adaptativo/downloads', label: 'Downloads' },
  { href: '/admin/cronogramas/adaptativo/analise', label: 'Análise de uso' },
  { href: '/admin/cronogramas/adaptativo/integridade', label: 'Integridade' },
  { href: '/admin/cronogramas/adaptativo/personagens', label: 'Personagens' },
  { href: '/admin/cronogramas/adaptativo/faixas', label: 'Faixas e limites' },
  { href: '/admin/cronogramas/adaptativo/restricoes', label: 'Restrições' },
  { href: '/admin/cronogramas/adaptativo/versoes', label: 'Versões' },
  { href: '/admin/cronogramas/adaptativo/rastro', label: 'Rastro' },
  { href: '/admin/cronogramas/adaptativo/fluxo', label: 'Fluxo' },
  { href: '/admin/cronogramas/adaptativo/simulacao', label: 'Simulação' },
  { href: '/admin/cronogramas/adaptativo/mapa', label: 'Mapa' },
  { href: '/admin/cronogramas/adaptativo/inteligencia', label: 'Inteligência' },
  // Lei seca (WLP) do adaptativo: rota irmã (fora de /adaptativo/*), por isso o casamento por prefixo abaixo a cobre.
  { href: '/admin/cronogramas/lei-seca', label: 'Lei seca' },
]

/**
 * FACHADA de compatibilidade: dentro do shell de Cronogramas (layout de /admin/cronogramas) a navegação é a
 * <CronogramasNav/> (grupos › sub-abas) e este componente não renderiza nada. Mantido só p/ páginas ainda não migradas.
 */
export function AdaptativoTabs() {
  const pathname = usePathname()
  const dentroShell = useDentroDoShellCronogramas()
  if (dentroShell) return null
  const ativo = TABS.find((t) => (t.href === '/admin/cronogramas/adaptativo' ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + '/')))?.href ?? ''
  return <AbasLinha ativo={ativo} itens={TABS.map((t) => ({ key: t.href, label: t.label, href: t.href }))} />
}
