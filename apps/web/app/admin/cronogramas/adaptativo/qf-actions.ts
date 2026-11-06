'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { lerFiltros, salvarFiltro } from '@/lib/cronograma/adaptativo/qf-db'
import { contarQuestoesFiltro } from '@/lib/cronograma/adaptativo/qf-questoes'
import { normalizarFiltro, type FiltroQuestoesMeta, type OpcoesQf } from '@/lib/cronograma/adaptativo/qf'

// Filtro de QUESTÕES DA PLATAFORMA por meta (aula) do Catálogo de metas. Salva na hora (tabela própria),
// sem passar pelo "Salvar catálogo" — não versiona o catálogo, então não migra os planos dos alunos.

async function acesso(acao: 'view' | 'update') {
  const a = await getCurrentAccess()
  const permitido = a.isAdmin || a.permissions.includes('*') || a.permissions.includes(`cronogramas:${acao}`)
  if (!a.tenantId || !permitido) return null
  return { tenantId: a.tenantId, userId: a.userId ?? null }
}

/** Filtros já salvos do tenant, por chave de aula (entregues pelo servidor à página do catálogo). */
export async function obterFiltrosQf(): Promise<Record<string, FiltroQuestoesMeta>> {
  const g = await acesso('view'); if (!g) return {}
  return lerFiltros(createAdminClient(), g.tenantId)
}

/** Taxonomia p/ os seletores (disciplinas, assuntos, bancas, órgãos, anos). Sob demanda — não vai no render da página. */
export async function obterOpcoesQf(): Promise<{ ok: boolean; error?: string; opcoes?: OpcoesQf }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  try {
    const [disciplinas, bancas, orgaos, assuntos, anosRows] = await Promise.all([
      fetchAll<any>(() => svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', g.tenantId).order('nome', { ascending: true }).order('id', { ascending: true })),
      fetchAll<any>(() => svc.from('simulado_bancas').select('id, nome').eq('tenant_id', g.tenantId).order('nome', { ascending: true }).order('id', { ascending: true })),
      fetchAll<any>(() => svc.from('simulado_orgaos').select('id, nome').eq('tenant_id', g.tenantId).order('nome', { ascending: true }).order('id', { ascending: true })).catch(() => [] as any[]),
      fetchAll<any>(() => svc.from('simulado_assuntos').select('id, nome, disciplina_id, pai_id').eq('tenant_id', g.tenantId).order('nome', { ascending: true }).order('id', { ascending: true }))
        .catch(() => fetchAll<any>(() => svc.from('simulado_assuntos').select('id, nome, disciplina_id').eq('tenant_id', g.tenantId).order('nome', { ascending: true }).order('id', { ascending: true }))),
      svc.from('simulado_questoes').select('ano').eq('tenant_id', g.tenantId).eq('status', 'publicada').eq('deletado', false).not('ano', 'is', null).limit(3000),
    ])
    const anos = [...new Set(((anosRows.data ?? []) as Array<{ ano: number | null }>).map((r) => r.ano).filter((a): a is number => !!a))].sort((a, b) => b - a)
    return {
      ok: true,
      opcoes: {
        disciplinas: disciplinas.map((d) => ({ id: d.id, nome: String(d.nome) })),
        bancas: bancas.map((d) => ({ id: d.id, nome: String(d.nome) })),
        orgaos: orgaos.map((d) => ({ id: d.id, nome: String(d.nome) })),
        assuntos: assuntos.map((a) => ({ id: a.id, nome: String(a.nome), disciplina_id: a.disciplina_id ?? null, pai_id: a.pai_id ?? null })),
        anos,
      },
    }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao carregar as opções.' }
  }
}

/** Quantas questões elegíveis casam com o filtro (pré-visualização enquanto o admin escolhe). */
export async function contarQuestoesQf(filtro: unknown): Promise<{ ok: boolean; total?: number; error?: string }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  try {
    return { ok: true, total: await contarQuestoesFiltro(createAdminClient(), g.tenantId, normalizarFiltro(filtro)) }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao contar.' }
  }
}

/** Salva (ou remove, se vazio) o filtro de uma aula. */
export async function salvarFiltroQf(aulaKey: string, filtro: unknown): Promise<{ ok: boolean; error?: string; filtro?: FiltroQuestoesMeta }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const r = await salvarFiltro(createAdminClient(), g.tenantId, aulaKey, filtro, g.userId)
  if (!r.ok) return { ok: false, error: r.error }
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_cronograma_adaptativo_qf', entidadeId: null, tenantId: g.tenantId, atorId: g.userId,
    depois: { aula_key: aulaKey, filtro: r.filtro ?? {} },
  }).catch(() => {})
  revalidatePath('/admin/cronogramas/adaptativo/catalogo')
  return { ok: true, filtro: r.filtro }
}
