import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { QuestaoForm } from '@/components/admin/questao-form'
import { createQuestaoAction } from '../actions'

export default async function NovaQuestaoPage() {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const admin = createAdminClient()
  const NADA = '00000000-0000-0000-0000-000000000000'

  const [{ data: bancas }, { data: disciplinas }, { data: assuntosLista }, detalheRows] = await Promise.all([
    supabase.from('simulado_bancas').select('nome').order('nome'),
    supabase.from('simulado_disciplinas').select('nome').order('nome'),
    admin.from('simulado_assuntos').select('nome').eq('tenant_id', tenantId ?? NADA).order('nome'),
    fetchAll<{ assunto_detalhe: string | null }>(() => admin.from('simulado_questoes').select('assunto_detalhe').eq('tenant_id', tenantId ?? NADA).not('assunto_detalhe', 'is', null)),
  ])

  const bancasSugestoes = (bancas ?? []).map((b) => b.nome)
  const disciplinasSugestoes = (disciplinas ?? []).map((d) => d.nome)
  const assuntosSugestoes = [...new Set((assuntosLista ?? []).map((a: { nome: string }) => a.nome).filter(Boolean))]
  const assuntosDetalheSugestoes = [...new Set(detalheRows.map((r) => (r.assunto_detalhe ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return (
    <QuestaoForm
      bancasSugestoes={bancasSugestoes}
      disciplinasSugestoes={disciplinasSugestoes}
      assuntosSugestoes={assuntosSugestoes}
      assuntosDetalheSugestoes={assuntosDetalheSugestoes}
      onSubmit={createQuestaoAction}
    />
  )
}
