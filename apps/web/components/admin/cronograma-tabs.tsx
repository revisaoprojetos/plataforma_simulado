'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ABAS_LINHA_LISTA, abasLinhaItem } from '@/components/ui/abas-linha'
import { useDentroDoShellCronogramas } from '@/components/admin/cronograma/shell-context'

// Abas da seção Cronograma — usadas no catálogo E nas subpáginas (mesmo componente = sempre idênticas).
// Relatórios e Importar NÃO são abas (ficam na sidebar / botão do catálogo).
const TABS: { href: string; label: string }[] = [
  { href: '/admin/cronogramas', label: 'Catálogo' },
  { href: '/admin/cronogramas/conteudos', label: 'Conteúdos' },
  { href: '/admin/cronogramas/pacotes', label: 'Grupos de acessos' },
  { href: '/admin/cronogramas/links', label: 'Links de aula' },
  { href: '/admin/cronogramas/tipos', label: 'Tipos de meta' },
  { href: '/admin/cronogramas/metas', label: 'Auditoria de metas' },
]

/** FACHADA de compatibilidade: dentro do shell de Cronogramas a navegação é a CronogramasNav e este componente não renderiza nada. */
export function CronogramaTabs({ catalogoCount }: { catalogoCount?: number }) {
  const pathname = usePathname()
  const dentroShell = useDentroDoShellCronogramas()
  const secoes = TABS.slice(1)
  const ativaSecao = secoes.find((t) => pathname === t.href || pathname.startsWith(t.href + '/'))

  // Pré-carregamento das OUTRAS abas em segundo plano, para que a troca fique instantânea.
  // Estas rotas são `force-dynamic`, então só `prefetch` FULL busca os dados (não só a casca).
  // Ligamos só DEPOIS que a página atual assentou (requestIdleCallback / timeout) para não
  // competir com o carregamento inicial. Como este componente só existe dentro da área de
  // cronogramas, ele desmonta ao sair — e o Next descarta o cache dessas rotas (limpa sozinho).
  const [prefetchAtivo, setPrefetchAtivo] = useState(false)
  useEffect(() => {
    if (dentroShell) return
    let cancelado = false
    const ligar = () => { if (!cancelado) setPrefetchAtivo(true) }
    const w = window as any
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(ligar, { timeout: 1500 })
      return () => { cancelado = true; if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id) }
    }
    const t = setTimeout(ligar, 800)
    return () => { cancelado = true; clearTimeout(t) }
  }, [dentroShell])

  if (dentroShell) return null
  return (
    <div role="tablist" className={cn(ABAS_LINHA_LISTA, 'mb-5')}>
      {TABS.map((t) => {
        const ativo = t.href === '/admin/cronogramas' ? !ativaSecao : t === ativaSecao
        const n = t.href === '/admin/cronogramas' ? catalogoCount : undefined
        // Não pré-carrega a aba atual (já está aberta). As demais: prefetch full após o idle.
        const prefetch = prefetchAtivo && !ativo ? true : false
        return (
          <Link key={t.href} href={t.href} prefetch={prefetch} role="tab" aria-selected={ativo} aria-current={ativo ? 'page' : undefined} className={abasLinhaItem(ativo)}>
            {t.label}
            {n != null && n > 0 && <span className="ml-1.5 text-[12px] font-medium tabular-nums text-muted-foreground">{n.toLocaleString('pt-BR')}</span>}
          </Link>
        )
      })}
    </div>
  )
}
