'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { destinoVoltar, type TelaVoltar } from '@/lib/admin/cronogramas-nav'

/**
 * "Voltar" DETERMINÍSTICO das telas de edição (cronograma [id], criar, conteudos/[id], pacotes/[id]): o destino vem de
 * `?voltar=` (só caminho interno /admin/…, validado — sem open redirect) ou do fallback fixo da tela; o rótulo é
 * contextual ("Voltar ao Catálogo/Conteúdos/Acessos"). Quem navega para a edição monta o link com `comVoltar(href, origem)`.
 */
export function VoltarCronogramas({ tela, className }: { tela: TelaVoltar; className?: string }) {
  const sp = useSearchParams()
  const { href, rotulo } = destinoVoltar(tela, sp.get('voltar'))
  return (
    <Link href={href} className={className ?? 'inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground'}>
      <ArrowLeft className="h-4 w-4" /> {rotulo}
    </Link>
  )
}
