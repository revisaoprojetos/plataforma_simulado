import { SemPermissao } from '@/components/ui/alert-box'
import { listarCategorias, listarCronogramas } from './actions'
import { CronogramasClient } from './cronogramas-client'

export const dynamic = 'force-dynamic'

export default async function CronogramasPage() {
  const [r, cats] = await Promise.all([listarCronogramas(), listarCategorias()])

  return (
    <div className="animate-page">
      {!r.ok ? (
        <SemPermissao>{r.error ?? 'Não foi possível carregar o catálogo.'}</SemPermissao>
      ) : (
        <CronogramasClient inicial={r.itens ?? []} categoriasIniciais={cats.itens ?? []} />
      )}
    </div>
  )
}
