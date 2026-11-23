'use server'

/**
 * Acesso DIRETO por cronograma (migração 20261122000000): todos / grupos / estudantes.
 * Independe de pacote; a resolução para o aluno é feita pela RPC simulado_cronograma_do_aluno.
 * Buscar alunos e membros de grupo: reusar `buscarEstudantes` e `membrosDoGrupo` de ./pacotes/actions.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { selecionarGrupos, contarMembrosGrupos } from '@/lib/simulado/grupos'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEM_MIGRACAO = 'Recurso ainda não ativado no banco: aplique a migração 20261122000000_cronograma_acesso_direto.sql.'
const semMigracao = (m?: string) => /does not exist|schema cache|acesso_gratuito/i.test(m ?? '')

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

export type AcessoCronograma = {
  gratuito: boolean
  grupos: { id: string; nome: string; cor: string | null; membros: number }[]
  estudantes: { id: string; nome: string; email: string | null }[]
}

export type GrupoTenantOpc = {
  id: string; nome: string; cor: string | null
  is_mestre: boolean; pai_id: string | null; membros: number
}

/** O cronograma pertence ao tenant? (service role bypassa RLS → valida o id vindo do cliente.) */
async function cronogramaDoTenant(svc: any, tenantId: string, id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false
  const { data } = await svc.from('simulado_cronogramas').select('id').eq('id', id).eq('tenant_id', tenantId).eq('deletado', false).maybeSingle()
  return !!data
}

export async function carregarAcessoCronograma(
  cronogramaId: string,
): Promise<{ ok: boolean; dados?: AcessoCronograma; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  if (!(await cronogramaDoTenant(svc, g.tenantId, cronogramaId))) return { ok: false, error: 'Cronograma não encontrado.' }

  try {
    const [cron, vg, ve, todosGrupos, contagem] = await Promise.all([
      svc.from('simulado_cronogramas').select('acesso_gratuito').eq('id', cronogramaId).eq('tenant_id', g.tenantId).maybeSingle(),
      fetchAll<any>(() => svc.from('simulado_cronograma_grupos').select('grupo_id').eq('tenant_id', g.tenantId).eq('cronograma_id', cronogramaId).order('id') as any),
      fetchAll<any>(() => svc.from('simulado_cronograma_estudantes').select('estudante_id').eq('tenant_id', g.tenantId).eq('cronograma_id', cronogramaId).order('id') as any),
      selecionarGrupos(svc, g.tenantId),
      contarMembrosGrupos(svc, g.tenantId),
    ])
    if ((cron as any).error) throw new Error((cron as any).error.message)

    const idsGrupo = new Set(vg.map((x) => x.grupo_id as string))
    const idsEst = [...new Set(ve.map((x) => x.estudante_id as string))]
    const alunos = idsEst.length
      ? await fetchAllByIn<any>(idsEst, (chunk) =>
          svc.from('simulado_estudantes').select('id, nome, email').in('id', chunk).eq('tenant_id', g.tenantId).order('id') as any,
        )
      : []
    alunos.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))

    return {
      ok: true,
      dados: {
        gratuito: !!(cron as any).data?.acesso_gratuito,
        grupos: (todosGrupos as any[])
          .filter((x) => idsGrupo.has(x.id))
          .map((x) => ({ id: x.id, nome: x.nome, cor: x.cor ?? null, membros: contagem[x.id] ?? 0 })),
        estudantes: alunos.map((a) => ({ id: a.id, nome: a.nome, email: a.email ?? null })),
      },
    }
  } catch (e: any) {
    return { ok: false, error: semMigracao(e?.message) ? SEM_MIGRACAO : (e?.message ?? 'Erro ao carregar.') }
  }
}

/** Grupos do tenant (com hierarquia + contagem) no formato do `GrupoOpc` do seletor de grupos. */
export async function listarGruposParaCronograma(): Promise<{ ok: boolean; grupos?: GrupoTenantOpc[]; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  try {
    const [todos, contagem] = await Promise.all([selecionarGrupos(svc, g.tenantId), contarMembrosGrupos(svc, g.tenantId)])
    return {
      ok: true,
      grupos: (todos as any[]).map((x) => ({
        id: x.id, nome: x.nome, cor: x.cor ?? null,
        is_mestre: !!x.is_mestre, pai_id: x.pai_id ?? null, membros: contagem[x.id] ?? 0,
      })),
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Erro ao listar grupos.' }
  }
}

/** Liga/desliga "liberar para TODOS" neste cronograma. */
export async function definirAcessoGratuitoCronograma(
  cronogramaId: string,
  gratuito: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:liberar')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  if (!(await cronogramaDoTenant(svc, g.tenantId, cronogramaId))) return { ok: false, error: 'Cronograma não encontrado.' }

  const { error } = await svc
    .from('simulado_cronogramas')
    .update({ acesso_gratuito: !!gratuito, atualizado_em: new Date().toISOString() })
    .eq('id', cronogramaId)
    .eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: semMigracao(error.message) ? SEM_MIGRACAO : error.message }

  await registrarAudit({
    operacao: gratuito ? 'LIBERAR' : 'BLOQUEAR',
    entidade: 'simulado_cronogramas',
    entidadeId: cronogramaId,
    depois: { acesso_gratuito: !!gratuito },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  return { ok: true }
}

/**
 * Substitui o CONJUNTO de grupos do cronograma (calcula diff: insere novos, remove os ausentes).
 * `alcanceEstimado` = membros distintos dos grupos finais (informativo, pode haver sobreposição com outras vias).
 */
export async function definirGruposCronograma(
  cronogramaId: string,
  grupoIds: string[],
): Promise<{ ok: boolean; adicionados?: number; removidos?: number; alcanceEstimado?: number; error?: string }> {
  const g = await guard('cronogramas:liberar')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  if (!(await cronogramaDoTenant(svc, g.tenantId, cronogramaId))) return { ok: false, error: 'Cronograma não encontrado.' }

  const pedidos = [...new Set((grupoIds ?? []).filter((x) => UUID_RE.test(x)))]
  // Só grupos DESTE tenant (service role bypassa RLS).
  const validos = pedidos.length
    ? await fetchAllByIn<any>(pedidos, (chunk) =>
        svc.from('simulado_grupos').select('id').in('id', chunk).eq('tenant_id', g.tenantId).order('id') as any,
      )
    : []
  const alvo = new Set(validos.map((x) => x.id as string))

  try {
    const atuais = await fetchAll<any>(() =>
      svc.from('simulado_cronograma_grupos').select('grupo_id').eq('tenant_id', g.tenantId).eq('cronograma_id', cronogramaId).order('id') as any,
    )
    const atualSet = new Set(atuais.map((x) => x.grupo_id as string))
    const novos = [...alvo].filter((x) => !atualSet.has(x))
    const remover = [...atualSet].filter((x) => !alvo.has(x))

    if (novos.length) {
      const { error } = await svc
        .from('simulado_cronograma_grupos')
        .upsert(novos.map((grupo_id) => ({ tenant_id: g.tenantId, cronograma_id: cronogramaId, grupo_id })), { onConflict: 'cronograma_id,grupo_id', ignoreDuplicates: true })
      if (error) return { ok: false, error: semMigracao(error.message) ? SEM_MIGRACAO : error.message }
    }
    for (let i = 0; i < remover.length; i += 80) {
      const { error } = await svc
        .from('simulado_cronograma_grupos')
        .delete()
        .eq('tenant_id', g.tenantId)
        .eq('cronograma_id', cronogramaId)
        .in('grupo_id', remover.slice(i, i + 80))
      if (error) return { ok: false, error: error.message }
    }

    let alcanceEstimado = 0
    if (alvo.size) {
      const membros = await fetchAllByIn<any>([...alvo], (chunk) =>
        svc.from('simulado_grupo_membros').select('estudante_id').eq('tenant_id', g.tenantId).in('grupo_id', chunk).order('id') as any,
      )
      alcanceEstimado = new Set(membros.map((m) => m.estudante_id)).size
    }

    if (novos.length || remover.length) {
      await registrarAudit({
        operacao: novos.length >= remover.length ? 'LIBERAR' : 'BLOQUEAR',
        entidade: 'simulado_cronograma_grupos',
        entidadeId: cronogramaId,
        depois: { grupos: [...alvo], adicionados: novos.length, removidos: remover.length },
        atorId: g.atorId,
        tenantId: g.tenantId,
      })
    }
    return { ok: true, adicionados: novos.length, removidos: remover.length, alcanceEstimado }
  } catch (e: any) {
    return { ok: false, error: semMigracao(e?.message) ? SEM_MIGRACAO : (e?.message ?? 'Erro ao salvar grupos.') }
  }
}

/** Substitui o CONJUNTO de estudantes específicos do cronograma (diff: insere novos, remove ausentes). */
export async function definirEstudantesCronograma(
  cronogramaId: string,
  estudanteIds: string[],
): Promise<{ ok: boolean; adicionados?: number; removidos?: number; error?: string }> {
  const g = await guard('cronogramas:liberar')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  if (!(await cronogramaDoTenant(svc, g.tenantId, cronogramaId))) return { ok: false, error: 'Cronograma não encontrado.' }

  const pedidos = [...new Set((estudanteIds ?? []).filter((x) => UUID_RE.test(x)))]
  const validos = pedidos.length
    ? await fetchAllByIn<any>(pedidos, (chunk) =>
        svc.from('simulado_estudantes').select('id').in('id', chunk).eq('tenant_id', g.tenantId).eq('deletado', false).order('id') as any,
      )
    : []
  const alvo = new Set(validos.map((x) => x.id as string))

  try {
    const atuais = await fetchAll<any>(() =>
      svc.from('simulado_cronograma_estudantes').select('estudante_id').eq('tenant_id', g.tenantId).eq('cronograma_id', cronogramaId).order('id') as any,
    )
    const atualSet = new Set(atuais.map((x) => x.estudante_id as string))
    const novos = [...alvo].filter((x) => !atualSet.has(x))
    const remover = [...atualSet].filter((x) => !alvo.has(x))

    for (let i = 0; i < novos.length; i += 500) {
      const { error } = await svc
        .from('simulado_cronograma_estudantes')
        .upsert(
          novos.slice(i, i + 500).map((estudante_id) => ({ tenant_id: g.tenantId, cronograma_id: cronogramaId, estudante_id })),
          { onConflict: 'cronograma_id,estudante_id', ignoreDuplicates: true },
        )
      if (error) return { ok: false, error: semMigracao(error.message) ? SEM_MIGRACAO : error.message }
    }
    for (let i = 0; i < remover.length; i += 80) {
      const { error } = await svc
        .from('simulado_cronograma_estudantes')
        .delete()
        .eq('tenant_id', g.tenantId)
        .eq('cronograma_id', cronogramaId)
        .in('estudante_id', remover.slice(i, i + 80))
      if (error) return { ok: false, error: error.message }
    }

    if (novos.length || remover.length) {
      await registrarAudit({
        operacao: novos.length >= remover.length ? 'LIBERAR' : 'BLOQUEAR',
        entidade: 'simulado_cronograma_estudantes',
        entidadeId: cronogramaId,
        depois: { adicionados: novos.length, removidos: remover.length, total: alvo.size },
        atorId: g.atorId,
        tenantId: g.tenantId,
      })
    }
    return { ok: true, adicionados: novos.length, removidos: remover.length }
  } catch (e: any) {
    return { ok: false, error: semMigracao(e?.message) ? SEM_MIGRACAO : (e?.message ?? 'Erro ao salvar estudantes.') }
  }
}

/**
 * Resumo do acesso direto de VÁRIOS cronogramas (para a listagem do admin): contagens agregadas.
 * Tolerante: sem a migração aplicada devolve vazio.
 */
export async function resumoAcessoCronogramas(
  cronogramaIds: string[],
): Promise<{ ok: boolean; resumo?: Record<string, { gratuito: boolean; grupos: number; estudantes: number }>; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const ids = [...new Set((cronogramaIds ?? []).filter((x) => UUID_RE.test(x)))]
  if (!ids.length) return { ok: true, resumo: {} }

  try {
    const [crons, vg, ve] = await Promise.all([
      fetchAllByIn<any>(ids, (c) => svc.from('simulado_cronogramas').select('id, acesso_gratuito').in('id', c).eq('tenant_id', g.tenantId).order('id') as any),
      fetchAllByIn<any>(ids, (c) => svc.from('simulado_cronograma_grupos').select('id, cronograma_id').in('cronograma_id', c).eq('tenant_id', g.tenantId).order('id') as any),
      fetchAllByIn<any>(ids, (c) => svc.from('simulado_cronograma_estudantes').select('id, cronograma_id').in('cronograma_id', c).eq('tenant_id', g.tenantId).order('id') as any),
    ])
    const resumo: Record<string, { gratuito: boolean; grupos: number; estudantes: number }> = {}
    for (const c of crons) resumo[c.id] = { gratuito: !!c.acesso_gratuito, grupos: 0, estudantes: 0 }
    for (const x of vg) if (resumo[x.cronograma_id]) resumo[x.cronograma_id].grupos++
    for (const x of ve) if (resumo[x.cronograma_id]) resumo[x.cronograma_id].estudantes++
    return { ok: true, resumo }
  } catch (e: any) {
    return { ok: false, error: semMigracao(e?.message) ? SEM_MIGRACAO : (e?.message ?? 'Erro.') }
  }
}
