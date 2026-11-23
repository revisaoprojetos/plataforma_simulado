'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Lock, SlidersHorizontal, Library, FileText, ListChecks, Download, Activity, ShieldCheck, UsersRound, Gauge, History, FlaskConical, Ban, Route, Workflow, Map as MapaIcon, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'

// Abas do admin do Cronograma Adaptativo (sublinhado, padrão do projeto): 17 telas (Liberação … Inteligência, Lei seca).
const TABS = [
  { href: '/admin/cronogramas/adaptativo', label: 'Liberação', icon: Lock },
  { href: '/admin/cronogramas/adaptativo/metas', label: 'Metas & inteligência', icon: SlidersHorizontal },
  { href: '/admin/cronogramas/adaptativo/catalogo', label: 'Catálogo de metas', icon: Library },
  { href: '/admin/cronogramas/adaptativo/definicoes', label: 'Definição e análise', icon: ListChecks },
  { href: '/admin/cronogramas/adaptativo/downloads', label: 'Downloads', icon: Download },
  { href: '/admin/cronogramas/adaptativo/analise', label: 'Análise de uso', icon: Activity },
  { href: '/admin/cronogramas/adaptativo/integridade', label: 'Integridade', icon: ShieldCheck },
  { href: '/admin/cronogramas/adaptativo/personagens', label: 'Personagens', icon: UsersRound },
  { href: '/admin/cronogramas/adaptativo/faixas', label: 'Faixas e limites', icon: Gauge },
  { href: '/admin/cronogramas/adaptativo/restricoes', label: 'Restrições', icon: Ban },
  { href: '/admin/cronogramas/adaptativo/versoes', label: 'Versões', icon: History },
  { href: '/admin/cronogramas/adaptativo/rastro', label: 'Rastro', icon: Route },
  { href: '/admin/cronogramas/adaptativo/fluxo', label: 'Fluxo', icon: Workflow },
  { href: '/admin/cronogramas/adaptativo/simulacao', label: 'Simulação', icon: FlaskConical },
  { href: '/admin/cronogramas/adaptativo/mapa', label: 'Mapa', icon: MapaIcon },
  { href: '/admin/cronogramas/adaptativo/inteligencia', label: 'Inteligência', icon: Brain },
  // Lei seca (WLP) do adaptativo: rota irmã (fora de /adaptativo/*), por isso o casamento por prefixo abaixo a cobre.
  { href: '/admin/cronogramas/lei-seca', label: 'Lei seca', icon: FileText },
]

export function AdaptativoTabs() {
  const pathname = usePathname()
  return (
    <div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const ativo = t.href === '/admin/cronogramas/adaptativo' ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + '/')
        const Icone = t.icon
        return (
          <Link key={t.href} href={t.href}
            className={cn('relative flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition',
              ativo ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icone className="h-4 w-4 shrink-0" />
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
