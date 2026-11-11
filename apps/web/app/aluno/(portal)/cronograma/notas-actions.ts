'use server'
import type { NotasDaEmissao } from './notas-actions-tipos'

/**
 * Anotações pessoais do aluno em cada meta.
 *
 * O check responde "fiz"; a anotação responde "o que aconteceu quando fiz". São informações
 * diferentes e por isso tabelas diferentes — juntar as duas obrigaria toda leitura de progresso
 * a carregar texto que ela não usa.
 *
 * A nota pertence à EMISSÃO: dois alunos com o mesmo cronograma escrevem coisas diferentes na
 * mesma aula, e o mesmo aluno pode ter duas emissões com anotações independentes.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { metaDoCronograma, UUID_META_RE } from '@/lib/cronograma/meta-valida'
import { lerProgressoReencaixado } from '@/lib/cronograma/progresso-emissao'
import { chavesDasMetas, colunaAusente } from '@/lib/cronograma/compat-legado'

/** Confere que a emissão é MESMO deste aluno — o id vem do cliente. */
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

export async function listarNotas(emissaoId: string): Promise<{ ok: boolean; notas?: NotasDaEmissao; error?: string }> {
  const g = await daEmissao(emissaoId)
  if (!g.ok) return { ok: false, error: g.error }

  // fetchAll pelo mesmo motivo dos checks: um cronograma longo passa de 1.000 metas, e uma
  // anotação que não voltasse apareceria como "nunca escrevi isso".
  const linhas = await lerProgressoReencaixado<{ texto: string }>(g.svc, g.sessao.tenantId, g.cronogramaId, emissaoId, 'simulado_cronograma_meta_notas', 'texto')

  const notas: NotasDaEmissao = {}
  for (const l of linhas) notas[l.meta_id] = l.texto
  return { ok: true, notas }
}

/**
 * Grava a anotação. Texto vazio APAGA a linha — "sem anotação" e "anotação em branco" são a
 * mesma coisa para quem lê, e guardar vazio faria toda leitura filtrar por isso.
 *
 * Sem auditoria de propósito: é conteúdo pessoal do aluno na área dele, não ação
 * administrativa. Registrar cada tecla num log que a equipe lê seria vigiar, não auditar.
 */
export async function salvarNota(
  emissaoId: string,
  metaId: string,
  texto: string,
  meta?: { data?: string | null; titulo?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const g = await daEmissao(emissaoId)
  if (!g.ok) return { ok: false, error: g.error }

  if (!UUID_META_RE.test(metaId)) return { ok: false, error: 'Meta inválida.' }
  const limpo = texto.trim().slice(0, 4000)

  if (!limpo) {
    const { error } = await g.svc
      .from('simulado_cronograma_meta_notas')
      .delete()
      .eq('tenant_id', g.sessao.tenantId)
      .eq('emissao_id', emissaoId)
      .eq('meta_id', metaId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  if (!(await metaDoCronograma(g.svc, g.sessao.tenantId, g.cronogramaId, metaId))) return { ok: false, error: 'Meta não pertence a este cronograma.' }
  const linha: Record<string, unknown> = {
    tenant_id: g.sessao.tenantId,
    emissao_id: emissaoId,
    estudante_id: g.sessao.estudanteId,
    meta_id: metaId,
    texto: limpo,
    data: meta?.data ?? null,
    titulo: meta?.titulo ?? null,
  }
  const chave = (await chavesDasMetas(g.svc, g.sessao.tenantId, [metaId])).get(metaId) ?? null
  let { error } = await g.svc.from('simulado_cronograma_meta_notas').upsert(chave ? { ...linha, chave_meta: chave } : linha, { onConflict: 'emissao_id,meta_id' })
  if (error && chave && colunaAusente(error)) {
    ;({ error } = await g.svc.from('simulado_cronograma_meta_notas').upsert(linha, { onConflict: 'emissao_id,meta_id' }))
  }
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** As anotações de uma emissão, para o render por token (PDF, sem sessão do aluno). */
export async function notasParaRender(emissaoId: string, tenantId: string): Promise<NotasDaEmissao> {
  const svc = createAdminClient()
  const { data: em } = await svc.from('simulado_cronograma_emissoes').select('cronograma_id').eq('id', emissaoId).eq('tenant_id', tenantId).maybeSingle()
  const cronogramaId = (em as { cronograma_id?: string } | null)?.cronograma_id
  if (!cronogramaId) return {}
  const linhas = await lerProgressoReencaixado<{ texto: string }>(svc, tenantId, cronogramaId, emissaoId, 'simulado_cronograma_meta_notas', 'texto')
  const notas: NotasDaEmissao = {}
  for (const l of linhas) notas[l.meta_id] = l.texto
  return notas
}
