'use client'

import { usePathname } from 'next/navigation'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'
import { rotaInternaSemAbas, rotaSemCabecalho } from '@/lib/admin/cronogramas-nav'
import { ShellCronogramasProvider } from './shell-context'

/**
 * Casca ÚNICA de Cronogramas (app/admin/cronogramas/layout.tsx E app/admin/revisao/cronograma/layout.tsx).
 * Liga o contexto: o <CabecalhoArea> de cada página (eyebrow → H1 → descrição/ações → BarraSetor → grupos → sub-abas)
 * passa a posicionar a CronogramasNav ABAIXO do título. Rotas sem cabeçalho próprio (edição) recebem aqui um cabeçalho só
 * com eyebrow + nav. Fachadas AdaptativoTabs/CronogramaTabs ficam nulas. Ver shell-context.tsx.
 */
export function ShellCronogramas({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Área INTERNA (matriz de aulas do conjunto): sem eyebrow/abas do Cronograma — só o "← Voltar" da própria página.
  // Provider desligado: o <CabecalhoArea> da página NÃO posiciona a CronogramasNav/BarraSetor aqui.
  if (rotaInternaSemAbas(pathname)) return <div className="w-full">{children}</div>
  const semCabecalho = rotaSemCabecalho(pathname)
  return (
    <ShellCronogramasProvider value={true}>
      <div className="w-full">
        {semCabecalho && <CabecalhoArea titulo="" denso className="mb-5" />}
        {children}
      </div>
    </ShellCronogramasProvider>
  )
}
