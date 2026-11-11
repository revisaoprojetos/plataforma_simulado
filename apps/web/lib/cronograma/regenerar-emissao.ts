import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { verificarAcessoCronograma } from '@/lib/cronograma/acesso'
import { montarGradePadrao, CAMPOS_CRONOGRAMA } from '@/lib/cronograma/montar-grade-padrao'
import { dataISOValida } from '@/lib/cronograma/integridade'
import { colunaAusente, lerVersaoGrade } from '@/lib/cronograma/compat-legado'
import { lerProgressoReencaixado } from '@/lib/cronograma/progresso-emissao'
import type { OpcoesGeracao } from '@/lib/cronograma/tipos'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function dataRecessoValida(r: unknown): r is OpcoesGeracao['recesso'] {
  const x = r as { modo?: string; de?: unknown; ate?: unknown } | null
  if (!x || typeof x.modo !== 'string') return false
  return (x.de == null || dataISOValida(x.de)) && (x.ate == null || dataISOValida(x.ate))
}

/**
 * Gera de novo uma emissão marcada como `desatualizada`: cria uma NOVA emissão a partir do mesmo
 * formulário (grade e calendário frescos) e migra checks/notas — pela meta_id quando ela ainda
 * existe, ou pela chave estável (`chave_meta`) quando a meta foi recriada. A emissão antiga é
 * mantida intacta (o aluno pode arquivá-la). Nada é alterado em silêncio: só roda por ação explícita.
 */
export async function regenerarEmissaoDoAluno(
  sessao: { tenantId: string; estudanteId: string; nome?: string | null },
  emissaoId: string,
): Promise<{ ok: boolean; emissaoId?: string; reaproveitada?: boolean; migradas?: { checks: number; notas: number }; error?: string }> {
  if (!UUID_RE.test(emissaoId)) return { ok: false, error: 'Cronograma não encontrado.' }
  const svc = createAdminClient()

  const { data: velha } = await svc
    .from('simulado_cronograma_emissoes')
    .select('id, cronograma_id, cronograma_slug, cronograma_nome, titulo, formulario, via_acesso, is_teste')
    .eq('id', emissaoId)
    .eq('tenant_id', sessao.tenantId)
    .eq('estudante_id', sessao.estudanteId)
    .maybeSingle()
  if (!velha) return { ok: false, error: 'Cronograma não encontrado.' }
  const v = velha as { cronograma_id: string; cronograma_slug: string; cronograma_nome: string; titulo: string | null; formulario: Record<string, any> | null; via_acesso: string | null; is_teste: boolean }

  const acesso = await verificarAcessoCronograma(svc, sessao.tenantId, sessao.estudanteId, v.cronograma_id)
  if (!acesso.permitido) return { ok: false, error: 'Você não tem acesso a este cronograma.' }
  const { data: cron } = await svc.from('simulado_cronogramas').select(CAMPOS_CRONOGRAMA).eq('id', v.cronograma_id).eq('tenant_id', sessao.tenantId).eq('deletado', false).maybeSingle()
  if (!cron) return { ok: false, error: 'Cronograma não encontrado.' }

  const f = v.formulario ?? {}
  if (!dataISOValida(f.inicio)) return { ok: false, error: 'A data de início desta emissão é inválida. Crie um novo cronograma.' }
  const opcoes: OpcoesGeracao = { inicio: f.inicio, revisao: f.revisao ?? { ativo: false, cada: 12 }, recesso: dataRecessoValida(f.recesso) ? f.recesso : { modo: 'nenhum' } }

  // Idempotência / duplo clique: se esta emissão já foi regenerada há instantes, devolve a mesma (não duplica).
  const desde = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: recente } = await svc
    .from('simulado_cronograma_emissoes')
    .select('id')
    .eq('tenant_id', sessao.tenantId)
    .eq('estudante_id', sessao.estudanteId)
    .contains('formulario', { regeneradaDe: emissaoId })
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (recente) return { ok: true, emissaoId: (recente as { id: string }).id, reaproveitada: true, migradas: { checks: 0, notas: 0 } }

  const versao = await lerVersaoGrade(svc, sessao.tenantId, v.cronograma_id)
  const r = await montarGradePadrao(svc, sessao.tenantId, cron, opcoes) // SEM calendário: gera fresco
  if (!r.ok) return { ok: false, error: r.erro }

  const base: Record<string, unknown> = {
    tenant_id: sessao.tenantId,
    cronograma_id: v.cronograma_id,
    cronograma_slug: v.cronograma_slug,
    cronograma_nome: v.cronograma_nome,
    estudante_id: sessao.estudanteId,
    estudante_nome: sessao.nome ?? null,
    ator_tipo: 'estudante',
    ator_id: sessao.estudanteId,
    via_acesso: acesso.via,
    titulo: v.titulo,
    formulario: { ...(v.formulario ?? {}), regeneradaDe: emissaoId },
    resumo: r.grade.resumo,
    is_teste: v.is_teste,
  }
  let ins = await svc.from('simulado_cronograma_emissoes').insert(versao != null ? { ...base, versao_grade: versao, grade_snapshot: r.calendario } : base).select('id').single()
  if (ins.error && versao != null && colunaAusente(ins.error)) ins = await svc.from('simulado_cronograma_emissoes').insert(base).select('id').single()
  if (ins.error || !ins.data) return { ok: false, error: ins.error?.message ?? 'Não foi possível gerar novamente.' }
  const novaId = (ins.data as { id: string }).id

  // Migra progresso: lerProgressoReencaixado já devolve cada linha apontando para a meta ATUAL.
  const idsAtuais = new Set((await fetchAll<{ id: string }>(() => svc.from('simulado_cronograma_metas').select('id').eq('tenant_id', sessao.tenantId).eq('cronograma_id', v.cronograma_id).order('id') as never)).map((m) => m.id))
  const checks = (await lerProgressoReencaixado<{ marcada_em: string; data: string | null; titulo: string | null; chave_meta?: string | null }>(svc, sessao.tenantId, v.cronograma_id, emissaoId, 'simulado_cronograma_meta_checks', 'marcada_em, data, titulo')).filter((l) => idsAtuais.has(l.meta_id))
  const notas = (await lerProgressoReencaixado<{ texto: string; data: string | null; titulo: string | null; chave_meta?: string | null }>(svc, sessao.tenantId, v.cronograma_id, emissaoId, 'simulado_cronograma_meta_notas', 'texto, data, titulo')).filter((l) => idsAtuais.has(l.meta_id))
  const em = { tenant_id: sessao.tenantId, emissao_id: novaId, estudante_id: sessao.estudanteId }
  const lote = 500
  let nChecks = 0
  let nNotas = 0
  for (let i = 0; i < checks.length; i += lote) {
    const { error } = await svc.from('simulado_cronograma_meta_checks').insert(checks.slice(i, i + lote).map((c) => ({ ...em, meta_id: c.meta_id, data: c.data, titulo: c.titulo, marcada_em: c.marcada_em, ...(c.chave_meta ? { chave_meta: c.chave_meta } : {}) })))
    if (error) return { ok: true, emissaoId: novaId, migradas: { checks: nChecks, notas: nNotas }, error: `Progresso migrado parcialmente: ${error.message}` }
    nChecks += Math.min(lote, checks.length - i)
  }
  for (let i = 0; i < notas.length; i += lote) {
    const { error } = await svc.from('simulado_cronograma_meta_notas').insert(notas.slice(i, i + lote).map((c) => ({ ...em, meta_id: c.meta_id, texto: c.texto, data: c.data, titulo: c.titulo, ...(c.chave_meta ? { chave_meta: c.chave_meta } : {}) })))
    if (error) return { ok: true, emissaoId: novaId, migradas: { checks: nChecks, notas: nNotas }, error: `Anotações migradas parcialmente: ${error.message}` }
    nNotas += Math.min(lote, notas.length - i)
  }
  return { ok: true, emissaoId: novaId, migradas: { checks: nChecks, notas: nNotas } }
}

