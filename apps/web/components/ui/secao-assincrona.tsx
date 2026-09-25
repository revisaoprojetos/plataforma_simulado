import { Suspense, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Bloco que CARREGA EM BACKGROUND (streaming via <Suspense>): o shell da página renderiza na hora e
 * este bloco "streama" quando os dados chegam — a navegação não trava esperando o banco.
 *
 * Use envolvendo um Server Component async pesado (KPIs, gráfico, lista):
 *   <SecaoAssincrona altura={160}>
 *     <BlocoKpis />   // async: faz a query
 *   </SecaoAssincrona>
 *
 * Combine com cache (`remember`) na query e com paginação (`carregarLote`) para também CORTAR egress
 * (background sozinho melhora só a percepção).
 */
export function SecaoAssincrona({
  children,
  fallback,
  altura = 120,
  className,
}: {
  children: ReactNode
  /** Fallback custom; se omitido, usa um skeleton com a altura informada. */
  fallback?: ReactNode
  altura?: number
  className?: string
}) {
  return (
    <Suspense fallback={fallback ?? <SkeletonBloco altura={altura} className={className} />}>
      {children}
    </Suspense>
  )
}

/** Skeleton padrão (respeita tokens/tema; anima só com motion-safe). */
export function SkeletonBloco({ altura = 120, className }: { altura?: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('rounded-2xl border bg-muted/30 motion-safe:animate-pulse', className)}
      style={{ height: altura }}
    />
  )
}
