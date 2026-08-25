import { ListChecks } from 'lucide-react'
import { SemPermissao } from '@/components/ui/alert-box'
import { listarTiposMeta } from '@/lib/cronograma/carregar-tipos'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { buscarGrupos, carregarDuracoes, carregarVariantesAula } from './actions'
import { MetasAuditoriaClient } from './metas-auditoria-client'

export const dynamic = 'force-dynamic'

/**
 * Auditoria de metas — a tela que faltava para a pergunta TRANSVERSAL.
 *
 * O detalhe do cronograma responde "o que tem nesta semana". Aqui a pergunta é outra: "esta
 * meta está em quantos cronogramas?", "a mesma aula está gravada de dois jeitos?", "que semanas
 * têm durações que se contradizem?". Antes, responder isso significava abrir 26 telas.
 *
 * As três seções não são um relatório: cada uma traz a correção junto, porque um diagnóstico
 * que obriga a corrigir em outro lugar costuma não ser corrigido.
 */
export default async function AuditoriaMetasPage() {
  const [variantes, duracoes, grupos] = await Promise.all([
    carregarVariantesAula(),
    carregarDuracoes(),
    buscarGrupos('', 2, null, 0, 25),
  ])

  if (!variantes.ok || !grupos.ok) {
    return (
      <div className="animate-page space-y-6">
        <SemPermissao>{variantes.error ?? grupos.error ?? 'Não foi possível carregar.'}</SemPermissao>
      </div>
    )
  }

  const acesso = await getCurrentAccess()
  const tipos = acesso.tenantId ? await listarTiposMeta(acesso.tenantId) : []

  return (
    <div className="animate-page space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ListChecks className="h-6 w-6 text-primary" />
          Auditoria de metas
        </h1>
        <p className="text-muted-foreground">
          A mesma meta vista por todos os cronogramas: onde ela está, onde está gravada de formas
          diferentes, e o que dá para padronizar de uma vez.
        </p>
      </div>

      <MetasAuditoriaClient
        variantesIniciais={variantes.itens ?? []}
        duracoesIniciais={duracoes.itens ?? []}
        gruposIniciais={grupos.itens ?? []}
        totalGrupos={grupos.total ?? 0}
        tipos={tipos.map((t) => ({ slug: t.slug, nome: t.nome }))}
      />
    </div>
  )
}
