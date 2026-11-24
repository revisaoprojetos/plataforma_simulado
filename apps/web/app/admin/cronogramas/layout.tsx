import { Suspense } from 'react'
import { AppLoading } from '@/components/admin/app-loading'
import { ShellCronogramas } from '@/components/admin/cronograma/shell-cronogramas'

// Layout de TODAS as rotas /admin/cronogramas/** (catálogo, [id], criar, conteudos, pacotes, adaptativo/*, lei-seca…):
// eyebrow "Cronogramas" + BarraSetor [Gerador | Adaptativo] + grupos + sub-abas ficam FIXOS; só o conteúdo troca/carrega.
// Páginas legadas continuam com o próprio CabecalhoArea/AdaptativoTabs/CronogramaTabs — o contexto do shell os reduz a
// título/descrição/ações (ver components/admin/cronograma/shell-context.tsx). Mesma casca do shell /admin/revisao/cronograma.
export default function CronogramasLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShellCronogramas>
      <Suspense fallback={<AppLoading />}>{children}</Suspense>
    </ShellCronogramas>
  )
}
