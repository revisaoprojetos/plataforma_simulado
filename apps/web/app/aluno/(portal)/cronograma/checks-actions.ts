'use server'

/**
 * Metas concluídas — o aluno marca o que já fez, dentro de UMA emissão.
 *
 * O progresso pertence ao cronograma do aluno, não ao catálogo: dois alunos com o mesmo
 * cronograma têm progressos separados, e o mesmo aluno pode manter duas emissões do mesmo
 * cronograma com progressos diferentes.
 *
 * Marcar grava a linha; desmarcar apaga. A trilha de quem marcou, quando, e também as
 * DESMARCAÇÕES fica em simulado_audit_logs — que já é onde o resto do sistema registra
 * ator, IP e user-agent. Assim não inventamos um segundo lugar para procurar histórico.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { registrarAudit } from '@/lib/audit'

/** metaId → instante em que o aluno marcou (ISO). */
export type ChecksDaEmissao = Record<string, string>

/**
 * Confere que a emissão é MESMO deste aluno antes de deixar mexer.
 *
 * `emissaoId` chega do cliente: sem esta checagem, trocar o id na requisição marcaria
 * metas no cronograma de outra pessoa.
 */
async function daEmissao(emissaoId: string) {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false as const, error: 'Sua sessão expirou.' }

  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_cronograma_emissoes')
    .select('id')
    .eq('id', emissaoId)
    .eq('tenant_id', sessao.tenantId)
    .eq('estudante_id', sessao.estudanteId)
    .maybeSingle()
  if (!data) return { ok: false as const, error: 'Cronograma não encontrado.' }

  return { ok: true as const, sessao, svc }
}

export async function listarChecks(emissaoId: string): Promise<{ ok: boolean; checks?: ChecksDaEmissao; error?: string }> {
  const g = await daEmissao(emissaoId)
  if (!g.ok) return { ok: false, error: g.error }

  // fetchAll porque um cronograma longo passa de 1.000 metas — e, com ele, o número de
  // marcações. Um `.select()` cru truncaria em silêncio e o aluno veria metas "desmarcadas"
  // que ele já tinha concluído.
  const linhas = await fetchAll<{ meta_id: string; marcada_em: string }>(() =>
    g.svc
      .from('simulado_cronograma_meta_checks')
      .select('meta_id, marcada_em')
      .eq('tenant_id', g.sessao.tenantId)
      .eq('emissao_id', emissaoId)
      .order('meta_id') as never,
  )

  const checks: ChecksDaEmissao = {}
  for (const l of linhas) checks[l.meta_id] = l.marcada_em
  return { ok: true, checks }
}

/**
 * Marca ou desmarca uma meta. `data` e `titulo` são gravados junto para a linha continuar
 * legível se a meta sumir do catálogo (reimportação troca as metas por linhas novas).
 */
export async function alternarCheckMeta(
  emissaoId: string,
  metaId: string,
  marcar: boolean,
  meta?: { data?: string | null; titulo?: string | null },
): Promise<{ ok: boolean; marcadaEm?: string; error?: string }> {
  const g = await daEmissao(emissaoId)
  if (!g.ok) return { ok: false, error: g.error }

  if (!marcar) {
    const { error } = await g.svc
      .from('simulado_cronograma_meta_checks')
      .delete()
      .eq('tenant_id', g.sessao.tenantId)
      .eq('emissao_id', emissaoId)
      .eq('meta_id', metaId)
    if (error) return { ok: false, error: error.message }

    await registrarAudit({
      operacao: 'DELETE',
      entidade: 'simulado_cronograma_meta_checks',
      entidadeId: metaId,
      antes: { marcada: true, emissao_id: emissaoId, titulo: meta?.titulo ?? null },
      depois: { marcada: false },
      atorTipo: 'estudante',
      atorId: g.sessao.estudanteId,
      tenantId: g.sessao.tenantId,
    })
    return { ok: true }
  }

  const marcadaEm = new Date().toISOString()
  // upsert em vez de insert: dois cliques rápidos na mesma meta não podem virar erro de
  // chave duplicada na cara do aluno.
  const { error } = await g.svc.from('simulado_cronograma_meta_checks').upsert(
    {
      tenant_id: g.sessao.tenantId,
      emissao_id: emissaoId,
      estudante_id: g.sessao.estudanteId,
      meta_id: metaId,
      data: meta?.data ?? null,
      titulo: meta?.titulo ?? null,
      marcada_em: marcadaEm,
    },
    { onConflict: 'emissao_id,meta_id' },
  )
  if (error) return { ok: false, error: error.message }

  await registrarAudit({
    operacao: 'INSERT',
    entidade: 'simulado_cronograma_meta_checks',
    entidadeId: metaId,
    depois: { marcada: true, marcada_em: marcadaEm, emissao_id: emissaoId, titulo: meta?.titulo ?? null },
    atorTipo: 'estudante',
    atorId: g.sessao.estudanteId,
    tenantId: g.sessao.tenantId,
  })
  return { ok: true, marcadaEm }
}
