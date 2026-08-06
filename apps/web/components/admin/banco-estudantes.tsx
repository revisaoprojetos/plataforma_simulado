import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { getCurrentTenantId } from '@/lib/tenant'
import { selecionarGrupos } from '@/lib/simulado/grupos'
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
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'

  // Vínculos do banco (ids). Tolerante: a tabela pode não existir → SqlPendente.
  let vincIds: string[]
  try {
    const pe = await fetchAll<{ estudante_id: string }>(() => svc
      .from('simulado_pasta_estudantes').select('estudante_id')
      .eq('pasta_id', bancoId).eq('tenant_id', tid).order('estudante_id', { ascending: true }))
    vincIds = pe.map((r) => r.estudante_id)
  } catch {
    return <SqlPendente />
  }
  const vincSet = new Set(vincIds)

  // SÓ os registros dos VINCULADOS (por id) + suas sessões. ANTES a aba buscava TODOS os estudantes
  // do tenant (>11 mil) só para o pop-up de adicionar → aba lentíssima. Agora o pop-up busca sob
  // demanda (buscarEstudantesPlataforma) e aqui pegamos apenas os vinculados por id.
  // chunk: 300 (não 80): o `.in()` por id fazia ~61 requisições sequenciais p/ 4.9k ids (o gargalo
  // real dos ~80s). Com 300 por vez são ~17 (URL ainda dentro do limite). Sem embed: as FKs do
  // esqueleto simulado_* estão quebradas → PostgREST não faz o JOIN.
  const [vincRecs, sess] = await Promise.all([
    vincIds.length
      ? fetchAllByIn<any>(vincIds, (ids) => svc
          .from('simulado_estudantes').select('id, nome, email, telefone, cpf, classificacao').in('id', ids), { chunk: 300 })
      : Promise.resolve([] as any[]),
    vincIds.length
      ? fetchAllByIn<{ estudante_id: string; iniciado_em: string }>(vincIds, (ids) => svc
          .from('simulado_sessoes_prova').select('estudante_id, iniciado_em')
          .in('estudante_id', ids).eq('deletado', false).eq('is_teste', false).order('iniciado_em', { ascending: false }), { chunk: 300 })
      : Promise.resolve([] as { estudante_id: string; iniciado_em: string }[]),
  ])
  const ultimoPorAluno = new Map<string, string>()
  for (const s of sess) if (!ultimoPorAluno.has(s.estudante_id)) ultimoPorAluno.set(s.estudante_id, s.iniciado_em)
  const vinculados = vincRecs
    .map((a: any) => ({ ...a, ultimo_acesso: ultimoPorAluno.get(a.id) ?? null }))
    .sort((a: any, b: any) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))

  // Grupo(s) pelo(s) qual(is) cada aluno chegou a este banco (grupos vinculados de que ele é membro).
  // A contagem de membros de TODOS os grupos (>22 mil filiações) saiu daqui → agora é sob demanda no
  // diálogo "Adicionar grupo" (carregarGruposDoBanco). Aqui só varremos os grupos LIGADOS ao banco.
  const gruposPorEstudante: Record<string, { id: string; nome: string; cor: string | null }[]> = {}
  const { data: links } = await svc.from('simulado_pasta_grupos').select('grupo_id').eq('pasta_id', bancoId)
  const linkedGroupIds = [...new Set((links ?? []).map((l: any) => l.grupo_id))]
  if (linkedGroupIds.length) {
    const gruposRaw = await selecionarGrupos(svc, tid)
    const infoGrupo = new Map<string, { id: string; nome: string; cor: string | null }>(
      gruposRaw.map((x) => [x.id, { id: x.id, nome: x.nome, cor: x.cor ?? null }]),
    )
    const gm2 = await fetchAll<{ grupo_id: string; estudante_id: string }>(() =>
      svc.from('simulado_grupo_membros').select('grupo_id, estudante_id').in('grupo_id', linkedGroupIds).order('id', { ascending: true }))
    const jaTem: Record<string, Set<string>> = {}
    for (const m of gm2) {
      if (!vincSet.has(m.estudante_id)) continue
      const g = infoGrupo.get(m.grupo_id)
      if (!g) continue
      const seen = (jaTem[m.estudante_id] ??= new Set())
      if (seen.has(g.id)) continue
      seen.add(g.id)
      ;(gruposPorEstudante[m.estudante_id] ??= []).push(g)
    }
    for (const k of Object.keys(gruposPorEstudante)) gruposPorEstudante[k].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  return <BancoEstudantesClient bancoId={bancoId} vinculados={vinculados as any} gruposPorEstudante={gruposPorEstudante} cor={cor} />
}
