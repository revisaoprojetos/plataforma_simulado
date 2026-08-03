import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { SimuladoWizard } from '@/components/admin/simulado-wizard'
import { createSimuladoAction, listarDisciplinasWizard } from '../actions'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function NovoSimuladoPage() {
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'

  // NÃO pré-carregamos as questões nem os estudantes (podem ser dezenas de milhares): o wizard
  // busca sob demanda no servidor — questões via buscarQuestoesWizard/listarQuestoesDoBanco,
  // estudantes via buscarEstudantesSimulado. Aqui só ficam as contagens por banco (id-pairs leves)
  // e as disciplinas (tabela pequena) para os filtros. fetchAll = evita o corte de 1000 do PostgREST.
  const [vinculos, pastaEst, disciplinas] = await Promise.all([
    fetchAll<any>(() => svc.from('simulado_questao_pasta').select('questao_id, pasta_id').eq('tenant_id', tid).order('questao_id')),
    fetchAll<any>(() => svc.from('simulado_pasta_estudantes').select('pasta_id, estudante_id').eq('tenant_id', tid).order('estudante_id')),
    listarDisciplinasWizard(),
  ])

  // Bancos: tolerante à coluna `tipo` (migration pode não ter rodado).
  let bancos: any[] | null = null
  {
    const r = await svc.from('simulado_pastas').select('id, nome, cor, icone, capa_url, capa_card_url, tipo').eq('deletado', false).eq('tenant_id', tid).order('nome')
    if (r.error && /tipo|capa_card_url|column/i.test(r.error.message)) {
      const r2 = await svc.from('simulado_pastas').select('id, nome, cor, icone, capa_url').eq('deletado', false).eq('tenant_id', tid).order('nome')
      bancos = r2.data
    } else bancos = r.data
  }

  // Contagens por banco (questões e estudantes) — a partir dos vínculos leves.
  const qCount = new Map<string, number>()
  for (const v of vinculos ?? []) qCount.set((v as any).pasta_id, (qCount.get((v as any).pasta_id) ?? 0) + 1)
  const eCount = new Map<string, Set<string>>()
  for (const pe of pastaEst ?? []) {
    const s = eCount.get((pe as any).pasta_id) ?? new Set<string>()
    if ((pe as any).estudante_id) s.add((pe as any).estudante_id)
    eCount.set((pe as any).pasta_id, s)
  }

  const bancosDetalhe = (bancos ?? []).map((b: any) => ({
    // Card do wizard é paisagem (aspect-16/10) → prefere o BANNER (capa_url, largo) e cai no
    // recorte pôster (capa_card_url, 4:5) só quando não há banner. Assim a capa centraliza no meio.
    id: b.id, nome: b.nome, cor: b.cor ?? null, icone: b.icone ?? null, capa: (b.capa_url ?? b.capa_card_url) ?? null, tipo: b.tipo ?? 'objetiva',
    nQuestoes: qCount.get(b.id) ?? 0, nEstudantes: eCount.get(b.id)?.size ?? 0,
  }))

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/simulados" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Voltar para Simulados
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Novo Simulado</h1>
      </div>

      <SimuladoWizard bancos={bancosDetalhe} disciplinas={disciplinas} onSubmit={createSimuladoAction} />
    </div>
  )
}
