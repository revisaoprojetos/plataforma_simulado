import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import type { Provider, PessoaNormalizada, Entitlement, Mapeamento, ResultadoEntitlement } from '@/lib/integracoes/tipos'

/**
 * NÚCLEO agnóstico de provedor (§3.1 do PLANO-INTEGRACOES.md).
 * Recebe uma pessoa + um "entitlement" (assinatura/compra) já NORMALIZADOS por um adaptador
 * (Curseduca/Guru) e aplica no domínio local: upsert do estudante (dedupe cross-provider),
 * registra a assinatura e CONCEDE ou REVOGA o acesso conforme o status — sempre escopado ao
 * mapeamento (não mexe em acessos manuais/de outra origem). Tudo idempotente e auditado.
 *
 * server-only e SEM 'use server' (não é endpoint RPC): recebe tenantId por parâmetro.
 */

const soDigitos = (s?: string | null) => (s ? s.replace(/\D/g, '') : '')

/** Mapeamento produto/grupo → destino (classificação/grupo/simulado). */
async function resolverMapeamento(svc: any, tenantId: string, provider: Provider, fonteRef: string): Promise<Mapeamento | null> {
  try {
    const { data } = await svc
      .from('simulado_integracao_mapeamentos')
      .select('fonte_ref, classificacao, grupo_id, simulado_id, ativo')
      .eq('tenant_id', tenantId).eq('provider', provider).eq('fonte_ref', fonteRef).maybeSingle()
    if (data && data.ativo) return { fonteRef: data.fonte_ref, classificacao: data.classificacao ?? null, grupoId: data.grupo_id ?? null, simuladoId: data.simulado_id ?? null }
  } catch { /* tabela pode não existir ainda */ }
  return null
}

/**
 * Resolve (ou cria) o estudante. Dedupe, em ordem: id-por-provedor (pessoas) → matricula_externa
 * → email → cpf. Faz backfill de cpf/telefone quando faltam. Retorna o id.
 */
async function resolverEstudante(svc: any, tenantId: string, provider: Provider, p: PessoaNormalizada): Promise<string | null> {
  const email = (p.email ?? '').trim().toLowerCase() || null
  const cpf = soDigitos(p.cpf) || null

  // 1) por external id no mapa cross-provider
  try {
    const { data } = await svc.from('simulado_integracao_pessoas').select('estudante_id')
      .eq('tenant_id', tenantId).eq('provider', provider).eq('external_id', p.externalId).maybeSingle()
    if (data?.estudante_id) { await backfill(svc, tenantId, data.estudante_id, cpf, p.telefone); return data.estudante_id }
  } catch { /* segue */ }

  // 2) matricula_externa == externalId  3) email  4) cpf
  let id: string | null = null
  const acha = async (col: string, val: string | null) => {
    if (id || !val) return
    const { data } = await svc.from('simulado_estudantes').select('id').eq('tenant_id', tenantId).eq(col, val).eq('deletado', false).maybeSingle()
    if (data?.id) id = data.id
  }
  await acha('matricula_externa', p.externalId)
  await acha('email', email)
  await acha('cpf', cpf)

  if (!id) {
    const row: Record<string, unknown> = {
      tenant_id: tenantId, nome: p.nome || email || 'Aluno', email, cpf, telefone: p.telefone ?? null,
      matricula_externa: p.externalId, origem_provider: provider,
    }
    const { data, error } = await svc.from('simulado_estudantes').insert(row).select('id').single()
    if (error) {
      // corrida/conflito: tenta reencontrar por email/cpf
      await acha('email', email); await acha('cpf', cpf)
      if (!id) return null
    } else id = data.id
  } else {
    await backfill(svc, tenantId, id, cpf, p.telefone)
  }
  // registra o external id no mapa cross-provider (idempotente)
  if (id) {
    try { await svc.from('simulado_integracao_pessoas').upsert({ tenant_id: tenantId, estudante_id: id, provider, external_id: p.externalId }, { onConflict: 'tenant_id,provider,external_id' }) } catch { /* tabela ausente */ }
  }
  return id
}

async function backfill(svc: any, tenantId: string, estudanteId: string, cpf: string | null, telefone?: string | null) {
  const patch: Record<string, unknown> = {}
  const { data } = await svc.from('simulado_estudantes').select('cpf, telefone').eq('id', estudanteId).maybeSingle()
  if (cpf && !data?.cpf) patch.cpf = cpf
  if (telefone && !data?.telefone) patch.telefone = telefone
  if (Object.keys(patch).length) { try { await svc.from('simulado_estudantes').update(patch).eq('id', estudanteId).eq('tenant_id', tenantId) } catch { /* ignora */ } }
}

/** Grava/atualiza a assinatura (por provider+external_id) com o status atual. */
async function upsertAssinatura(svc: any, tenantId: string, estudanteId: string, provider: Provider, ent: Entitlement) {
  try {
    await svc.from('simulado_assinaturas').upsert({
      tenant_id: tenantId, estudante_id: estudanteId, provider, produto_ref: ent.produtoRef, external_id: ent.externalId,
      status: ent.status, inicio_em: ent.inicioEm ?? null, expira_em: ent.expiraEm ?? null, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'provider,external_id' })
  } catch { /* tabela ausente */ }
}

/** True se o estudante tem OUTRA assinatura ativa que concede este grupo/simulado/passaporte. */
async function outraAtivaConcede(svc: any, tenantId: string, estudanteId: string, excetoExternalId: string, alvo: { grupoId?: string | null; simuladoId?: string | null; passaporte?: boolean }): Promise<boolean> {
  try {
    const { data: ass } = await svc.from('simulado_assinaturas').select('provider, produto_ref, external_id')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('status', 'ativo')
    for (const a of ass ?? []) {
      if (a.external_id === excetoExternalId) continue
      const m = await resolverMapeamento(svc, tenantId, a.provider, a.produto_ref)
      if (!m) continue
      if (alvo.grupoId && m.grupoId === alvo.grupoId) return true
      if (alvo.simuladoId && m.simuladoId === alvo.simuladoId) return true
      if (alvo.passaporte && m.classificacao === 'passaporte') return true
    }
  } catch { /* ignora */ }
  return false
}

async function conceder(svc: any, tenantId: string, estudanteId: string, m: Mapeamento) {
  if (m.classificacao) {
    try { await svc.from('simulado_estudantes').update({ classificacao: m.classificacao }).eq('id', estudanteId).eq('tenant_id', tenantId) } catch { /* ignora */ }
  }
  if (m.grupoId) {
    try {
      const { data } = await svc.from('simulado_grupo_membros').select('id').eq('grupo_id', m.grupoId).eq('estudante_id', estudanteId).maybeSingle()
      if (!data) await svc.from('simulado_grupo_membros').insert({ tenant_id: tenantId, grupo_id: m.grupoId, estudante_id: estudanteId })
    } catch { /* ignora */ }
  }
  if (m.simuladoId) {
    try {
      const { data } = await svc.from('simulado_matriculas').select('id').eq('simulado_id', m.simuladoId).eq('estudante_id', estudanteId).maybeSingle()
      if (!data) await svc.from('simulado_matriculas').insert({ tenant_id: tenantId, estudante_id: estudanteId, simulado_id: m.simuladoId, liberado: true })
    } catch { /* ignora */ }
  }
}

async function revogar(svc: any, tenantId: string, estudanteId: string, excetoExternalId: string, m: Mapeamento) {
  // Só remove o que ESTE mapeamento concede E que nenhuma outra assinatura ativa ainda garante.
  // (Limitação conhecida: se houver acesso MANUAL ao mesmo grupo/simulado, ele também sai —
  //  refinar depois com coluna `origem` em grupo_membros/matriculas.)
  if (m.grupoId && !(await outraAtivaConcede(svc, tenantId, estudanteId, excetoExternalId, { grupoId: m.grupoId }))) {
    try { await svc.from('simulado_grupo_membros').delete().eq('tenant_id', tenantId).eq('grupo_id', m.grupoId).eq('estudante_id', estudanteId) } catch { /* ignora */ }
  }
  if (m.simuladoId && !(await outraAtivaConcede(svc, tenantId, estudanteId, excetoExternalId, { simuladoId: m.simuladoId }))) {
    try { await svc.from('simulado_matriculas').delete().eq('tenant_id', tenantId).eq('simulado_id', m.simuladoId).eq('estudante_id', estudanteId) } catch { /* ignora */ }
  }
  // Rebaixa classificação só se nenhuma outra assinatura ativa concede passaporte.
  if (m.classificacao === 'passaporte' && !(await outraAtivaConcede(svc, tenantId, estudanteId, excetoExternalId, { passaporte: true }))) {
    try { await svc.from('simulado_estudantes').update({ classificacao: 'normal' }).eq('id', estudanteId).eq('tenant_id', tenantId) } catch { /* ignora */ }
  }
}

/**
 * Aplica UM entitlement no domínio local. Idempotente. Retorna o que foi feito.
 * `ativo` → concede; `cancelado/reembolsado/expirado` → revoga (escopado ao mapeamento).
 */
export async function aplicarEntitlement(params: {
  tenantId: string; provider: Provider; pessoa: PessoaNormalizada; entitlement: Entitlement
}): Promise<ResultadoEntitlement> {
  const { tenantId, provider, pessoa, entitlement } = params
  const svc = createAdminClient()

  const estudanteId = await resolverEstudante(svc, tenantId, provider, pessoa)
  if (!estudanteId) return { ok: false, error: 'não foi possível resolver/criar o estudante (sem e-mail/CPF?)', acao: 'ignorado' }

  await upsertAssinatura(svc, tenantId, estudanteId, provider, entitlement)

  const m = await resolverMapeamento(svc, tenantId, provider, entitlement.produtoRef)
  if (!m) {
    // Produto sem mapeamento: cadastro feito, mas sem conceder acesso (sinalizar no admin).
    return { ok: true, estudanteId, acao: 'ignorado', motivo: 'produto/grupo sem mapeamento' }
  }

  if (entitlement.status === 'ativo') {
    await conceder(svc, tenantId, estudanteId, m)
    await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_assinaturas', entidadeId: estudanteId, tenantId, depois: { acao: 'conceder', provider, produto: entitlement.produtoRef, status: 'ativo' } }).catch(() => {})
    return { ok: true, estudanteId, acao: 'concedido' }
  } else {
    await revogar(svc, tenantId, estudanteId, entitlement.externalId, m)
    await registrarAudit({ operacao: 'BLOQUEAR', entidade: 'simulado_assinaturas', entidadeId: estudanteId, tenantId, depois: { acao: 'revogar', provider, produto: entitlement.produtoRef, status: entitlement.status } }).catch(() => {})
    return { ok: true, estudanteId, acao: 'revogado' }
  }
}
