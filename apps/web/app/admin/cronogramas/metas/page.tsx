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
 * A tela separa duas coisas que a primeira versão misturava:
 *
 *   - O que PRECISA de decisão — formato de aula divergente, durações que se contradizem. São
 *     poucos, têm consequência conhecida, e cada um traz a correção junto: diagnóstico que
 *     obriga a corrigir noutro lugar costuma não ser corrigido.
 *   - O que serve para CONSULTAR — onde uma meta aparece. A mesma aula de Constitucional está
 *     em 18 cronogramas porque DEVE estar; listar isso como achado alarmava sobre o que está
 *     certo e escondia o que não está.
 */
export default async function AuditoriaMetasPage() {
  /* A busca de metas começa VAZIA — é ferramenta de consulta, não relatório. Só o total vem
     do servidor, para o cartão poder dizer "1.543 metas em mais de um cronograma, e isto é o
     normal". Deixou de baixar 25 grupos que ninguém pediu. */
  const [variantes, duracoes, grupos] = await Promise.all([
    carregarVariantesAula(),
    carregarDuracoes(),
    buscarGrupos('', 2, null, 0, 1),
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
          Onde as metas se contradizem entre cronogramas — e onde uma meta específica aparece.
        </p>
      </div>

      <MetasAuditoriaClient
        variantesIniciais={variantes.itens ?? []}
        duracoesIniciais={duracoes.itens ?? []}
        totalGrupos={grupos.total ?? 0}
        tipos={tipos.map((t) => ({ slug: t.slug, nome: t.nome }))}
      />
    </div>
  )
}
