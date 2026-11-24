'use client'

import { usePathname } from 'next/navigation'
import { AbasLinha } from '@/components/ui/abas-linha'

interface Tab { label: string; href: string; exact?: boolean; soGerir?: boolean }

const TABS: Tab[] = [
  { label: 'Administradores', href: '/admin/administradores', exact: true, soGerir: true },
  { label: 'Permissões', href: '/admin/administradores/permissoes' },
]

/** Abas do módulo de acesso: equipe (Administradores) × cargos/liberações (Permissões). */
export function AdministradoresTabs({ podeGerir }: { podeGerir: boolean }) {
  const pathname = usePathname()
  const tabs = TABS.filter((t) => !t.soGerir || podeGerir)
  const ativo = tabs.find((t) => (t.exact ? pathname === t.href : pathname.startsWith(t.href)))?.href ?? ''
  return <AbasLinha ativo={ativo} itens={tabs.map((t) => ({ key: t.href, label: t.label, href: t.href }))} />
}
