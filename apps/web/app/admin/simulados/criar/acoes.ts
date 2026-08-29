'use server'

// Ações LEVES da criação de simulado (imagem de capa, pastas, grupos). Módulo separado
// e enxuto de propósito: as páginas do fluxo importam daqui em vez do simulados/actions.ts
// gigante — assim o Next não compila todo aquele grafo ao abrir a 1ª etapa (dev mais rápido).
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { hospedarBase64 } from '@/lib/storage/hospedar-base64'
import { selecionarGrupos, contarMembrosGrupos } from '@/lib/simulado/grupos'

/** Hospeda uma imagem (base64) e devolve a URL — usado na etapa Personalizar (upload na hora). */
export async function hospedarImagemCapa(base64: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!(await checkPermission('simulados:create'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  try {
    const svc = createAdminClient()
    const url = await hospedarBase64(base64, svc, { tenantId })
    return { ok: true, url: url ?? undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao enviar a imagem.' }
  }
}

/** Pastas para a etapa Salvamento: uma lista por área (simulado / banco). */
export type PastaSalvar = { id: string; nome: string; pai_id: string | null }

export async function listarPastasParaSalvar(): Promise<{ ok: boolean; simulado?: PastaSalvar[]; banco?: PastaSalvar[]; error?: string }> {
  if (!(await checkPermission('simulados:create'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  // Traz pai_id para montar a árvore (pastas × subpastas). Tolerante caso a coluna não exista.
  const buscar = async (cols: string): Promise<{ data: any[] | null; error: any }> => {
    const all: any[] = []
    let off = 0
    while (true) {
      const { data, error } = await svc.from('simulado_pastas').select(cols).eq('tenant_id', tenantId).range(off, off + 999)
      if (error) return { data: null, error }
      if (!Array.isArray(data) || data.length === 0) break
      all.push(...data)
      if (data.length < 1000) break
      off += 1000
    }
    return { data: all, error: null }
  }
  let { data: all, error } = await buscar('id,nome,is_folder,folder_area,deletado,pai_id')
  if (error && /pai_id|column/i.test(String(error.message))) ({ data: all } = await buscar('id,nome,is_folder,folder_area,deletado'))
  const linhas = all ?? []
  const folders = linhas.filter((p) => !p.deletado && p.is_folder)
  const map = (p: any): PastaSalvar => ({ id: p.id, nome: p.nome, pai_id: p.pai_id ?? null })
  const simulado = folders.filter((p) => p.folder_area === 'simulado').map(map)
  const banco = folders.filter((p) => p.folder_area !== 'simulado' && p.folder_area !== 'caderno').map(map)
  return { ok: true, simulado, banco }
}

/** Grupos do tenant (id + nome + cor + nº de membros) para a etapa Estudantes. */
/** ESTRUTURA dos grupos (pastas + grupos), SEM contagem — carrega rápido (só as linhas de grupo).
 *  As contagens vêm depois por `contarGruposSimulado` (cacheadas), evitando travar a abertura. */
export async function listarGruposParaSimulado(): Promise<{ ok: boolean; grupos?: { id: string; nome: string; cor: string | null; pai_id: string | null; is_mestre: boolean }[]; error?: string }> {
  if (!(await checkPermission('simulados:create'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  // Mesma fonte do banco: traz pai_id/is_mestre (pastas) tolerando colunas ausentes.
  const gruposRaw = await selecionarGrupos(svc, tenantId)
  return { ok: true, grupos: gruposRaw.map((gp) => ({ id: gp.id, nome: gp.nome ?? 'Grupo', cor: gp.cor ?? null, pai_id: gp.pai_id ?? null, is_mestre: gp.is_mestre })) }
}

/** Contagem de membros por grupo (memorizada, TTL 5 min) — números pré-setados p/ o seletor. */
export async function contarGruposSimulado(): Promise<{ ok: boolean; counts?: Record<string, number>; error?: string }> {
  if (!(await checkPermission('simulados:create'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  return { ok: true, counts: await contarMembrosGrupos(svc, tenantId) }
}

export type MembroGrupo = { id: string; nome: string; email: string | null; telefone: string | null; cpf: string | null; classificacao: string | null; avatar: string | null; perfil_avatar_cor: string | null }

/** Membros (dados de exibição) dos grupos informados, por grupo — p/ mostrar na tabela da etapa. */
export async function listarMembrosGrupos(grupoIds: string[]): Promise<{ ok: boolean; membros?: Record<string, MembroGrupo[]>; error?: string }> {
  if (!(await checkPermission('simulados:create'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const ids = [...new Set((grupoIds ?? []).filter(Boolean))]
  if (!ids.length) return { ok: true, membros: {} }
  const svc = createAdminClient()
  const links = await fetchAllByIn<{ grupo_id: string; estudante_id: string }>(ids, (chunk) =>
    svc.from('simulado_grupo_membros').select('grupo_id, estudante_id').eq('tenant_id', tenantId).in('grupo_id', chunk).order('estudante_id', { ascending: true }))
  const estIds = [...new Set(links.map((l) => l.estudante_id).filter(Boolean))]
  const ests = estIds.length
    ? await fetchAllByIn<any>(estIds, (chunk) => svc.from('simulado_estudantes').select('id, nome, email, telefone, cpf, classificacao, avatar, perfil_avatar_cor').eq('tenant_id', tenantId).in('id', chunk), { chunk: 300 })
    : []
  const map = new Map<string, MembroGrupo>(ests.map((e: any) => [e.id, { id: e.id, nome: e.nome ?? 'Estudante', email: e.email ?? null, telefone: e.telefone ?? null, cpf: e.cpf ?? null, classificacao: e.classificacao ?? null, avatar: e.avatar ?? null, perfil_avatar_cor: e.perfil_avatar_cor ?? null }]))
  const out: Record<string, MembroGrupo[]> = {}
  for (const l of links) { const e = map.get(l.estudante_id); if (e) (out[l.grupo_id] ??= []).push(e) }
  return { ok: true, membros: out }
}
