import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { SimuladoWizard } from '@/components/admin/simulado-wizard'
import { createSimuladoAction } from '../actions'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function NovoSimuladoPage() {
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const [{ data: questoesRaw }, { data: vinculos }, { data: pastaEst }, { data: estudantesRaw }] = await Promise.all([
    svc.from('simulado_questoes')
      .select('id, enunciado, tipo, nivel_dificuldade, disciplinas:simulado_disciplinas(nome), bancas:simulado_bancas(nome)')
      .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
      // Ordem de leitura (1ª questão importada primeiro) — casa com a listagem do banco.
      .order('created_at', { ascending: true })
      .limit(1000),
    svc.from('simulado_questao_pasta').select('questao_id, pasta_id').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000'),
    svc.from('simulado_pasta_estudantes').select('pasta_id, estudante_id').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000'),
    svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').order('nome'),
  ])

  // Bancos: tolerante à coluna `tipo` (migration pode não ter rodado).
  let bancos: any[] | null = null
  {
    const r = await svc.from('simulado_pastas').select('id, nome, cor, icone, capa_url, tipo').eq('deletado', false).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').order('nome')
    if (r.error && /tipo|column/i.test(r.error.message)) {
      const r2 = await svc.from('simulado_pastas').select('id, nome, cor, icone, capa_url').eq('deletado', false).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').order('nome')
      bancos = r2.data
    } else bancos = r.data
  }

  // Mapa questão -> bancos a que pertence + contagens por banco.
  const bancosPorQuestao = new Map<string, string[]>()
  const qCount = new Map<string, number>()
  for (const v of vinculos ?? []) {
    const arr = bancosPorQuestao.get((v as any).questao_id) ?? []
    arr.push((v as any).pasta_id)
    bancosPorQuestao.set((v as any).questao_id, arr)
    qCount.set((v as any).pasta_id, (qCount.get((v as any).pasta_id) ?? 0) + 1)
  }
  const eCount = new Map<string, Set<string>>()
  for (const pe of pastaEst ?? []) {
    const s = eCount.get((pe as any).pasta_id) ?? new Set<string>()
    if ((pe as any).estudante_id) s.add((pe as any).estudante_id)
    eCount.set((pe as any).pasta_id, s)
  }

  const bancosDetalhe = (bancos ?? []).map((b: any) => ({
    id: b.id, nome: b.nome, cor: b.cor ?? null, icone: b.icone ?? null, capa: b.capa_url ?? null, tipo: b.tipo ?? 'objetiva',
    nQuestoes: qCount.get(b.id) ?? 0, nEstudantes: eCount.get(b.id)?.size ?? 0,
  }))

  // Ordem manual das questões por banco (arrastar) — para o simulado herdar exatamente
  // a mesma ordem exibida no banco. Tolerante: a coluna pode não existir até a migration.
  const ordemPorBanco: Record<string, string[]> = {}
  {
    const { data: ord } = await svc.from('simulado_pastas').select('id, ordem_questoes').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
    for (const p of ord ?? []) {
      if (Array.isArray((p as any).ordem_questoes)) ordemPorBanco[(p as any).id] = (p as any).ordem_questoes
    }
  }

  const questoes = (questoesRaw ?? []).map((q: any) => ({
    id: q.id,
    enunciado: q.enunciado ?? '',
    tipo: q.tipo,
    nivel_dificuldade: q.nivel_dificuldade,
    disciplina: q.disciplinas?.nome ?? null,
    banca: q.bancas?.nome ?? null,
    bancoIds: bancosPorQuestao.get(q.id) ?? [],
  }))

  const estudantes = (estudantesRaw ?? []).map((e: any) => ({ id: e.id, nome: e.nome ?? 'Estudante', email: e.email ?? null }))

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/simulados" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Voltar para Simulados
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Novo Simulado</h1>
      </div>

      <SimuladoWizard bancos={bancosDetalhe} questoes={questoes} ordemPorBanco={ordemPorBanco} estudantes={estudantes} onSubmit={createSimuladoAction} />
    </div>
  )
}
