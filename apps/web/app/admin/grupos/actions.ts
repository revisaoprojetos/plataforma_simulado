'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { getCurrentAccess } from '@/lib/auth/permissions'

async function guard() {
  const a = await getCurrentAccess()
  if (!a.tenantId || !(a.isAdmin || a.permissions.includes('grupos:view'))) return { ok: false as const, error: 'Sem permissão.' }
  return { ok: true as const, tenantId: a.tenantId }
}

function revalidar(id?: string) {
  revalidatePath('/admin/grupos')
  if (id) revalidatePath(`/admin/grupos/${id}`)
}

/**
 * Cria um grupo de estudantes.
 * `opts.isMestre` cria uma pasta (grupo mestre); `opts.paiId` cria o grupo já dentro de uma pasta.
 * Tolerante: se as colunas `cor`/`pai_id`/`is_mestre` não existem, degrada removendo a ausente —
 * mas se o recurso de mestre foi pedido e a coluna falta, avisa para aplicar a migração.
 */
export async function criarGrupo(
  nome: string,
  cor?: string,
  opts?: { paiId?: string | null; isMestre?: boolean },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  const titulo = nome.trim(); if (!titulo) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()

  const attempt: any = { tenant_id: g.tenantId, nome: titulo }
  if (cor) attempt.cor = cor
  if (opts?.isMestre) attempt.is_mestre = true
  if (opts?.paiId != null) attempt.pai_id = opts.paiId
  const querMestre = !!opts?.isMestre || opts?.paiId != null

  for (let i = 0; i < 4; i++) {
    const r = await svc.from('simulado_grupos').insert(attempt).select('id').single()
    if (!r.error) { revalidar(); return { ok: true, id: r.data!.id } }
    const m = r.error.message
    const faltando = /pai_id/i.test(m) ? 'pai_id' : /is_mestre/i.test(m) ? 'is_mestre' : /\bcor\b/i.test(m) ? 'cor' : null
    if (!faltando) return { ok: false, error: m }
    if ((faltando === 'pai_id' || faltando === 'is_mestre') && querMestre)
      return { ok: false, error: 'Grupo mestre indisponível no banco. Aplique a migração de grupo mestre e tente de novo.' }
    delete attempt[faltando]
  }
  return { ok: false, error: 'Falha ao criar grupo.' }
}

/** Cria uma pasta (grupo mestre) que agrupa sub-grupos. */
export async function criarGrupoMestre(nome: string, cor?: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  return criarGrupo(nome, cor, { isMestre: true })
}

/**
 * Move um grupo para dentro de uma pasta (mestre) ou o solta (paiId = null).
 * Valida: o grupo não pode ser mestre; o destino, se houver, precisa ser um mestre do tenant.
 */
export async function moverGrupo(grupoId: string, paiId: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  const svc = createAdminClient()

  const grp = await svc.from('simulado_grupos').select('id, is_mestre').eq('id', grupoId).eq('tenant_id', g.tenantId).eq('deletado', false).maybeSingle()
  if (grp.error && /is_mestre/i.test(grp.error.message)) return { ok: false, error: 'Grupo mestre indisponível no banco. Aplique a migração de grupo mestre.' }
  if (!grp.data) return { ok: false, error: 'Grupo não encontrado.' }
  if ((grp.data as any).is_mestre === true) return { ok: false, error: 'Uma pasta (grupo mestre) não pode entrar em outra pasta.' }

  if (paiId) {
    const pai = await svc.from('simulado_grupos').select('id, is_mestre').eq('id', paiId).eq('tenant_id', g.tenantId).eq('deletado', false).maybeSingle()
    if (pai.error) return { ok: false, error: pai.error.message }
    if (!pai.data) return { ok: false, error: 'Pasta destino não encontrada.' }
    if ((pai.data as any).is_mestre !== true) return { ok: false, error: 'O destino precisa ser um grupo mestre (pasta).' }
  }

  const { error } = await svc.from('simulado_grupos').update({ pai_id: paiId }).eq('id', grupoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: /pai_id/i.test(error.message) ? 'Grupo mestre indisponível no banco. Aplique a migração de grupo mestre.' : error.message }
  revalidar(grupoId)
  return { ok: true }
}

/** Edita nome e cor do grupo (cor é tolerante caso a coluna não exista). */
export async function editarGrupo(id: string, nome: string, cor: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  const titulo = nome.trim(); if (!titulo) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_grupos').update({ nome: titulo, cor: cor || null }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error && /cor/i.test(error.message)) {
    const { error: e2 } = await svc.from('simulado_grupos').update({ nome: titulo }).eq('id', id).eq('tenant_id', g.tenantId)
    if (e2) return { ok: false, error: e2.message }
    revalidar(id)
    return { ok: true }
  }
  if (error) return { ok: false, error: error.message }
  revalidar(id)
  return { ok: true }
}

/** Exclui (soft delete) um grupo. Se for uma pasta (mestre), solta os filhos antes (não os apaga). */
export async function excluirGrupo(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  const svc = createAdminClient()
  // Solta os sub-grupos para que não sumam junto com a pasta (tolerante se pai_id não existe).
  const solta = await svc.from('simulado_grupos').update({ pai_id: null }).eq('pai_id', id).eq('tenant_id', g.tenantId)
  if (solta.error && !/pai_id/i.test(solta.error.message)) return { ok: false, error: solta.error.message }
  const { error } = await svc.from('simulado_grupos').update({ deletado: true }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidar()
  return { ok: true }
}

/**
 * Replica novos membros de um grupo nos bancos vinculados a ele (auto-sync).
 * Tolerante: se a tabela de vínculos não existe, não faz nada.
 */
async function sincronizarBancosDoGrupo(svc: ReturnType<typeof createAdminClient>, tenantId: string, grupoId: string, estudanteIds: string[]) {
  if (!estudanteIds.length) return
  const { data: links, error } = await svc.from('simulado_pasta_grupos').select('pasta_id').eq('grupo_id', grupoId)
  if (error || !links?.length) return
  for (const l of links) {
    const pastaId = (l as any).pasta_id
    const ja = await fetchAllByIn<{ estudante_id: string }>(estudanteIds, (chunk) =>
      svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', pastaId).in('estudante_id', chunk).order('estudante_id', { ascending: true }))
    const jaSet = new Set(ja.map((r) => r.estudante_id))
    const novos = estudanteIds.filter((id) => !jaSet.has(id))
    if (novos.length) {
      await svc.from('simulado_pasta_estudantes').insert(novos.map((estudante_id) => ({ tenant_id: tenantId, pasta_id: pastaId, estudante_id })))
      revalidatePath(`/admin/banco-questoes/${pastaId}`)
    }
  }
}

/** Adiciona estudantes ao grupo (ignora os que já são membros). */
export async function adicionarMembros(grupoId: string, estudanteIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  if (!estudanteIds.length) return { ok: true }
  const svc = createAdminClient()
  const exist = await fetchAll<{ estudante_id: string }>(() =>
    svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grupoId).order('estudante_id', { ascending: true }))
  const ja = new Set(exist.map((r) => r.estudante_id))
  const idsNovos = estudanteIds.filter((e) => !ja.has(e))
  if (!idsNovos.length) return { ok: true }
  const { error } = await svc.from('simulado_grupo_membros').insert(idsNovos.map((e) => ({ tenant_id: g.tenantId, grupo_id: grupoId, estudante_id: e })))
  if (error) return { ok: false, error: error.message }
  await sincronizarBancosDoGrupo(svc, g.tenantId, grupoId, idsNovos)
  revalidar(grupoId)
  return { ok: true }
}

/** Extrai tokens (e-mail/CPF/nome) de um texto colado ou de um arquivo .csv/.txt/.xlsx. */
async function extrairTokens(texto: string, arquivo: File | null): Promise<string[]> {
  let bruto = texto ?? ''
  if (arquivo && arquivo.size > 0) {
    const nome = (arquivo.name || '').toLowerCase()
    if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await arquivo.arrayBuffer())
      const partes: string[] = []
      wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((cell) => {
        const v: any = cell.value
        const s = v && typeof v === 'object' && 'text' in v ? v.text : v
        if (s != null && s !== '') partes.push(String(s))
      })))
      bruto += '\n' + partes.join('\n')
    } else {
      bruto += '\n' + (await arquivo.text())
    }
  }
  return bruto
    .split(/[\n\r,;\t]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/** Importa participantes por lista colada e/ou arquivo (casa por e-mail, CPF ou nome). */
export async function importarMembros(formData: FormData): Promise<{ ok: boolean; error?: string; adicionados?: number; jaEram?: number; naoEncontrados?: string[] }> {
  const g = await guard(); if (!g.ok) return g
  const grupoId = String(formData.get('grupoId') ?? '')
  if (!grupoId) return { ok: false, error: 'Grupo inválido.' }
  const texto = String(formData.get('texto') ?? '')
  const arquivo = formData.get('arquivo') as File | null

  const tokens = await extrairTokens(texto, arquivo)
  if (!tokens.length) return { ok: false, error: 'Cole uma lista ou envie um arquivo.' }

  const svc = createAdminClient()
  // Carrega estudantes do tenant, PAGINADO (fetchAll) — senão >1000 alunos são cortados e
  // muitos "não encontrados" apareceriam falsamente. cpf é tolerante caso a coluna não exista.
  let estudantes: any[] = []
  try {
    estudantes = await fetchAll<any>(() =>
      svc.from('simulado_estudantes').select('id, nome, email, cpf').eq('tenant_id', g.tenantId).eq('deletado', false).order('id', { ascending: true }))
  } catch (e: any) {
    if (/cpf/i.test(e?.message ?? String(e))) {
      estudantes = await fetchAll<any>(() =>
        svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', g.tenantId).eq('deletado', false).order('id', { ascending: true }))
    } else throw e
  }
  const byEmail = new Map<string, string>()
  const byCpf = new Map<string, string>()
  const byNome = new Map<string, string>()
  for (const e of estudantes ?? []) {
    if (e.email) byEmail.set(String(e.email).trim().toLowerCase(), e.id)
    const cpf = e.cpf ? String(e.cpf).replace(/\D/g, '') : ''
    if (cpf.length === 11) byCpf.set(cpf, e.id)
    if (e.nome) byNome.set(String(e.nome).trim().toLowerCase(), e.id)
  }

  const ids = new Set<string>()
  const naoEncontrados: string[] = []
  for (const t of tokens) {
    let id: string | undefined
    if (t.includes('@')) id = byEmail.get(t.toLowerCase())
    else {
      const digits = t.replace(/\D/g, '')
      if (digits.length === 11) id = byCpf.get(digits)
      if (!id) id = byNome.get(t.toLowerCase())
    }
    if (id) ids.add(id)
    else naoEncontrados.push(t)
  }
  if (!ids.size) return { ok: true, adicionados: 0, jaEram: 0, naoEncontrados }

  const existM = await fetchAll<{ estudante_id: string }>(() =>
    svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grupoId).order('estudante_id', { ascending: true }))
  const ja = new Set(existM.map((r) => r.estudante_id))
  const encontrados = [...ids]
  const idsAdicionados = encontrados.filter((e) => !ja.has(e))
  if (idsAdicionados.length) {
    const { error } = await svc.from('simulado_grupo_membros').insert(idsAdicionados.map((e) => ({ tenant_id: g.tenantId, grupo_id: grupoId, estudante_id: e })))
    if (error) return { ok: false, error: error.message }
    await sincronizarBancosDoGrupo(svc, g.tenantId, grupoId, idsAdicionados)
  }
  revalidar(grupoId)
  return { ok: true, adicionados: idsAdicionados.length, jaEram: encontrados.length - idsAdicionados.length, naoEncontrados }
}

/** Remove um estudante do grupo. */
export async function removerMembro(grupoId: string, estudanteId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_grupo_membros').delete().eq('grupo_id', grupoId).eq('estudante_id', estudanteId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidar(grupoId)
  return { ok: true }
}
