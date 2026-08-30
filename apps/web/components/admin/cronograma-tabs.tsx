'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

// MESMOS itens e estilo da barra que já existe no catálogo (cronogramas-client.tsx): texto puro,
// sublinhado, sem ícones. Relatórios e Importar NÃO são abas (ficam na sidebar / botão do catálogo).
const TABS: { href: string; label: string }[] = [
  { href: '/admin/cronogramas', label: 'Catálogo' },
  { href: '/admin/cronogramas/pacotes', label: 'Pacotes e acesso' },
  { href: '/admin/cronogramas/links', label: 'Links de aula' },
  { href: '/admin/cronogramas/tipos', label: 'Tipos de meta' },
  { href: '/admin/cronogramas/metas', label: 'Auditoria' },
]

/** Abas da seção Cronograma para as SUBPÁGINAS (o catálogo mantém a própria, idêntica). */
export function CronogramaTabs() {
  const pathname = usePathname()
  const secoes = TABS.slice(1)
  const ativaSecao = secoes.find((t) => pathname === t.href || pathname.startsWith(t.href + '/'))
  return (
    <div className="-mb-px flex flex-wrap items-center gap-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const ativo = t.href === '/admin/cronogramas' ? !ativaSecao : t === ativaSecao
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition',
              ativo ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
