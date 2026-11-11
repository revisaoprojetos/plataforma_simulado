'use server'
import type { ChecksDaEmissao } from './checks-actions-tipos'

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
import { metaDoCronograma, UUID_META_RE } from '@/lib/cronograma/meta-valida'
import { registrarAudit } from '@/lib/audit'
import { atualizarPainelSnapshot } from '@/lib/painel/snapshot'
import { emissaoEhFixada } from '@/lib/cronograma/fixar'
import { lerProgressoReencaixado, progressoDaEmissao } from '@/lib/cronograma/progresso-emissao'
import { chavesDasMetas, colunaAusente } from '@/lib/cronograma/compat-legado'
import type { ProgressoEmissao } from '@/lib/cronograma/progresso-tipos'

// Write-behind (backend-first §6): marcar/desmarcar meta de emissão FIXADA muda as metas de hoje e a semana → recomputa o
// snapshot do Painel (emissão não fixada: no-op). Fica AQUI (mutação compartilhada) p/ cobrir tanto o Painel quanto a página
// de Cronograma num só ponto. Best-effort, não bloqueia a resposta da ação ao aluno.
function refrescarSnapshotsMetas(svc: ReturnType<typeof createAdminClient>, tenantId: string, estId: string, emissaoId: string): void {
  void (async () => {
    // Só a emissão FIXADA alimenta o Painel. Não fixada → nada a recomputar (antes recomputava Painel+Início a cada clique).
    // O Início lê só o Adaptativo, por isso não é recomputado aqui.
    if (!(await emissaoEhFixada(svc, tenantId, emissaoId))) return
    await atualizarPainelSnapshot(svc, tenantId, estId)
  })().catch(() => {})
}

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
    .select('id, cronograma_id')
    .eq('id', emissaoId)
    .eq('tenant_id', sessao.tenantId)
    .eq('estudante_id', sessao.estudanteId)
    .maybeSingle()
  if (!data) return { ok: false as const, error: 'Cronograma não encontrado.' }

  return { ok: true as const, sessao, svc, cronogramaId: (data as { cronograma_id: string }).cronograma_id }
}

export async function listarChecks(emissaoId: string): Promise<{ ok: boolean; checks?: ChecksDaEmissao; error?: string }> {
  const g = await daEmissao(emissaoId)
  if (!g.ok) return { ok: false, error: g.error }

  // fetchAll porque um cronograma longo passa de 1.000 metas — e, com ele, o número de
  // marcações. Um `.select()` cru truncaria em silêncio e o aluno veria metas "desmarcadas"
  // que ele já tinha concluído.
  // Reencaixa por chave estável as marcações cuja meta foi recriada (ver lib/cronograma/progresso-emissao.ts).
  const linhas = await lerProgressoReencaixado<{ marcada_em: string }>(g.svc, g.sessao.tenantId, g.cronogramaId, emissaoId, 'simulado_cronograma_meta_checks', 'marcada_em')

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
): Promise<{ ok: boolean; marcadaEm?: string; progresso?: ProgressoEmissao; error?: string }> {
  const g = await daEmissao(emissaoId)
  if (!g.ok) return { ok: false, error: g.error }
  // metaId vem do cliente: UUID (senão 500) e, ao marcar, meta DESTE cronograma (desmarcar aceita meta órfã de reimportação).
  if (!UUID_META_RE.test(metaId)) return { ok: false, error: 'Meta inválida.' }
  if (marcar && !(await metaDoCronograma(g.svc, g.sessao.tenantId, g.cronogramaId, metaId))) return { ok: false, error: 'Meta não pertence a este cronograma.' }

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
    refrescarSnapshotsMetas(g.svc, g.sessao.tenantId, g.sessao.estudanteId, emissaoId)
    return { ok: true, progresso: await progressoDaEmissao(g.svc, g.sessao.tenantId, g.cronogramaId, emissaoId) }
  }

  const marcadaEm = new Date().toISOString()
  // upsert em vez de insert: dois cliques rápidos na mesma meta não podem virar erro de
  // chave duplicada na cara do aluno.
  const linha: Record<string, unknown> = {
    tenant_id: g.sessao.tenantId,
    emissao_id: emissaoId,
    estudante_id: g.sessao.estudanteId,
    meta_id: metaId,
    data: meta?.data ?? null,
    titulo: meta?.titulo ?? null,
    marcada_em: marcadaEm,
  }
  // chave_meta = chave estável da meta (permite reencaixar se a meta for recriada). Coluna ausente => grava sem ela.
  const chave = (await chavesDasMetas(g.svc, g.sessao.tenantId, [metaId])).get(metaId) ?? null
  let { error } = await g.svc.from('simulado_cronograma_meta_checks').upsert(chave ? { ...linha, chave_meta: chave } : linha, { onConflict: 'emissao_id,meta_id' })
  if (error && chave && colunaAusente(error)) {
    ;({ error } = await g.svc.from('simulado_cronograma_meta_checks').upsert(linha, { onConflict: 'emissao_id,meta_id' }))
  }
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
  refrescarSnapshotsMetas(g.svc, g.sessao.tenantId, g.sessao.estudanteId, emissaoId)
  return { ok: true, marcadaEm, progresso: await progressoDaEmissao(g.svc, g.sessao.tenantId, g.cronogramaId, emissaoId) }
}
