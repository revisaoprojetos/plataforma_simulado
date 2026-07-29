'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/permissions'
import { copiarBanco, copiarEstudante, copiarCaderno } from '@/lib/compartilhamento/copiar'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'

/** Plataformas ativas (origem/destino do compartilhamento). Só super-admin global. */
export async function listarPlataformas(): Promise<{ ok?: boolean; error?: string; plataformas?: { id: string; nome: string; slug: string }[] }> {
  if (!(await isSuperAdmin())) return { error: 'Área exclusiva do super-administrador global.' }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_tenants').select('id, nome, slug').eq('ativo', true).order('nome')
  return { ok: true, plataformas: (data ?? []).map((t: any) => ({ id: t.id, nome: t.nome, slug: t.slug })) }
}

/** Bancos (pastas) de uma plataforma de origem, com a contagem de questões. */
export async function listarBancosPlataforma(origem: string): Promise<{ ok?: boolean; error?: string; bancos?: { id: string; nome: string; questoes: number }[]; estudantes?: number; cadernos?: { id: string; nome: string }[] }> {
  if (!(await isSuperAdmin())) return { error: 'Área exclusiva do super-administrador global.' }
  if (!origem) return { error: 'Origem ausente.' }
  const svc = createAdminClient()

  const bancos = await fetchAll<{ id: string; nome: string }>(() =>
    svc.from('simulado_pastas').select('id, nome').eq('tenant_id', origem).order('nome'))
  const ids = bancos.map((b) => b.id)
  const cont: Record<string, number> = {}
  if (ids.length) {
    const vinc = await fetchAll<{ pasta_id: string }>(() =>
      svc.from('simulado_questao_pasta').select('pasta_id').eq('tenant_id', origem).in('pasta_id', ids).order('pasta_id'))
    for (const v of vinc) cont[v.pasta_id] = (cont[v.pasta_id] ?? 0) + 1
  }

  const { count } = await svc.from('simulado_estudantes').select('*', { count: 'exact', head: true }).eq('tenant_id', origem).eq('deletado', false)

  const cadernos = await fetchAll<{ id: string; nome: string }>(() =>
    svc.from('simulado_cadernos_designer').select('id, nome').eq('tenant_id', origem).eq('deletado', false).order('nome'))

  return { ok: true, bancos: bancos.map((b) => ({ id: b.id, nome: b.nome, questoes: cont[b.id] ?? 0 })), estudantes: count ?? 0, cadernos: cadernos.map((c) => ({ id: c.id, nome: c.nome })) }
}

/** Copia bancos selecionados (com suas questões) da origem para o destino. Idempotente. */
export async function compartilharBancos(origem: string, destino: string, bancoIds: string[]): Promise<{ ok?: boolean; error?: string; bancos?: number; questoes?: number }> {
  if (!(await isSuperAdmin())) return { error: 'Área exclusiva do super-administrador global.' }
  if (!origem || !destino || origem === destino) return { error: 'Escolha plataformas de origem e destino DIFERENTES.' }
  const ids = [...new Set((bancoIds ?? []).filter(Boolean))]
  if (!ids.length) return { error: 'Selecione ao menos um banco.' }

  const svc = createAdminClient()
  let bancos = 0, questoes = 0
  for (const id of ids) {
    const r = await copiarBanco(svc, origem, destino, id)
    if (r.destinoId) { bancos++; questoes += r.questoes }
  }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_compartilhamentos', tenantId: destino, depois: { origem, tipo: 'banco', bancos, questoes } })
  return { ok: true, bancos, questoes }
}

/** Copia TODOS os estudantes da origem para o destino (dedup por e-mail). Idempotente. */
export async function compartilharEstudantes(origem: string, destino: string): Promise<{ ok?: boolean; error?: string; copiados?: number }> {
  if (!(await isSuperAdmin())) return { error: 'Área exclusiva do super-administrador global.' }
  if (!origem || !destino || origem === destino) return { error: 'Escolha plataformas de origem e destino DIFERENTES.' }
  const svc = createAdminClient()
  const ests = await fetchAll<{ id: string }>(() =>
    svc.from('simulado_estudantes').select('id').eq('tenant_id', origem).eq('deletado', false).order('id'))
  let copiados = 0
  for (const e of ests) { if (await copiarEstudante(svc, origem, destino, e.id)) copiados++ }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_compartilhamentos', tenantId: destino, depois: { origem, tipo: 'estudante', copiados } })
  return { ok: true, copiados }
}

/** Copia cadernos selecionados (com o banco de questões vinculado) da origem para o destino. Idempotente. */
export async function compartilharCadernos(origem: string, destino: string, cadernoIds: string[]): Promise<{ ok?: boolean; error?: string; cadernos?: number }> {
  if (!(await isSuperAdmin())) return { error: 'Área exclusiva do super-administrador global.' }
  if (!origem || !destino || origem === destino) return { error: 'Escolha plataformas de origem e destino DIFERENTES.' }
  const ids = [...new Set((cadernoIds ?? []).filter(Boolean))]
  if (!ids.length) return { error: 'Selecione ao menos um caderno.' }
  const svc = createAdminClient()
  let cadernos = 0
  for (const id of ids) { if (await copiarCaderno(svc, origem, destino, id)) cadernos++ }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_compartilhamentos', tenantId: destino, depois: { origem, tipo: 'caderno', cadernos } })
  return { ok: true, cadernos }
}
