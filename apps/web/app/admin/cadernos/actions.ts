'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softDelete } from '@/lib/soft-delete'

export interface CadernoBloco {
  id: string
  tipo: 'texto' | 'questao'
  conteudo?: string
  questao_id?: string
}
export interface CadernoConfig {
  cabecalho?: string
  instrucoes?: string
  blocos: CadernoBloco[]
}

export async function criarCaderno(nome: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!(await checkPermission('questoes:create')) && !(await checkPermission('questoes:update'))) {
    return { ok: false, error: 'Sem permissão.' }
  }
  const access = await getCurrentAccess()
  if (!nome.trim()) return { ok: false, error: 'Informe um nome.' }

  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_cadernos_designer')
    .insert({ tenant_id: access.tenantId, nome: nome.trim(), config: { blocos: [] } })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_cadernos_designer', entidadeId: data.id, depois: { nome } })
  // Sem revalidatePath aqui: revalidar a rota atual corre com o redirect do cliente
  // pro editor e cancela a navegação. A lista revalida ao voltar.
  return { ok: true, id: data.id }
}

export async function salvarCadernoConfig(id: string, config: CadernoConfig): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cadernos_designer')
    .update({ config, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/cadernos/${id}`)
  return { ok: true }
}

/** Salva o documento do editor de blocos v2 (docsV2/modalidadesV2/cores), preservando campos legados. */
export async function salvarCadernoDesignerV2(
  id: string,
  payload: { docsV2: Record<string, unknown>; modalidadesV2: unknown[]; cores: Record<string, string>; bancoId?: string | null; hudCores?: Record<string, string>; hudPorPagina?: Record<string, Record<string, string>> },
): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { data: atual } = await svc.from('simulado_cadernos_designer').select('config').eq('id', id).eq('tenant_id', access.tenantId).maybeSingle()
  if (!atual) return { ok: false, error: 'Caderno não encontrado.' }
  const merged = { ...((atual.config as Record<string, unknown>) ?? {}), ...payload }
  const { error } = await svc
    .from('simulado_cadernos_designer')
    .update({ config: merged, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/cadernos/${id}`)
  return { ok: true }
}

/**
 * Converte um .docx (enviado em base64) em um documento do caderno (blocos).
 * NÃO grava nada — o editor insere o resultado no estado e o admin revisa e salva.
 * O mammoth é carregado sob demanda (dynamic import) e roda fora do bundle (serverExternalPackages).
 */
export async function converterWordAction(base64: string): Promise<{ ok: boolean; doc?: unknown; avisos?: string[]; resumo?: { blocos: number; imagens: number; tabelas: number }; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  try {
    const b64 = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64 // tolera "data:...;base64,"
    const buffer = Buffer.from(b64, 'base64')
    if (!buffer.length) return { ok: false, error: 'Arquivo vazio.' }
    const { converterWordParaDoc } = await import('@/lib/caderno-designer/import-word')
    const { doc, avisos, resumo } = await converterWordParaDoc(buffer)
    return { ok: true, doc, avisos, resumo }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Falha ao ler o Word.' }
  }
}

/** Atualiza nome + personalização (cor/ícone/capa) do caderno. Tolerante caso as colunas não existam. */
export async function atualizarCaderno(id: string, nome: string, cor: string | null, icone: string | null, capaUrl?: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }

  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cadernos_designer')
    .update({ nome: titulo, cor: cor || null, icone: icone || null, capa_url: capaUrl || null })
    .eq('id', id).eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
  if (error && /cor|icone|capa_url|column/i.test(error.message)) {
    const { error: e2 } = await svc.from('simulado_cadernos_designer').update({ nome: titulo }).eq('id', id).eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
    if (e2) return { ok: false, error: e2.message }
  } else if (error) {
    return { ok: false, error: error.message }
  }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cadernos_designer', entidadeId: id, depois: { nome: titulo, cor, icone, capa: !!capaUrl } })
  revalidatePath('/admin/cadernos')
  return { ok: true }
}

export async function excluirCaderno(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const { error } = await softDelete('simulado_cadernos_designer', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_cadernos_designer', entidadeId: id, depois: { deletado: true } })
  revalidatePath('/admin/cadernos')
  return { ok: true }
}

/** Grupos de disciplinas definidos no banco (pasta): [{ id, nome, disciplinas:[nomes] }]. */
export async function getGruposBanco(bancoId: string): Promise<{ ok: boolean; grupos?: { id: string; nome: string; disciplinas: string[] }[] }> {
  if (!bancoId) return { ok: true, grupos: [] }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_pastas').select('grupos').eq('id', bancoId).eq('tenant_id', access.tenantId).maybeSingle()
  const grupos = Array.isArray((data as any)?.grupos) ? (data as any).grupos : []
  return { ok: true, grupos: grupos.map((g: any) => ({ id: String(g.id ?? g.nome), nome: String(g.nome ?? ''), disciplinas: Array.isArray(g.disciplinas) ? g.disciplinas.map(String) : [] })) }
}

/** Assuntos principais das questões do banco, agrupados por disciplina (slug → nomes). */
export async function getAssuntosBanco(bancoId: string): Promise<{ ok: boolean; porDisciplina?: Record<string, string[]> }> {
  if (!bancoId) return { ok: true, porDisciplina: {} }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false }
  const svc = createAdminClient()
  const { data: vinc } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', access.tenantId)
  const ids = [...new Set((vinc ?? []).map((v: any) => v.questao_id).filter(Boolean))]
  if (!ids.length) return { ok: true, porDisciplina: {} }
  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const porDisc: Record<string, Set<string>> = {}
  const CHUNK = 500
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data: qs } = await svc.from('simulado_questoes').select('disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome)').in('id', ids.slice(i, i + CHUNK)).eq('deletado', false)
    for (const q of qs ?? []) {
      const d = (q as any).disciplinas?.nome as string | undefined
      const a = (q as any).assuntos?.nome as string | undefined
      if (!d || !a) continue
      const k = slug(d); (porDisc[k] ??= new Set<string>()).add(a)
    }
  }
  const out: Record<string, string[]> = {}
  for (const k of Object.keys(porDisc)) out[k] = [...porDisc[k]].sort()
  return { ok: true, porDisciplina: out }
}
