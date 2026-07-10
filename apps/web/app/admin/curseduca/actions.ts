'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { curseducaConfigurado, listarTodosGrupos, contarMembros, listarMembrosDoGrupo, mapaMatriculasGrupo, contarMuitosGrupos, detalheMembro, type MembroCurseduca, type DetalheMembro } from '@/lib/curseduca/client'

export type GrupoCurseducaDTO = { id: number; nome: string; criadoEm: string | null }
export type GrupoSistema = { id: string; nome: string }
export type DestinoImport = { tipo: 'nenhum' | 'existente' | 'novo'; grupoId?: string; nomeNovo?: string }
export type ResultadoImportCurseduca = { ok: boolean; error?: string; total?: number; novos?: number; jaExistiam?: number; atualizados?: number; vinculados?: number; semIdentificador?: number; semDetalhe?: number; restante?: number; grupoNome?: string | null }

async function guard() {
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, userId: access.userId }
}

/** Lista os grupos de acesso da Curseduca + os grupos do sistema (para destino). */
export async function listarGruposCurseduca(): Promise<{ ok: boolean; error?: string; grupos?: GrupoCurseducaDTO[]; sistema?: GrupoSistema[] }> {
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  if (!curseducaConfigurado()) return { ok: false, error: 'Integração Curseduca não configurada (credenciais ausentes no servidor).' }
  const g = await guard(); if (!g.ok) return { ok: false, error: g.error }
  try {
    const grupos = (await listarTodosGrupos())
      .map((x) => ({ id: x.id, nome: x.nome, criadoEm: x.criadoEm }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    const svc = createAdminClient()
    const { data: sis } = await svc.from('simulado_grupos').select('id, nome').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome')
    return { ok: true, grupos, sistema: (sis ?? []).map((s: any) => ({ id: s.id, nome: s.nome })) }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao consultar a Curseduca.' }
  }
}

/** Conta quantos membros há nos grupos selecionados (rápido). */
export async function contarMembrosGrupos(ids: number[]): Promise<{ ok: boolean; total?: number; porGrupo?: Record<number, number>; error?: string }> {
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  try {
    const porGrupo: Record<number, number> = {}
    let total = 0
    for (const id of ids) { const n = await contarMembros(id); porGrupo[id] = n; total += n }
    return { ok: true, total, porGrupo }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao contar membros.' }
  }
}

/** Conta membros de TODOS os grupos informados (para exibir a coluna de contagem na lista). */
export async function contarTodosGrupos(ids: number[]): Promise<{ ok: boolean; contagens?: Record<number, number>; error?: string }> {
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  if (!curseducaConfigurado()) return { ok: false, error: 'Integração Curseduca não configurada.' }
  try {
    return { ok: true, contagens: await contarMuitosGrupos(ids) }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao contar membros.' }
  }
}

export type MembroPreview = {
  id: number; nome: string; email: string | null; cpf: string | null; telefone: string | null
  situacao: string | null; criadoEm: string | null; ultimoAcesso: string | null; cidade: string | null; uf: string | null
  entrouEm: string | null       // entrada no grupo (enteredAt)
  expiraEm: string | null       // data de expiração (null quando vitalício)
  temMatricula: boolean         // se há registro de matrícula no grupo (p/ distinguir vitalício de desconhecido)
}

/** Lista os membros de um grupo (perfil + matrícula: entrada/expiração no grupo) para pré-visualização. */
export async function previewMembrosGrupo(groupId: number): Promise<{ ok: boolean; error?: string; membros?: MembroPreview[] }> {
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  if (!curseducaConfigurado()) return { ok: false, error: 'Integração Curseduca não configurada.' }
  try {
    const [lista, matriculas] = await Promise.all([listarMembrosDoGrupo(groupId), mapaMatriculasGrupo(groupId)])
    const membros = lista.map((m) => {
      const mat = matriculas.get(m.id)
      return {
        id: m.id, nome: m.nome, email: m.email, cpf: m.cpf, telefone: m.telefone,
        situacao: m.situacao, criadoEm: m.criadoEm, ultimoAcesso: m.ultimoAcesso, cidade: m.cidade, uf: m.uf,
        entrouEm: mat?.entrouEm ?? null, expiraEm: mat?.expiraEm ?? null, temMatricula: !!mat,
      }
    })
    return { ok: true, membros }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao carregar membros.' }
  }
}

/**
 * Importa os membros dos grupos selecionados da Curseduca.
 * - Cria só quem ainda não existe (dedupe por matrícula Curseduca, e-mail ou CPF).
 * - Se um destino de grupo for informado, VINCULA todos (novos e já existentes) a ele.
 */
export async function importarGruposCurseduca(ids: number[], destino: DestinoImport): Promise<ResultadoImportCurseduca> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão para cadastrar estudantes.' }
  if (!curseducaConfigurado()) return { ok: false, error: 'Integração Curseduca não configurada.' }
  const g = await guard(); if (!g.ok) return { ok: false, error: g.error }
  if (!ids?.length) return { ok: false, error: 'Selecione ao menos um grupo.' }
  const svc = createAdminClient()

  try {
    // 1) Coleta os membros de todos os grupos (dedupe entre grupos pelo id da Curseduca).
    const porId = new Map<number, MembroCurseduca>()
    for (const gid of ids) for (const m of await listarMembrosDoGrupo(gid)) if (!porId.has(m.id)) porId.set(m.id, m)
    const membros = [...porId.values()]
    const total = membros.length

    // 2) Quem já existe no sistema (por matrícula Curseduca, e-mail ou CPF).
    const { data: existentes } = await svc.from('simulado_estudantes').select('id, email, cpf, telefone, classificacao, matricula_externa').eq('tenant_id', g.tenantId).eq('deletado', false)
    const porEmail = new Map<string, string>(), porCpf = new Map<string, string>(), porExt = new Map<string, string>()
    const recPorId = new Map<string, any>()
    for (const e of existentes ?? []) {
      recPorId.set((e as any).id, e)
      if ((e as any).email) porEmail.set(String((e as any).email).toLowerCase(), (e as any).id)
      if ((e as any).cpf) porCpf.set(String((e as any).cpf).replace(/\D/g, ''), (e as any).id)
      if ((e as any).matricula_externa) porExt.set(String((e as any).matricula_externa), (e as any).id)
    }
    const acharExistente = (m: MembroCurseduca) =>
      porExt.get(String(m.id)) || (m.email ? porEmail.get(m.email) : null) || (m.cpf ? porCpf.get(m.cpf) : null) || null

    // Classificação: se o aluno está em algum grupo de "Passaporte/Passe" → passaporte; senão normal (assinatura).
    const classificar = (nomes: string[]): string => (/passaporte|passe/i.test(nomes.join(' ')) ? 'passaporte' : 'normal')

    // 3) Separa novos × existentes. Já existentes SEM CPF/telefone entram no backfill.
    const idsResolvidos: string[] = []
    let novos = 0, jaExistiam = 0, semIdentificador = 0
    const novosMembros: MembroCurseduca[] = []
    const paraBackfill: { estudanteId: string; curseducaId: number }[] = []
    for (const m of membros) {
      const ex = acharExistente(m)
      if (ex) {
        idsResolvidos.push(ex); jaExistiam++
        const rec = recPorId.get(ex)
        if (rec && (!rec.cpf || !rec.telefone || !rec.classificacao)) paraBackfill.push({ estudanteId: ex, curseducaId: m.id })
        continue
      }
      if (!m.email) { semIdentificador++; continue } // sem e-mail → não dá pra cadastrar (a lista não traz CPF)
      novosMembros.push(m)
    }

    // Orçamento de buscas de DETALHE por execução — evita timeout da server action em grupos grandes.
    // O que passar do limite entra com dados básicos (contado em `restante`); reimportar completa via backfill.
    const LIMITE_DETALHE = 400
    let usadosDetalhe = 0
    let restante = 0 // membros que ficaram sem detalhe por causa do limite (não é falha da API)

    // 3b) Enriquece os novos com o DETALHE de cada membro (CPF, telefone, grupos → classificação).
    //     A lista de membros não traz CPF/telefone — só o endpoint /members/{id}. Busca em blocos.
    let semDetalhe = 0 // detalhes que FALHARAM (ex.: rate limit) → CPF/telefone podem faltar
    const detalhePorId = new Map<number, DetalheMembro>()
    for (let i = 0; i < novosMembros.length && usadosDetalhe < LIMITE_DETALHE; i += 8) {
      const bloco = novosMembros.slice(i, i + 8)
      usadosDetalhe += bloco.length
      const res = await Promise.all(bloco.map((m) => detalheMembro(m.id)))
      bloco.forEach((m, k) => { detalhePorId.set(m.id, res[k]); if (!res[k].ok) semDetalhe++ })
    }
    restante += Math.max(0, novosMembros.length - detalhePorId.size)

    // 3c) Backfill: preenche CPF/telefone/classificação de quem já existia mas estava vazio.
    let atualizados = 0
    for (let i = 0; i < paraBackfill.length && usadosDetalhe < LIMITE_DETALHE; i += 8) {
      const bloco = paraBackfill.slice(i, i + 8)
      usadosDetalhe += bloco.length
      const res = await Promise.all(bloco.map((b) => detalheMembro(b.curseducaId)))
      for (let k = 0; k < bloco.length; k++) {
        const rec = recPorId.get(bloco[k].estudanteId); const d = res[k]; const patch: Record<string, unknown> = {}
        if (!d.ok) semDetalhe++
        if (!rec?.cpf && d.cpf) patch.cpf = d.cpf
        if (!rec?.telefone && d.telefone) patch.telefone = d.telefone
        if (!rec?.classificacao) patch.classificacao = classificar(d.gruposNomes)
        if (Object.keys(patch).length) {
          const { error } = await svc.from('simulado_estudantes').update(patch).eq('id', bloco[k].estudanteId).eq('tenant_id', g.tenantId)
          if (!error) atualizados++
        }
      }
    }

    const paraInserir: Record<string, unknown>[] = novosMembros.map((m) => {
      const d = detalhePorId.get(m.id)
      return {
        tenant_id: g.tenantId, user_id: null,
        nome: m.nome || m.email || 'Aluno', email: m.email,
        cpf: m.cpf ?? d?.cpf ?? null,
        telefone: m.telefone ?? d?.telefone ?? null,
        classificacao: classificar(d?.gruposNomes ?? []),
        matricula_externa: String(m.id),
      }
    })

    for (let i = 0; i < paraInserir.length; i += 200) {
      const lote = paraInserir.slice(i, i + 200)
      const { data, error } = await svc.from('simulado_estudantes').insert(lote).select('id')
      if (!error && data) { idsResolvidos.push(...data.map((r: any) => r.id)); novos += data.length; continue }
      // Lote falhou (ex.: conflito de e-mail/CPF) → insere um a um, pulando/vinculando conflitos.
      for (const row of lote) {
        const { data: d1, error: e1 } = await svc.from('simulado_estudantes').insert(row).select('id').single()
        if (!e1 && d1) { idsResolvidos.push((d1 as any).id); novos++; continue }
        let found: string | null = null
        if (row.email) { const { data: f } = await svc.from('simulado_estudantes').select('id').eq('tenant_id', g.tenantId).eq('email', row.email as string).eq('deletado', false).maybeSingle(); found = (f as any)?.id ?? null }
        if (!found && row.cpf) { const { data: f } = await svc.from('simulado_estudantes').select('id').eq('tenant_id', g.tenantId).eq('cpf', row.cpf as string).eq('deletado', false).maybeSingle(); found = (f as any)?.id ?? null }
        if (found) { idsResolvidos.push(found); jaExistiam++ }
      }
    }

    // 4) Vincula ao grupo do sistema (novo ou existente), se solicitado.
    let grupoNome: string | null = null, vinculados = 0, grupoDestinoId: string | null = null
    if (destino.tipo === 'existente' && destino.grupoId) {
      grupoDestinoId = destino.grupoId
      const { data: gr } = await svc.from('simulado_grupos').select('nome').eq('id', grupoDestinoId).maybeSingle()
      grupoNome = (gr as any)?.nome ?? null
    } else if (destino.tipo === 'novo' && destino.nomeNovo?.trim()) {
      const { data: gr } = await svc.from('simulado_grupos').insert({ tenant_id: g.tenantId, nome: destino.nomeNovo.trim() }).select('id, nome').single()
      grupoDestinoId = (gr as any)?.id ?? null; grupoNome = (gr as any)?.nome ?? null
    }
    if (grupoDestinoId && idsResolvidos.length) {
      const unicos = [...new Set(idsResolvidos)]
      const { data: jaTem } = await svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grupoDestinoId).in('estudante_id', unicos)
      const set = new Set((jaTem ?? []).map((r: any) => r.estudante_id))
      const novosVinc = unicos.filter((id) => !set.has(id))
      if (novosVinc.length) {
        const { error } = await svc.from('simulado_grupo_membros').insert(novosVinc.map((estudante_id) => ({ tenant_id: g.tenantId, grupo_id: grupoDestinoId, estudante_id })))
        if (!error) vinculados = novosVinc.length
      }
    }

    await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_estudantes', entidadeId: grupoDestinoId ?? 'curseduca', depois: { curseduca_grupos: ids, total, novos, jaExistiam, atualizados, vinculados, semDetalhe, restante } })
    revalidatePath('/admin/estudantes'); revalidatePath('/admin/grupos')
    return { ok: true, total, novos, jaExistiam, atualizados, vinculados, semIdentificador, semDetalhe, restante, grupoNome }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha na importação.' }
  }
}
