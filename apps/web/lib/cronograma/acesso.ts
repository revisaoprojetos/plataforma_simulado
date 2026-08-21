import 'server-only'

/**
 * Gate de acesso do ALUNO ao cronograma — espelha o mecanismo do simulado.
 *
 * São módulos SEPARADOS: matrícula em simulado não dá acesso a cronograma e vice-versa.
 * O vínculo grupo→cronograma é explícito (`simulado_cronograma_grupos`); sem ele, entrar
 * num grupo não libera cronograma nenhum.
 *
 * Quatro vias de acesso, checadas nesta ordem:
 *   1. testador  — atravessa tudo, inclusive rascunho (marca a emissão como teste)
 *   2. gratuito  — o cronograma libera para todos os alunos do tenant
 *   3. matrícula — o portão normal
 *   4. avulso    — concessão com prazo, enquanto não expirar
 *
 * ATENÇÃO: este arquivo é só LEITURA. A propagação em massa (vincular um grupo e
 * matricular seus membros) está deliberadamente fora por ora — com 24.773 vínculos de
 * grupo no banco, ligá-la sem validar a tela criaria milhares de matrículas de uma vez.
 */

import { fetchAllByIn } from './../supabase/fetch-all'

export type ViaAcesso = 'testador' | 'gratuito' | 'matricula' | 'avulso'

const SEM_TENANT = '00000000-0000-0000-0000-000000000000'

/**
 * O aluno pode acessar este cronograma?
 *
 * Busca TODAS as matrículas e usa `.some(...)` em vez de `.maybeSingle()`. A tabela nova
 * tem índice único desde o início, mas o padrão tolerante custa nada e sobrevive a uma
 * importação mal-comportada — no simulado, duplicatas históricas faziam a query lançar.
 */
export async function verificarAcessoCronograma(
  svc: any,
  tenantId: string | null,
  estudanteId: string,
  cronogramaId: string,
): Promise<{ permitido: boolean; via: ViaAcesso | null }> {
  const tid = tenantId ?? SEM_TENANT

  const { data: testador } = await svc
    .from('simulado_cronograma_testadores')
    .select('id')
    .eq('tenant_id', tid)
    .eq('estudante_id', estudanteId)
    .or(`cronograma_id.eq.${cronogramaId},cronograma_id.is.null`)
    .limit(1)
  if ((testador ?? []).length) return { permitido: true, via: 'testador' }

  const { data: cron } = await svc
    .from('simulado_cronogramas')
    .select('id, status, acesso_gratuito')
    .eq('id', cronogramaId)
    .eq('tenant_id', tid)
    .eq('deletado', false)
    .maybeSingle()
  // Fora do testador, cronograma em rascunho não existe para o aluno.
  if (!cron || (cron as any).status !== 'liberado') return { permitido: false, via: null }
  if ((cron as any).acesso_gratuito) return { permitido: true, via: 'gratuito' }

  const { data: matriculas } = await svc
    .from('simulado_cronograma_matriculas')
    .select('id, liberado, status')
    .eq('tenant_id', tid)
    .eq('estudante_id', estudanteId)
    .eq('cronograma_id', cronogramaId)
  const temMatricula = (matriculas ?? []).some((m: any) => (!m.status || m.status === 'ativa') && m.liberado !== false)
  if (temMatricula) return { permitido: true, via: 'matricula' }

  const { data: avulsos } = await svc
    .from('simulado_cronograma_acessos')
    .select('id, expira_em')
    .eq('tenant_id', tid)
    .eq('estudante_id', estudanteId)
    .eq('cronograma_id', cronogramaId)
    .gt('expira_em', new Date().toISOString())
    .limit(1)
  if ((avulsos ?? []).length) return { permitido: true, via: 'avulso' }

  return { permitido: false, via: null }
}

export type CronogramaDoAluno = {
  id: string
  slug: string
  nome: string
  subtitulo: string | null
  carga_horaria: number
  total_semanas: number
  dias_curso: number[]
  dias_nome: string[]
  semanas_revisao: number[]
  categoria_id: string | null
  via: ViaAcesso
}

/**
 * Catálogo visível para o aluno.
 *
 * A união dos ids é feita em MEMÓRIA (matrícula + avulso + gratuito + testador) e só
 * depois os cronogramas são buscados, com `fetchAllByIn` para furar o teto de 1000 linhas
 * do PostgREST — o mesmo padrão do portal de simulados.
 */
export async function cronogramasDoAluno(
  svc: any,
  tenantId: string | null,
  estudanteId: string,
): Promise<CronogramaDoAluno[]> {
  const tid = tenantId ?? SEM_TENANT
  const agora = new Date().toISOString()

  const [mats, avulsos, testes, gratuitos] = await Promise.all([
    svc
      .from('simulado_cronograma_matriculas')
      .select('cronograma_id, liberado, status')
      .eq('tenant_id', tid)
      .eq('estudante_id', estudanteId),
    svc
      .from('simulado_cronograma_acessos')
      .select('cronograma_id')
      .eq('tenant_id', tid)
      .eq('estudante_id', estudanteId)
      .gt('expira_em', agora),
    svc.from('simulado_cronograma_testadores').select('cronograma_id').eq('tenant_id', tid).eq('estudante_id', estudanteId),
    svc.from('simulado_cronogramas').select('id').eq('tenant_id', tid).eq('deletado', false).eq('status', 'liberado').eq('acesso_gratuito', true),
  ])

  // A via mais forte vence: testador > gratuito > matrícula > avulso.
  const via = new Map<string, ViaAcesso>()
  for (const a of (avulsos.data ?? []) as any[]) if (a.cronograma_id) via.set(a.cronograma_id, 'avulso')
  for (const m of (mats.data ?? []) as any[]) {
    if (m.cronograma_id && (!m.status || m.status === 'ativa') && m.liberado !== false) via.set(m.cronograma_id, 'matricula')
  }
  for (const g of (gratuitos.data ?? []) as any[]) via.set(g.id, 'gratuito')
  // Testador do módulo inteiro (cronograma_id null) é resolvido depois, sobre o catálogo.
  const testadorGeral = ((testes.data ?? []) as any[]).some((t) => !t.cronograma_id)
  for (const t of (testes.data ?? []) as any[]) if (t.cronograma_id) via.set(t.cronograma_id, 'testador')

  if (testadorGeral) {
    const { data: todos } = await svc.from('simulado_cronogramas').select('id').eq('tenant_id', tid).eq('deletado', false)
    for (const c of (todos ?? []) as any[]) if (!via.has(c.id)) via.set(c.id, 'testador')
  }

  const ids = [...via.keys()]
  if (!ids.length) return []

  const campos = 'id, slug, nome, subtitulo, carga_horaria, total_semanas, dias_curso, dias_nome, semanas_revisao, categoria_id, status'
  const linhas = await fetchAllByIn<any>(
    ids,
    (chunk) => svc.from('simulado_cronogramas').select(campos).in('id', chunk).eq('tenant_id', tid).eq('deletado', false) as any,
  )

  return linhas
    // Rascunho só aparece para quem é testador — para os demais o cronograma não existe.
    .filter((c) => c.status === 'liberado' || via.get(c.id) === 'testador')
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      nome: c.nome,
      subtitulo: c.subtitulo ?? null,
      carga_horaria: Number(c.carga_horaria),
      total_semanas: c.total_semanas,
      dias_curso: c.dias_curso ?? [],
      dias_nome: c.dias_nome ?? [],
      semanas_revisao: c.semanas_revisao ?? [],
      categoria_id: c.categoria_id ?? null,
      via: via.get(c.id) as ViaAcesso,
    }))
    .sort((a, b) => a.carga_horaria - b.carga_horaria || a.nome.localeCompare(b.nome, 'pt-BR'))
}
