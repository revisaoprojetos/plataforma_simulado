import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Navegação lateral reutilizável (banner do topo + fileiras de cards).
 *
 * MODELO: um DEGRADÊ lateral ESTÁTICO (um <div> travado — sem hover/active/transição, então nunca
 * encolhe, se mexe ou corta) + uma SETA num botão TRANSPARENTE por cima, totalmente DESCONECTADA do
 * degradê. A seta é a única coisa que reage ao mouse: aparece suavemente ao passar o mouse no
 * container (requer um ancestral com a classe `group`) e cresce um tico no hover direto dela.
 *
 * Uso: coloque dentro de um container `group relative` e renderize com `dir="left"|"right"`.
 * `insetY` = classe de altura vertical (padrão `inset-y-0`); use ex. `inset-y-2` quando o container
 * tem folga vertical (padding) e o degradê precisa casar com a altura real dos cards.
 */
export function SetaDegrade({ dir, onClick, label, insetY = 'inset-y-0' }: { dir: 'left' | 'right'; onClick: () => void; label?: string; insetY?: string }) {
  const isL = dir === 'left'
  const Icon = isL ? ChevronLeft : ChevronRight
  return (
    <>
      {/* Degradê estático (travado): nunca se mexe/encolhe/corta. */}
      <div aria-hidden className={cn('pointer-events-none absolute z-20 hidden w-20 from-black/45 via-black/12 to-transparent sm:block sm:w-28', insetY, isL ? 'left-0 bg-gradient-to-r' : 'right-0 bg-gradient-to-l')} />
      {/* Seta: botão transparente por cima — única coisa que reage ao mouse. */}
      <button type="button" onClick={onClick} aria-label={label ?? (isL ? 'Anterior' : 'Próximo')}
        className={cn('group/nav absolute z-30 hidden w-20 items-center text-white sm:flex sm:w-28', insetY, isL ? 'left-0 justify-start pl-3' : 'right-0 justify-end pr-3')}>
        <Icon className="h-8 w-8 opacity-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] transition-all duration-200 group-hover:opacity-90 group-hover/nav:scale-110 group-hover/nav:opacity-100" />
      </button>
    </>
  )
}
