import { SemPermissao } from '@/components/ui/alert-box'
import { checkPermission } from '@/lib/auth/permissions'
import { listarCategorias, listarCronogramas } from './actions'
import { resumoAcessoCronogramas } from './acesso-actions'
import { CronogramasClient } from './cronogramas-client'

export const dynamic = 'force-dynamic'

export default async function CronogramasPage() {
  const [r, cats, podeLiberar] = await Promise.all([listarCronogramas(), listarCategorias(), checkPermission('cronogramas:liberar')])
  // Acesso direto (todos/grupos/estudantes) de TODOS os cronogramas em UMA chamada. Tolerante: sem a migração, segue vazio.
  const resumo = r.ok && r.itens?.length ? await resumoAcessoCronogramas(r.itens.map((c) => c.id)).catch(() => null) : null

  return (
    <div className="animate-page">
      {!r.ok ? (
        <SemPermissao>{r.error ?? 'Não foi possível carregar o catálogo.'}</SemPermissao>
      ) : (
        <CronogramasClient inicial={r.itens ?? []} categoriasIniciais={cats.itens ?? []} resumoInicial={resumo?.resumo ?? {}} podeLiberar={podeLiberar} />
      )}
    </div>
  )
}
