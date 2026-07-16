import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { getCurrentTenantId } from '@/lib/tenant'
import { BancoEstudantesClient } from '@/components/admin/banco-estudantes-client'
import { AlertTriangle } from 'lucide-react'

function SqlPendente() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      Recurso indisponível: rode o SQL pendente (tabela <code>simulado_pasta_estudantes</code>) no Supabase e recarregue.
    </div>
  )
}

export async function BancoEstudantes({ bancoId, cor = '#6d28d9' }: { bancoId: string; cor?: string }) {
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  // PAGINADO (fetchAll): pode haver >1000 vínculos/estudantes e o PostgREST corta em ~1000.
  let vincIds: string[]
  try {
    const pe = await fetchAll<{ estudante_id: string }>(() => svc
      .from('simulado_pasta_estudantes')
      .select('estudante_id')
      .eq('pasta_id', bancoId)
      .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
      .order('estudante_id', { ascending: true }))
    vincIds = pe.map((r) => r.estudante_id)
  } catch {
    return <SqlPendente />
  }
  const vincSet = new Set(vincIds)

  // Todos os estudantes da plataforma (tenant) — para o pop-up de adicionar. `.limit(2000)`
  // NÃO burla o teto de 1000 do PostgREST; por isso fetchAll.
  const lista = await fetchAll<any>(() => svc
    .from('simulado_estudantes')
    .select('id, nome, email, telefone, cpf, classificacao')
    .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
    .order('nome', { ascending: true })
    .order('id', { ascending: true }))
  const alunos = lista.map((a: any) => ({ ...a, jaVinculado: vincSet.has(a.id) }))

  // Último acesso de cada vinculado = sessão mais recente.
  const ultimoPorAluno = new Map<string, string>()
  if (vincIds.length) {
    // fetchAllByIn: vincIds pode ter centenas/milhares → `.in()` estoura URL e corta em 1000.
    const sess = await fetchAllByIn<{ estudante_id: string; iniciado_em: string }>(vincIds, (chunk) => svc
      .from('simulado_sessoes_prova')
      .select('estudante_id, iniciado_em')
      .in('estudante_id', chunk)
      .order('iniciado_em', { ascending: false }))
    for (const s of sess) if (!ultimoPorAluno.has(s.estudante_id)) ultimoPorAluno.set(s.estudante_id, s.iniciado_em)
  }
  const vinculados = lista.filter((a: any) => vincSet.has(a.id)).map((a: any) => ({ ...a, ultimo_acesso: ultimoPorAluno.get(a.id) ?? null }))

  // Grupos do tenant (para o botão "Adicionar grupo"), com contagem de membros e vínculo atual.
  let gruposRaw: any[] | null = null
  {
    const r = await svc.from('simulado_grupos').select('id, nome, cor').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').eq('deletado', false).order('nome')
    if (r.error && /cor/i.test(r.error.message)) {
      const r2 = await svc.from('simulado_grupos').select('id, nome').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').eq('deletado', false).order('nome')
      gruposRaw = r2.data
    } else gruposRaw = r.data
  }
  const gids = (gruposRaw ?? []).map((x: any) => x.id)
  const contMembros = new Map<string, number>()
  if (gids.length) {
    // fetchAll: há >1000 vínculos no total → sem paginar, a contagem por grupo é cortada em 1000
    // (era o bug do "teste simulado" aparecer com 0 membros no diálogo de vincular grupo).
    const gm = await fetchAll<{ grupo_id: string }>(() =>
      svc.from('simulado_grupo_membros').select('grupo_id').in('grupo_id', gids).order('estudante_id', { ascending: true }))
    for (const m of gm) contMembros.set(m.grupo_id, (contMembros.get(m.grupo_id) ?? 0) + 1)
  }
  let vinculadosSet = new Set<string>()
  {
    const { data: links, error: linkErr } = await svc.from('simulado_pasta_grupos').select('grupo_id').eq('pasta_id', bancoId)
    if (!linkErr) vinculadosSet = new Set((links ?? []).map((l: any) => l.grupo_id))
  }
  const grupos = (gruposRaw ?? []).map((x: any) => ({ id: x.id, nome: x.nome, cor: x.cor ?? null, membros: contMembros.get(x.id) ?? 0, vinculado: vinculadosSet.has(x.id) }))

  return <BancoEstudantesClient bancoId={bancoId} vinculados={vinculados as any} alunos={alunos as any} grupos={grupos} cor={cor} />
}
