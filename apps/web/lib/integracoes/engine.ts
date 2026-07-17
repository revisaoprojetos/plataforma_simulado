import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
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
 * Auto-provisiona 1 GRUPO por PRODUTO: se o produto ainda não tem mapeamento, cria (ou reusa,
 * por nome) um grupo com o nome do produto e registra o mapeamento produto→grupo. Assim todo
 * comprador daquele produto já cai no mesmo grupo — o admin depois liga o grupo aos simulados.
 * Idempotente: reusa grupo pelo nome e o mapeamento tem UNIQUE(tenant,provider,fonte_ref).
 */
async function garantirMapeamentoAuto(svc: any, tenantId: string, provider: Provider, produtoRef: string, produtoNome: string | null): Promise<Mapeamento | null> {
  const existente = await resolverMapeamento(svc, tenantId, provider, produtoRef)
  if (existente) return existente

  const nomeGrupo = (produtoNome?.trim() || `Produto ${produtoRef}`).slice(0, 120)
  let grupoId: string | null = null
  try {
    // reusa grupo com o mesmo nome (evita duplicar em recompras/concorrência)
    const { data: gExist } = await svc.from('simulado_grupos').select('id').eq('tenant_id', tenantId).eq('nome', nomeGrupo).eq('deletado', false).maybeSingle()
    grupoId = gExist?.id ?? null
    if (!grupoId) {
      const { data: gNovo } = await svc.from('simulado_grupos').insert({ tenant_id: tenantId, nome: nomeGrupo }).select('id').single()
      grupoId = gNovo?.id ?? null
    }
  } catch { /* falha ao criar/achar grupo */ }
  if (!grupoId) return null

  try {
    await svc.from('simulado_integracao_mapeamentos').upsert(
      { tenant_id: tenantId, provider, fonte_ref: produtoRef, fonte_nome: produtoNome ?? produtoRef, grupo_id: grupoId, ativo: true },
      { onConflict: 'tenant_id,provider,fonte_ref' },
    )
  } catch { /* ignora — segue com o grupo resolvido */ }

  const final = await resolverMapeamento(svc, tenantId, provider, produtoRef)
  return final ?? { fonteRef: produtoRef, classificacao: null, grupoId, simuladoId: null }
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

  let m = await resolverMapeamento(svc, tenantId, provider, entitlement.produtoRef)
  if (!m && entitlement.status === 'ativo') {
    // Sem mapeamento + compra ativa → auto-cria grupo por produto e aloca (nada fica sem grupo).
    m = await garantirMapeamentoAuto(svc, tenantId, provider, entitlement.produtoRef, entitlement.produtoNome ?? null)
  }
  if (!m) {
    // Produto sem mapeamento (ex.: cancelamento de produto nunca comprado) → só cadastro.
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

export interface ResumoReprocesso { total: number; concedidos: number; semMapeamento: number; semEstudante: number; erros: number; produtosSemMapa: string[] }

/**
 * REPROCESSA as liberações a partir do histórico de assinaturas ATIVAS (recuperação de erro):
 * re-aplica o `conceder` para cada assinatura ativa cujo produto está mapeado — idempotente
 * (quem já está no grupo/simulado não muda). Corrige quem comprou mas não ficou alocado
 * (ex.: produto mapeado depois, falha no webhook). Não revoga nada.
 * `soProduto` opcional limita a um produto (fonte_ref).
 */
export async function reaplicarLiberacoes(tenantId: string, provider: Provider, soProduto?: string): Promise<ResumoReprocesso> {
  const svc = createAdminClient()
  const ativas = await fetchAll<{ estudante_id: string; produto_ref: string }>(() => {
    let q = svc.from('simulado_assinaturas').select('estudante_id, produto_ref').eq('tenant_id', tenantId).eq('provider', provider).eq('status', 'ativo')
    if (soProduto) q = q.eq('produto_ref', soProduto)
    return q.order('estudante_id', { ascending: true })
  })

  const cacheMapa = new Map<string, Mapeamento | null>()
  const produtosSemMapa = new Set<string>()
  let concedidos = 0, semMapeamento = 0, semEstudante = 0, erros = 0
  for (const a of ativas) {
    if (!a.estudante_id) { semEstudante++; continue }
    try {
      if (!cacheMapa.has(a.produto_ref)) cacheMapa.set(a.produto_ref, await resolverMapeamento(svc, tenantId, provider, a.produto_ref))
      const m = cacheMapa.get(a.produto_ref) ?? null
      if (!m) { semMapeamento++; produtosSemMapa.add(a.produto_ref); continue }
      await conceder(svc, tenantId, a.estudante_id, m)
      concedidos++
    } catch { erros++ }
  }
  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_assinaturas', entidadeId: tenantId, tenantId, depois: { acao: 'reprocessar', provider, soProduto: soProduto ?? null, total: ativas.length, concedidos, semMapeamento, erros } }).catch(() => {})
  return { total: ativas.length, concedidos, semMapeamento, semEstudante, erros, produtosSemMapa: [...produtosSemMapa] }
}
