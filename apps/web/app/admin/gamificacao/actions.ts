'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { rebuildCacheTenant } from '@/lib/gamificacao/cache'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { selecionarGrupos } from '@/lib/simulado/grupos'
import { grupoContagensSql } from 'data'
import { DEFAULT_CONFIG, type XpRegras, type NivelCurva, type LigaDef, type MissaoDef, type MissoesConfig, type ConquistaDef, type PublicoModo } from '@/lib/gamificacao/config'
import { resolverEngajamento, type EngajamentoConfig } from '@/lib/gamificacao/engajamento-tipos'
import type { EstudanteAcessoLinha } from '@/app/admin/leitura/actions'

/** Grupo no seletor do público, com hierarquia (pasta mestre/pai), contagem, origem e se já está vinculado. */
export type GrupoPublicoOpc = { id: string; nome: string; cor: string | null; atribuido: boolean; is_mestre: boolean; pai_id: string | null; membros: number; origem: 'guru' | 'curseduca' | null }

const SEM_TENANT = '00000000-0000-0000-0000-000000000000'

// Carrega a config atual (ou os defaults) e faz merge das colunas alteradas, preservando o resto.
async function salvarSlice(patch: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
  if (!(await checkPermission('gamificacao:manage'))) return { error: 'Você não tem permissão para gerenciar a gamificação.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido.' }
  const svc = createAdminClient()

  const { data: antes } = await svc.from('simulado_gamificacao_config').select('*').eq('tenant_id', tenantId).maybeSingle()
  const base: any = antes ?? { tenant_id: tenantId, ...DEFAULT_CONFIG }
  const row: any = { ...base, ...patch, tenant_id: tenantId }
  delete row.id; delete row.created_at; delete row.updated_at; delete row.publicoModo

  const { error } = await svc.from('simulado_gamificacao_config').upsert(row, { onConflict: 'tenant_id' })
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_gamificacao_config', entidadeId: tenantId, antes, depois: row })
  revalidatePath('/admin/gamificacao')
  return { ok: true }
}

// Lê o xp_regras atual (p/ merge nested — XP&Níveis e Regras gerais editam fatias diferentes dele).
async function xpRegrasAtual(svc: any, tenantId: string): Promise<XpRegras> {
  const { data } = await svc.from('simulado_gamificacao_config').select('xp_regras').eq('tenant_id', tenantId).maybeSingle()
  return { ...DEFAULT_CONFIG.xp_regras, ...(data?.xp_regras ?? {}) }
}

export async function salvarXpNiveis(d: { simulado: XpRegras['simulado']; pratica: XpRegras['pratica']; nivel_curva: NivelCurva }) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido.' }
  const xp = await xpRegrasAtual(createAdminClient(), tenantId)
  return salvarSlice({ xp_regras: { ...xp, simulado: d.simulado, pratica: d.pratica }, nivel_curva: d.nivel_curva })
}

export async function salvarRegrasGerais(d: { ativo: boolean; timezone: string; streak: XpRegras['streak']; chest: XpRegras['chest']; fim_semana: XpRegras['fim_semana']; meta_dia: XpRegras['meta_dia']; trilha_estilo?: 'cards' | 'caminho'; trilha_visiveis?: number }) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido.' }
  const xp = await xpRegrasAtual(createAdminClient(), tenantId)
  const base = { ativo: d.ativo, timezone: d.timezone, xp_regras: { ...xp, streak: d.streak, chest: d.chest, fim_semana: d.fim_semana, meta_dia: d.meta_dia } }
  const extra: Record<string, unknown> = {}
  if (d.trilha_estilo) extra.trilha_estilo = d.trilha_estilo
  if (d.trilha_visiveis != null) extra.trilha_visiveis = Math.max(0, Math.trunc(d.trilha_visiveis))
  if (!Object.keys(extra).length) return salvarSlice(base)
  const r = await salvarSlice({ ...base, ...extra })
  // Colunas trilha_estilo/trilha_visiveis ainda não migradas → salva o resto e avisa.
  if (r.error && /trilha_estilo|trilha_visiveis|column|42703|schema cache/i.test(r.error)) {
    const r2 = await salvarSlice(base)
    return r2.error ? r2 : { ok: true, aviso: 'Salvo. O estilo/exibição da trilha exige aplicar as migrações 20260813000000/…001.' }
  }
  return r
}

export async function salvarLigas(ligas: LigaDef[]) {
  return salvarSlice({ ligas: [...ligas].sort((a, b) => a.xp_min - b.xp_min) })
}

/** Gatilhos de engajamento (webhook por sequência/inatividade/marco) — guardados em xp_regras.engajamento. */
export async function salvarEngajamento(engajamento: EngajamentoConfig) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido.' }
  const xp = await xpRegrasAtual(createAdminClient(), tenantId)
  return salvarSlice({ xp_regras: { ...xp, engajamento: resolverEngajamento(engajamento) } })
}

export async function salvarConquistas(conquistas_def: ConquistaDef[]) {
  return salvarSlice({ conquistas_def })
}

export async function salvarMissoes(missoes_def: MissaoDef[], missoes_config?: MissoesConfig) {
  if (!missoes_config) return salvarSlice({ missoes_def })
  const r = await salvarSlice({ missoes_def, missoes_config })
  // Coluna missoes_config ainda não migrada (20260812000002) → salva só as missões e avisa.
  if (r.error && /missoes_config|column|42703|schema cache/i.test(r.error)) {
    const r2 = await salvarSlice({ missoes_def })
    return r2.error ? r2 : { ok: true, aviso: 'Missões salvas, mas o rodízio exige aplicar a migração 20260812000002.' }
  }
  return r
}

// ── PÚBLICO da gamificação (quem participa): modo 'todos' | 'selecionados' + grupos/alunos vinculados.
// Grupos ficam VINCULADOS (conexão viva): novos membros — manual ou por sync (Curseduca/Guru) — passam
// a participar automaticamente. Espelha o modelo dos "Acessos" do módulo.
const SEM_TABELA_PUB = (m?: string) => /relation .* does not exist|simulado_gamificacao_(grupos|estudantes)|publico_modo|column|42703|schema cache/i.test(m ?? '')

export async function carregarPublicoGam(): Promise<{ ok: boolean; modo?: PublicoModo; grupos?: GrupoPublicoOpc[]; estudantes?: EstudanteAcessoLinha[]; error?: string; aviso?: string }> {
  if (!(await checkPermission('gamificacao:view'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { data: cfg } = await svc.from('simulado_gamificacao_config').select('publico_modo').eq('tenant_id', tenantId).maybeSingle()
  const modo: PublicoModo = (cfg?.publico_modo === 'selecionados' ? 'selecionados' : 'todos')
  // Grupos com hierarquia (pasta mestre/pai) + contagem + origem — mesmo dado da área de Grupos.
  // Contagem via agregação SQL (GROUP BY) — rápida; se indisponível, segue SEM contagem (nunca varre
  // as ~dezenas de milhares de filiações via PostgREST, que travava o carregamento).
  const gruposRows = await selecionarGrupos(svc, tenantId)
  const counts: Record<string, number> = {}
  try {
    const c = await grupoContagensSql(gruposRows.map((g) => g.id), tenantId)
    if (c) for (const x of c) counts[x.grupo_id] = Number(x.total) || 0
  } catch { /* sem SQL agregado → sem contagem (rápido) */ }
  const provPorGrupo = new Map<string, string>()
  try {
    const maps = await fetchAll<{ grupo_id: string | null; provider: string | null }>(() =>
      svc.from('simulado_integracao_mapeamentos').select('grupo_id, provider').eq('tenant_id', tenantId).not('grupo_id', 'is', null).order('grupo_id', { ascending: true }))
    for (const m of maps) if (m.grupo_id && m.provider && !provPorGrupo.has(m.grupo_id)) provPorGrupo.set(m.grupo_id, m.provider)
  } catch { /* sem integrações → todos manuais */ }
  const origemDe = (g: { id: string; codigo_externo?: string | null }): 'guru' | 'curseduca' | null => {
    const p = provPorGrupo.get(g.id)
    if (p === 'guru') return 'guru'
    if (p === 'curseduca' || g.codigo_externo) return 'curseduca'
    return null
  }
  const montarGrupos = (gset: Set<string>): GrupoPublicoOpc[] => gruposRows.map((g) => ({
    id: g.id, nome: g.nome, cor: g.cor ?? null, atribuido: gset.has(g.id), is_mestre: g.is_mestre, pai_id: g.pai_id, membros: counts[g.id] ?? 0, origem: origemDe(g),
  }))
  let gset = new Set<string>(); let estIds: string[] = []
  try {
    const [{ data: gv }, { data: ev }] = await Promise.all([
      svc.from('simulado_gamificacao_grupos').select('grupo_id').eq('tenant_id', tenantId),
      svc.from('simulado_gamificacao_estudantes').select('estudante_id').eq('tenant_id', tenantId),
    ])
    gset = new Set((gv ?? []).map((r: any) => r.grupo_id))
    estIds = [...new Set((ev ?? []).map((r: any) => r.estudante_id))]
  } catch { return { ok: true, modo, grupos: montarGrupos(new Set()), estudantes: [], aviso: 'Aplique a migração 20260921000000 para selecionar o público.' } }
  const grupos = montarGrupos(gset)
  let estudantes: EstudanteAcessoLinha[] = []
  if (estIds.length) {
    const es = await fetchAllByIn<any>(estIds, (chunk) => svc.from('simulado_estudantes').select('id, nome, email, cpf, classificacao, avatar, perfil_avatar_cor').in('id', chunk).order('nome', { ascending: true }))
    estudantes = (es as any[]).map((e): EstudanteAcessoLinha => ({ id: e.id, nome: e.nome ?? 'Aluno', email: e.email ?? null, cpf: e.cpf ?? null, classificacao: e.classificacao ?? null, avatar: e.avatar ?? null, perfil_avatar_cor: e.perfil_avatar_cor ?? null }))
  }
  return { ok: true, modo, grupos, estudantes }
}

export async function salvarModoPublico(modo: PublicoModo): Promise<{ ok?: boolean; error?: string; aviso?: string }> {
  const r = await salvarSlice({ publico_modo: modo === 'selecionados' ? 'selecionados' : 'todos' })
  if (r.error && SEM_TABELA_PUB(r.error)) return { ok: true, aviso: 'Aplique a migração 20260921000000 para restringir o público.' }
  return r
}

export async function definirGruposGam(grupoIds: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('gamificacao:manage'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const ids = [...new Set((grupoIds ?? []).filter(Boolean))]
  const del = await svc.from('simulado_gamificacao_grupos').delete().eq('tenant_id', tenantId)
  if (del.error && SEM_TABELA_PUB(del.error.message)) return { ok: false, error: 'Rode a migração 20260921000000 (público da gamificação).' }
  if (ids.length) {
    const { error } = await svc.from('simulado_gamificacao_grupos').insert(ids.map((grupo_id) => ({ tenant_id: tenantId, grupo_id })))
    if (error) return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_gamificacao_grupos', entidadeId: tenantId, depois: { grupos: ids.length } })
  revalidatePath('/admin/gamificacao'); return { ok: true }
}

export async function definirEstudantesGam(estudanteIds: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('gamificacao:manage'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const ids = [...new Set((estudanteIds ?? []).filter(Boolean))]
  const del = await svc.from('simulado_gamificacao_estudantes').delete().eq('tenant_id', tenantId)
  if (del.error && SEM_TABELA_PUB(del.error.message)) return { ok: false, error: 'Rode a migração 20260921000000 (público da gamificação).' }
  if (ids.length) {
    const { error } = await svc.from('simulado_gamificacao_estudantes').insert(ids.map((estudante_id) => ({ tenant_id: tenantId, estudante_id })))
    if (error) return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_gamificacao_estudantes', entidadeId: tenantId, depois: { estudantes: ids.length } })
  revalidatePath('/admin/gamificacao'); return { ok: true }
}

/** Membros (vivos) dos grupos vinculados à gamificação — p/ mostrar na lista única (estilo banco). */
export async function estudantesDosGruposGam(grupoIds: string[]): Promise<{ ok: boolean; itens?: (EstudanteAcessoLinha & { grupoNome: string | null })[]; error?: string }> {
  if (!(await checkPermission('gamificacao:view'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const ids = [...new Set((grupoIds ?? []).filter(Boolean))]
  if (!ids.length) return { ok: true, itens: [] }
  const svc = createAdminClient()
  const { data: gs } = await svc.from('simulado_grupos').select('id, nome').in('id', ids)
  const nomeGrupo = new Map<string, string>((gs ?? []).map((x: any) => [x.id, x.nome]))
  const mem = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_grupo_membros').select('estudante_id, grupo_id').in('grupo_id', chunk).order('estudante_id', { ascending: true }))
  const grupoDe = new Map<string, string>()
  for (const m of mem) if (!grupoDe.has(m.estudante_id)) grupoDe.set(m.estudante_id, m.grupo_id)
  const estIds = [...grupoDe.keys()]
  if (!estIds.length) return { ok: true, itens: [] }
  const es = await fetchAllByIn<any>(estIds, (chunk) => svc.from('simulado_estudantes').select('id, nome, email, cpf, classificacao, avatar, perfil_avatar_cor').in('id', chunk).order('nome', { ascending: true }))
  return { ok: true, itens: (es as any[]).map((e) => ({ id: e.id, nome: e.nome ?? 'Aluno', email: e.email ?? null, cpf: e.cpf ?? null, classificacao: e.classificacao ?? null, avatar: e.avatar ?? null, perfil_avatar_cor: e.perfil_avatar_cor ?? null, grupoNome: nomeGrupo.get(grupoDe.get(e.id)!) ?? null })) }
}

// Recalcula nível/liga de TODOS os alunos a partir do ledger (usar após mudar limites de liga/curva).
export async function rebuildGamificacao(): Promise<{ ok?: boolean; error?: string; atualizados?: number }> {
  if (!(await checkPermission('gamificacao:manage'))) return { error: 'Você não tem permissão para gerenciar a gamificação.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const n = await rebuildCacheTenant(svc, tenantId)
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_gamificacao_config', entidadeId: tenantId, depois: { rebuild: n } })
  revalidatePath('/admin/gamificacao')
  return { ok: true, atualizados: n }
}
