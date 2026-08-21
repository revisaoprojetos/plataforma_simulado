'use server'

/**
 * Pacotes de cronogramas e sua liberação.
 *
 * Replica a lógica que os simulados já usam (banco ↔ grupo ↔ aluno), com uma diferença
 * de mecanismo deliberada:
 *
 *   O simulado MATERIALIZA — vincular um grupo grava uma linha por aluno em
 *   `simulado_pasta_estudantes` e outra em `simulado_matriculas`. É de onde vêm as 94 mil
 *   linhas, e por isso vincular um grupo grande é uma operação pesada e demorada.
 *
 *   Aqui o vínculo é UMA linha, e o acesso é resolvido por junção na leitura.
 *
 * O que NÃO muda são os cuidados de comportamento, porque a equipe já os conhece:
 *  · prévia antes de desvincular, dizendo quantos perdem acesso de verdade;
 *  · quem está em OUTRO grupo ainda vinculado permanece;
 *  · quem JÁ USOU é preservado — no simulado é "já iniciou a prova"; aqui é "já emitiu
 *    um cronograma". Esses viram vínculo individual em vez de perder o acesso.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function guard(perm = 'cronogramas:update') {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

export type PacoteLista = {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  ordem: number
  cronogramas: number
  grupos: number
  estudantes: number
  /** Alunos alcançados, contando os membros dos grupos vinculados (sem duplicar). */
  alcance: number
}

/** Lista os pacotes com o que cada um contém e quantos alunos alcança. */
export async function listarPacotes(): Promise<{ ok: boolean; itens?: PacoteLista[]; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const [pacotes, itens, grupos, estudantes] = await Promise.all([
    fetchAll<any>(() =>
      svc.from('simulado_cronograma_pacotes').select('id, nome, descricao, ativo, ordem').eq('tenant_id', g.tenantId).order('ordem').order('nome') as any,
    ),
    fetchAll<any>(() => svc.from('simulado_cronograma_pacote_itens').select('pacote_id').eq('tenant_id', g.tenantId).order('id') as any),
    fetchAll<any>(() => svc.from('simulado_cronograma_pacote_grupos').select('pacote_id, grupo_id').eq('tenant_id', g.tenantId).order('id') as any),
    fetchAll<any>(() => svc.from('simulado_cronograma_pacote_estudantes').select('pacote_id, estudante_id').eq('tenant_id', g.tenantId).order('id') as any),
  ])

  const conta = (linhas: any[], campo = 'pacote_id') => {
    const m = new Map<string, number>()
    for (const l of linhas) m.set(l[campo], (m.get(l[campo]) ?? 0) + 1)
    return m
  }
  const nItens = conta(itens)
  const nGrupos = conta(grupos)
  const nEst = conta(estudantes)

  // Alcance: membros dos grupos vinculados + alunos avulsos, sem duplicar.
  const gruposUsados = [...new Set(grupos.map((x) => x.grupo_id))]
  const membrosPorGrupo = new Map<string, string[]>()
  if (gruposUsados.length) {
    const membros = await fetchAllByIn<any>(gruposUsados, (chunk) =>
      svc.from('simulado_grupo_membros').select('grupo_id, estudante_id').in('grupo_id', chunk).order('estudante_id') as any,
    )
    for (const m of membros) {
      const l = membrosPorGrupo.get(m.grupo_id)
      if (l) l.push(m.estudante_id)
      else membrosPorGrupo.set(m.grupo_id, [m.estudante_id])
    }
  }

  const itensLista = pacotes.map((p) => {
    const alcancados = new Set<string>()
    for (const vg of grupos) {
      if (vg.pacote_id !== p.id) continue
      for (const e of membrosPorGrupo.get(vg.grupo_id) ?? []) alcancados.add(e)
    }
    for (const ve of estudantes) if (ve.pacote_id === p.id) alcancados.add(ve.estudante_id)
    return {
      ...p,
      cronogramas: nItens.get(p.id) ?? 0,
      grupos: nGrupos.get(p.id) ?? 0,
      estudantes: nEst.get(p.id) ?? 0,
      alcance: alcancados.size,
    }
  })

  return { ok: true, itens: itensLista as PacoteLista[] }
}

export type PacoteDetalhe = {
  pacote: { id: string; nome: string; descricao: string | null; ativo: boolean }
  cronogramas: { id: string; nome: string; status: string; metas: number }[]
  grupos: { id: string; nome: string; membros: number }[]
  estudantes: { id: string; nome: string; email: string | null }[]
  /** Catálogo e grupos disponíveis para vincular. */
  cronogramasDisponiveis: { id: string; nome: string; status: string; metas: number }[]
  gruposDisponiveis: { id: string; nome: string; membros: number }[]
  alcance: number
}

export async function carregarPacote(id: string): Promise<{ ok: boolean; dados?: PacoteDetalhe; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  if (!UUID_RE.test(id)) return { ok: false, error: 'Pacote não encontrado.' }
  const svc = createAdminClient()

  const { data: pacote } = await svc
    .from('simulado_cronograma_pacotes')
    .select('id, nome, descricao, ativo')
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
    .maybeSingle()
  if (!pacote) return { ok: false, error: 'Pacote não encontrado.' }

  const [itens, vgrupos, vest, catalogo, todosGrupos, metas] = await Promise.all([
    fetchAll<any>(() => svc.from('simulado_cronograma_pacote_itens').select('cronograma_id').eq('tenant_id', g.tenantId).eq('pacote_id', id).order('id') as any),
    fetchAll<any>(() => svc.from('simulado_cronograma_pacote_grupos').select('grupo_id').eq('tenant_id', g.tenantId).eq('pacote_id', id).order('id') as any),
    fetchAll<any>(() => svc.from('simulado_cronograma_pacote_estudantes').select('estudante_id').eq('tenant_id', g.tenantId).eq('pacote_id', id).order('id') as any),
    fetchAll<any>(() =>
      svc.from('simulado_cronogramas').select('id, nome, status').eq('tenant_id', g.tenantId).eq('deletado', false).order('carga_horaria').order('nome') as any,
    ),
    fetchAll<any>(() =>
      svc.from('simulado_grupos').select('id, nome').eq('tenant_id', g.tenantId).eq('deletado', false).eq('arquivado', false).order('nome') as any,
    ),
    fetchAll<any>(() => svc.from('simulado_cronograma_metas').select('cronograma_id').eq('tenant_id', g.tenantId).order('id') as any),
  ])

  const metasPorCron = new Map<string, number>()
  for (const m of metas) metasPorCron.set(m.cronograma_id, (metasPorCron.get(m.cronograma_id) ?? 0) + 1)

  const idsCron = new Set(itens.map((i) => i.cronograma_id))
  const idsGrupo = new Set(vgrupos.map((x) => x.grupo_id))
  const idsEst = vest.map((x) => x.estudante_id)

  // Contagem de membros de todos os grupos (o seletor precisa mostrar o tamanho).
  const membrosPorGrupo = new Map<string, number>()
  const alcancados = new Set<string>()
  if (todosGrupos.length) {
    const membros = await fetchAllByIn<any>(
      todosGrupos.map((x) => x.id),
      (chunk) => svc.from('simulado_grupo_membros').select('grupo_id, estudante_id').in('grupo_id', chunk).order('estudante_id') as any,
    )
    for (const m of membros) {
      membrosPorGrupo.set(m.grupo_id, (membrosPorGrupo.get(m.grupo_id) ?? 0) + 1)
      if (idsGrupo.has(m.grupo_id)) alcancados.add(m.estudante_id)
    }
  }
  for (const e of idsEst) alcancados.add(e)

  const nomesEstudantes = idsEst.length
    ? await fetchAllByIn<any>(idsEst, (chunk) =>
        svc.from('simulado_estudantes').select('id, nome, email').in('id', chunk).eq('tenant_id', g.tenantId).order('nome') as any,
      )
    : []

  return {
    ok: true,
    dados: {
      pacote: pacote as any,
      cronogramas: catalogo
        .filter((c) => idsCron.has(c.id))
        .map((c) => ({ ...c, metas: metasPorCron.get(c.id) ?? 0 })),
      grupos: todosGrupos.filter((x) => idsGrupo.has(x.id)).map((x) => ({ ...x, membros: membrosPorGrupo.get(x.id) ?? 0 })),
      estudantes: nomesEstudantes.map((e) => ({ id: e.id, nome: e.nome, email: e.email ?? null })),
      cronogramasDisponiveis: catalogo.filter((c) => !idsCron.has(c.id)).map((c) => ({ ...c, metas: metasPorCron.get(c.id) ?? 0 })),
      gruposDisponiveis: todosGrupos.filter((x) => !idsGrupo.has(x.id)).map((x) => ({ ...x, membros: membrosPorGrupo.get(x.id) ?? 0 })),
      alcance: alcancados.size,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD do pacote

export async function criarPacote(nome: string, descricao: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const n = nome.trim()
  if (!n) return { ok: false, error: 'Informe o nome do pacote.' }
  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_cronograma_pacotes')
    .insert({ tenant_id: g.tenantId, nome: n, descricao: descricao?.trim() || null })
    .select('id')
    .single()
  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe um pacote com esse nome.' : error.message }
  }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_cronograma_pacotes', entidadeId: (data as any).id, depois: { nome: n }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/cronogramas/pacotes')
  return { ok: true, id: (data as any).id }
}

export async function atualizarPacote(id: string, nome: string, descricao: string | null, ativo: boolean): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const n = nome.trim()
  if (!n) return { ok: false, error: 'Informe o nome do pacote.' }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cronograma_pacotes')
    .update({ nome: n, descricao: descricao?.trim() || null, ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe um pacote com esse nome.' : error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cronograma_pacotes', entidadeId: id, depois: { nome: n, ativo }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/cronogramas/pacotes')
  revalidatePath(`/admin/cronogramas/pacotes/${id}`)
  return { ok: true }
}

export async function excluirPacote(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:delete')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  // Os vínculos saem por CASCADE. Nenhuma matrícula é apagada: elas não existem aqui.
  const { error } = await svc.from('simulado_cronograma_pacotes').delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_cronograma_pacotes', entidadeId: id, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/cronogramas/pacotes')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo do pacote

export async function alternarCronogramaNoPacote(pacoteId: string, cronogramaId: string, dentro: boolean): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  if (dentro) {
    const { error } = await svc
      .from('simulado_cronograma_pacote_itens')
      .upsert({ tenant_id: g.tenantId, pacote_id: pacoteId, cronograma_id: cronogramaId }, { onConflict: 'pacote_id,cronograma_id', ignoreDuplicates: true })
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await svc
      .from('simulado_cronograma_pacote_itens')
      .delete()
      .eq('tenant_id', g.tenantId)
      .eq('pacote_id', pacoteId)
      .eq('cronograma_id', cronogramaId)
    if (error) return { ok: false, error: error.message }
  }

  await registrarAudit({
    operacao: dentro ? 'LIBERAR' : 'BLOQUEAR',
    entidade: 'simulado_cronograma_pacote_itens',
    entidadeId: pacoteId,
    depois: { cronograma_id: cronogramaId, dentro },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath(`/admin/cronogramas/pacotes/${pacoteId}`)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quem recebe

/**
 * Vincular um grupo é UMA linha — independente de o grupo ter 3 ou 3.000 alunos.
 *
 * No simulado esta operação materializa uma linha por aluno em duas tabelas; aqui o
 * acesso é resolvido por junção na leitura.
 */
export async function vincularGrupo(pacoteId: string, grupoId: string): Promise<{ ok: boolean; alcance?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const { error } = await svc
    .from('simulado_cronograma_pacote_grupos')
    .upsert({ tenant_id: g.tenantId, pacote_id: pacoteId, grupo_id: grupoId }, { onConflict: 'pacote_id,grupo_id', ignoreDuplicates: true })
  if (error) return { ok: false, error: error.message }

  const membros = await fetchAll<any>(() =>
    svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grupoId).order('estudante_id') as any,
  )
  await registrarAudit({
    operacao: 'LIBERAR',
    entidade: 'simulado_cronograma_pacote_grupos',
    entidadeId: pacoteId,
    depois: { grupo_id: grupoId, alunos_alcancados: membros.length },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath(`/admin/cronogramas/pacotes/${pacoteId}`)
  return { ok: true, alcance: membros.length }
}

export type PreviaDesvinculo = {
  membros: number
  /** Continuam com acesso por outro grupo vinculado ao mesmo pacote. */
  mantidosPorOutroGrupo: number
  /** Já emitiram cronograma deste pacote — perderiam acesso ao que já usam. */
  jaEmitiram: number
  /** Perdem acesso de fato. */
  perdemAcesso: number
}

/**
 * Prévia do desvínculo — o equivalente ao `contarOrfaosDesvincular` dos simulados.
 *
 * Dois grupos de alunos NÃO perdem acesso: quem está em outro grupo ainda vinculado, e
 * quem já emitiu um cronograma deste pacote. O segundo caso espelha a regra do simulado
 * de não remover quem já iniciou a prova.
 */
export async function previaDesvincularGrupo(pacoteId: string, grupoId: string): Promise<{ ok: boolean; previa?: PreviaDesvinculo; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const membros = await fetchAll<any>(() =>
    svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grupoId).order('estudante_id') as any,
  )
  const ids = [...new Set(membros.map((m) => m.estudante_id))]
  if (!ids.length) return { ok: true, previa: { membros: 0, mantidosPorOutroGrupo: 0, jaEmitiram: 0, perdemAcesso: 0 } }

  // Outros grupos ainda vinculados ao pacote.
  const outros = (
    await fetchAll<any>(() =>
      svc.from('simulado_cronograma_pacote_grupos').select('grupo_id').eq('tenant_id', g.tenantId).eq('pacote_id', pacoteId).order('id') as any,
    )
  )
    .map((l) => l.grupo_id)
    .filter((id: string) => id && id !== grupoId)

  const mantidos = new Set<string>()
  if (outros.length) {
    const rows = await fetchAllByIn<any>(outros, (chunk) =>
      svc.from('simulado_grupo_membros').select('estudante_id').in('grupo_id', chunk).order('estudante_id') as any,
    )
    for (const r of rows) if (ids.includes(r.estudante_id)) mantidos.add(r.estudante_id)
  }

  // Vínculo individual também mantém.
  const avulsos = await fetchAllByIn<any>(ids, (chunk) =>
    svc.from('simulado_cronograma_pacote_estudantes').select('estudante_id').eq('pacote_id', pacoteId).in('estudante_id', chunk).order('id') as any,
  )
  for (const a of avulsos) mantidos.add(a.estudante_id)

  // Quem já emitiu algum cronograma DESTE pacote.
  const itens = await fetchAll<any>(() =>
    svc.from('simulado_cronograma_pacote_itens').select('cronograma_id').eq('tenant_id', g.tenantId).eq('pacote_id', pacoteId).order('id') as any,
  )
  const cronIds = itens.map((i) => i.cronograma_id)
  const jaEmitiram = new Set<string>()
  if (cronIds.length) {
    const emissoes = await fetchAllByIn<any>(ids, (chunk) =>
      svc
        .from('simulado_cronograma_emissoes')
        .select('estudante_id')
        .eq('tenant_id', g.tenantId)
        .in('cronograma_id', cronIds)
        .in('estudante_id', chunk)
        .order('id') as any,
    )
    for (const e of emissoes) if (!mantidos.has(e.estudante_id)) jaEmitiram.add(e.estudante_id)
  }

  return {
    ok: true,
    previa: {
      membros: ids.length,
      mantidosPorOutroGrupo: mantidos.size,
      jaEmitiram: jaEmitiram.size,
      perdemAcesso: ids.length - mantidos.size - jaEmitiram.size,
    },
  }
}

/**
 * Desvincula o grupo. Se `preservarQuemEmitiu`, quem já usou vira vínculo individual em
 * vez de perder o acesso — mesma proteção que o simulado dá a quem já iniciou a prova.
 */
export async function desvincularGrupo(
  pacoteId: string,
  grupoId: string,
  preservarQuemEmitiu: boolean,
): Promise<{ ok: boolean; preservados?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  let preservados = 0
  if (preservarQuemEmitiu) {
    const p = await previaDesvincularGrupo(pacoteId, grupoId)
    if (p.ok && p.previa?.jaEmitiram) {
      const membros = await fetchAll<any>(() =>
        svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grupoId).order('estudante_id') as any,
      )
      const ids = [...new Set(membros.map((m) => m.estudante_id))]
      const itens = await fetchAll<any>(() =>
        svc.from('simulado_cronograma_pacote_itens').select('cronograma_id').eq('tenant_id', g.tenantId).eq('pacote_id', pacoteId).order('id') as any,
      )
      const cronIds = itens.map((i) => i.cronograma_id)
      if (cronIds.length && ids.length) {
        const emissoes = await fetchAllByIn<any>(ids, (chunk) =>
          svc
            .from('simulado_cronograma_emissoes')
            .select('estudante_id')
            .eq('tenant_id', g.tenantId)
            .in('cronograma_id', cronIds)
            .in('estudante_id', chunk)
            .order('id') as any,
        )
        const manter = [...new Set(emissoes.map((e) => e.estudante_id))]
        for (let i = 0; i < manter.length; i += 500) {
          await svc.from('simulado_cronograma_pacote_estudantes').upsert(
            manter.slice(i, i + 500).map((estudante_id) => ({ tenant_id: g.tenantId, pacote_id: pacoteId, estudante_id })),
            { onConflict: 'pacote_id,estudante_id', ignoreDuplicates: true },
          )
        }
        preservados = manter.length
      }
    }
  }

  const { error } = await svc
    .from('simulado_cronograma_pacote_grupos')
    .delete()
    .eq('tenant_id', g.tenantId)
    .eq('pacote_id', pacoteId)
    .eq('grupo_id', grupoId)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({
    operacao: 'BLOQUEAR',
    entidade: 'simulado_cronograma_pacote_grupos',
    entidadeId: pacoteId,
    depois: { grupo_id: grupoId, preservados },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath(`/admin/cronogramas/pacotes/${pacoteId}`)
  return { ok: true, preservados }
}

/** Busca alunos por nome ou e-mail, para o vínculo individual. */
export async function buscarEstudantes(termo: string): Promise<{ ok: boolean; itens?: { id: string; nome: string; email: string | null }[]; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  // Os caracteres removidos são os que o PostgREST usa como sintaxe de filtro.
  const t = termo.trim().replace(/[%,()*]/g, ' ').replace(/\s+/g, ' ')
  if (t.length < 2) return { ok: true, itens: [] }
  const svc = createAdminClient()

  const { data, error } = await svc
    .from('simulado_estudantes')
    .select('id, nome, email')
    .eq('tenant_id', g.tenantId)
    .eq('deletado', false)
    .or(`nome.ilike.%${t}%,email.ilike.%${t}%`)
    .order('nome')
    .limit(30)
  if (error) return { ok: false, error: error.message }

  const achados = (data ?? []) as { id: string; nome: string; email: string | null }[]
  const partes = t.split(' ').filter((x) => x.length >= 2)

  // Segunda tentativa quando a frase inteira não casa: busca pelo termo MAIS LONGO e
  // filtra em memória exigindo todos os pedaços. Assim "luiza ana" acha "Ana Luiza" —
  // que o ilike da frase inteira não acharia — sem trazer todas as Anas.
  if (achados.length === 0 && partes.length > 1) {
    const maior = partes.reduce((a, b) => (b.length > a.length ? b : a))
    const { data: amplo } = await svc
      .from('simulado_estudantes')
      .select('id, nome, email')
      .eq('tenant_id', g.tenantId)
      .eq('deletado', false)
      .or(`nome.ilike.%${maior}%,email.ilike.%${maior}%`)
      .order('nome')
      .limit(200)

    const norm = (x: string) =>
      x
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
    const alvo = partes.map(norm)
    return {
      ok: true,
      itens: ((amplo ?? []) as any[])
        .filter((a) => {
          const campo = norm(`${a.nome} ${a.email ?? ''}`)
          return alvo.every((x) => campo.includes(x))
        })
        .slice(0, 30),
    }
  }

  return { ok: true, itens: achados }
}

export async function alternarEstudanteNoPacote(pacoteId: string, estudanteId: string, dentro: boolean): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  if (dentro) {
    const { error } = await svc
      .from('simulado_cronograma_pacote_estudantes')
      .upsert({ tenant_id: g.tenantId, pacote_id: pacoteId, estudante_id: estudanteId }, { onConflict: 'pacote_id,estudante_id', ignoreDuplicates: true })
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await svc
      .from('simulado_cronograma_pacote_estudantes')
      .delete()
      .eq('tenant_id', g.tenantId)
      .eq('pacote_id', pacoteId)
      .eq('estudante_id', estudanteId)
    if (error) return { ok: false, error: error.message }
  }

  await registrarAudit({
    operacao: dentro ? 'LIBERAR' : 'BLOQUEAR',
    entidade: 'simulado_cronograma_pacote_estudantes',
    entidadeId: pacoteId,
    depois: { estudante_id: estudanteId, dentro },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath(`/admin/cronogramas/pacotes/${pacoteId}`)
  return { ok: true }
}

/**
 * Alunos de um grupo, para a tela mostrar QUEM recebe — não só quantos.
 *
 * Paginado: um grupo pode passar de 1.000 membros, e sem isso a lista mentiria sobre o
 * próprio tamanho. O corte em 500 é de exibição; a contagem vem do total real.
 */
export async function membrosDoGrupo(
  grupoId: string,
): Promise<{ ok: boolean; itens?: { id: string; nome: string; email: string | null }[]; total?: number; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const membros = await fetchAll<any>(() =>
    svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grupoId).order('estudante_id') as any,
  )
  const ids = [...new Set(membros.map((m) => m.estudante_id))]
  if (!ids.length) return { ok: true, itens: [], total: 0 }

  const alunos = await fetchAllByIn<any>(ids.slice(0, 500), (chunk) =>
    svc.from('simulado_estudantes').select('id, nome, email').in('id', chunk).eq('tenant_id', g.tenantId).order('nome') as any,
  )
  return {
    ok: true,
    itens: alunos.map((a) => ({ id: a.id, nome: a.nome, email: a.email ?? null })),
    total: ids.length,
  }
}
