'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Package, Link2, Tag, ListChecks, BarChart3, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCan } from '@/components/auth/can-provider'

const TABS: { label: string; href: string; icon: typeof CalendarDays; perm?: string }[] = [
  { label: 'Catálogo', href: '/admin/cronogramas', icon: CalendarDays },
  { label: 'Pacotes e acesso', href: '/admin/cronogramas/pacotes', icon: Package },
  { label: 'Links de aula', href: '/admin/cronogramas/links', icon: Link2 },
  { label: 'Tipos de meta', href: '/admin/cronogramas/tipos', icon: Tag },
  { label: 'Auditoria de metas', href: '/admin/cronogramas/metas', icon: ListChecks },
  { label: 'Relatórios', href: '/admin/cronogramas/relatorios', icon: BarChart3 },
  { label: 'Importar', href: '/admin/cronogramas/importar', icon: Upload, perm: 'cronogramas:update' },
]

const SECOES = ['pacotes', 'links', 'tipos', 'metas', 'relatorios', 'importar']

/** Abas de navegação da área de Cronograma (substitui os itens da sidebar + o "Voltar ao catálogo").
 *  Some nas telas de DETALHE (editor do cronograma /[id] e detalhe do pacote /pacotes/[id]) — lá o
 *  "Voltar" é a navegação certa. */
export function CronogramaTabs() {
  const pathname = usePathname()
  const can = useCan()

  const resto = pathname.replace(/^\/admin\/cronogramas\/?/, '')
  const segs = resto ? resto.split('/') : []
  const ehDetalhe = segs.length >= 2 || (segs.length === 1 && !SECOES.includes(segs[0]))
  if (ehDetalhe) return null

  const tabs = TABS.filter((t) => can(t.perm))
  // Seção ativa = a que casa o caminho (mais específica); Catálogo fica ativo quando nenhuma seção casa.
  const secoes = tabs.filter((t) => t.href !== '/admin/cronogramas')
  const ativaSecao = secoes.find((t) => pathname === t.href || pathname.startsWith(t.href + '/'))

  return (
    <div className="-mx-1 overflow-x-auto border-b">
      <nav className="flex min-w-max items-center gap-0.5 px-1">
        {tabs.map((t) => {
          const ativo = t.href === '/admin/cronogramas' ? !ativaSecao : t === ativaSecao
          const Icone = t.icon
          return (
            <Link key={t.href} href={t.href}
              className={cn('-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                ativo ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground')}>
              <Icone className="h-4 w-4" /> {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
