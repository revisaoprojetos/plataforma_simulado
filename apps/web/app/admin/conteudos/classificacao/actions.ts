'use server'

// Ações da CLASSIFICAÇÃO standalone (Estúdio de Conteúdo). Curadoria do CADASTRO de taxonomia —
// disciplinas, assuntos, bancas e órgãos — para que a questão possa ESCOLHER do cadastro em vez de
// criar por nome (get-or-create, que duplica). Escrevem nas tabelas que já existem
// (simulado_disciplinas/_assuntos/_bancas/_orgaos); NÃO precisam de migration.
//
// Permissão: classificacao:manage (escrita). Listar e mesclar reusam as actions de
// app/admin/questoes/taxonomia-actions.ts (listarTaxonomia / unificarTaxonomia). Toda escrita audita.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { esquecer, chaveRelatorio } from '@/lib/cache/relatorio-cache'
import { CFG_TAX } from '@/app/admin/questoes/taxonomia-tipos'

// Só os tipos ENTIDADE (tabela própria) entram na curadoria. cargo/ano/assunto_detalhe são valores-texto
// e já têm a unificação na tela de Questões — ficam fora do cadastro de entidades.
export type TipoEntidade = 'disciplina' | 'assunto' | 'banca' | 'orgao'
const TIPOS_OK: TipoEntidade[] = ['disciplina', 'assunto', 'banca', 'orgao']

function cfgDe(tipo: TipoEntidade): { tabela: string; fk: string } {
  const c = CFG_TAX[tipo]
  if (c.kind !== 'entidade') throw new Error('tipo inválido')
  return { tabela: c.tabela, fk: c.fk }
}

async function guard() {
  if (!(await checkPermission('classificacao:manage'))) {
    return { ok: false as const, error: 'Sem permissão.' }
  }
  const a = await getCurrentAccess()
  if (!a.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: a.tenantId, userId: a.userId ?? null }
}

/** Invalida o cache de contagens (taxonomia-actions) do tipo mexido — a lista volta fresca. */
function invalidarCache(tenantId: string, tipo: TipoEntidade) {
  // disciplina e o filho assunto compartilham dados → invalida os dois.
  esquecer(chaveRelatorio(tenantId, 'taxonomia', tipo))
  if (tipo === 'disciplina') esquecer(chaveRelatorio(tenantId, 'taxonomia', 'assunto'))
}

function revalidar() {
  revalidatePath('/admin/conteudos/classificacao')
  revalidatePath('/admin/questoes')
}

/** Cria um item do cadastro (disciplina/assunto/banca/órgão). `disciplinaId` é obrigatório p/ assunto. */
export async function criarItemTaxonomia(
  tipo: TipoEntidade,
  nome: string,
  opts?: { disciplinaId?: string | null },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  if (!TIPOS_OK.includes(tipo)) return { ok: false, error: 'Tipo inválido.' }
  const n = nome.trim()
  if (!n) return { ok: false, error: 'Informe um nome.' }
  const { tabela } = cfgDe(tipo)
  const svc = createAdminClient()

  // Evita duplicado por nome (case-insensitive) no mesmo tenant (e, p/ assunto, na mesma disciplina).
  let dupQ = svc.from(tabela).select('id').eq('tenant_id', g.tenantId).ilike('nome', n)
  if (tipo === 'assunto' && opts?.disciplinaId) dupQ = dupQ.eq('disciplina_id', opts.disciplinaId)
  const { data: existente } = await dupQ.maybeSingle()
  if (existente) return { ok: false, error: 'Já existe um item com esse nome.' }

  const row: Record<string, unknown> = { tenant_id: g.tenantId, nome: n }
  if (tipo === 'assunto') row.disciplina_id = opts?.disciplinaId ?? null
  const { data, error } = await svc.from(tabela).insert(row).select('id').single()
  if (error || !data) return { ok: false, error: error?.message ?? 'Erro ao criar.' }

  await registrarAudit({ operacao: 'INSERT', entidade: tabela, entidadeId: (data as any).id, depois: { nome: n } })
  invalidarCache(g.tenantId, tipo)
  revalidar()
  return { ok: true, id: (data as any).id }
}

/** Renomeia um item do cadastro. */
export async function renomearItemTaxonomia(tipo: TipoEntidade, id: string, nome: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  if (!TIPOS_OK.includes(tipo)) return { ok: false, error: 'Tipo inválido.' }
  const n = nome.trim()
  if (!n) return { ok: false, error: 'Informe um nome.' }
  const { tabela } = cfgDe(tipo)
  const svc = createAdminClient()
  const { data: antes } = await svc.from(tabela).select('nome').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  const { error } = await svc.from(tabela).update({ nome: n }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: tabela, entidadeId: id, antes: { nome: (antes as any)?.nome ?? null }, depois: { nome: n } })
  invalidarCache(g.tenantId, tipo)
  revalidar()
  return { ok: true }
}

/** Reclassifica um ASSUNTO para outra disciplina (troca o "pai"). Só mexe na coluna disciplina_id de
 *  uma tabela existente — sem migration. Valida tenant dos dois lados e audita. */
export async function reparentarAssunto(assuntoId: string, disciplinaId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  if (!assuntoId || !disciplinaId) return { ok: false, error: 'Escolha o assunto e a disciplina.' }
  const svc = createAdminClient()
  const { data: a } = await svc.from('simulado_assuntos').select('id, disciplina_id, nome').eq('id', assuntoId).eq('tenant_id', g.tenantId).maybeSingle()
  if (!a) return { ok: false, error: 'Assunto inválido.' }
  const { data: d } = await svc.from('simulado_disciplinas').select('id').eq('id', disciplinaId).eq('tenant_id', g.tenantId).maybeSingle()
  if (!d) return { ok: false, error: 'Disciplina inválida.' }
  const atual = (a as any).disciplina_id as string | null
  if (atual === disciplinaId) return { ok: true }
  const { error } = await svc.from('simulado_assuntos').update({ disciplina_id: disciplinaId }).eq('id', assuntoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_assuntos', entidadeId: assuntoId, antes: { disciplina_id: atual }, depois: { disciplina_id: disciplinaId } })
  invalidarCache(g.tenantId, 'assunto')
  invalidarCache(g.tenantId, 'disciplina')
  revalidar()
  return { ok: true }
}

/** Exclui um item do cadastro — BLOQUEIA se houver questões (ou assuntos filhos) vinculados. */
export async function excluirItemTaxonomia(tipo: TipoEntidade, id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  if (!TIPOS_OK.includes(tipo)) return { ok: false, error: 'Tipo inválido.' }
  const { tabela, fk } = cfgDe(tipo)
  const svc = createAdminClient()

  // Questões que referenciam o item → não deixa apagar (quebraria histórico). Oriente a mesclar.
  const { count: usos } = await svc
    .from('simulado_questoes').select('*', { count: 'exact', head: true })
    .eq('tenant_id', g.tenantId).eq('deletado', false).eq(fk, id)
  if ((usos ?? 0) > 0) {
    return { ok: false, error: `Em uso por ${usos} questão(ões). Mescle com outro item em vez de excluir.` }
  }
  if (tipo === 'disciplina') {
    const { count: filhos } = await svc
      .from('simulado_assuntos').select('*', { count: 'exact', head: true })
      .eq('tenant_id', g.tenantId).eq('disciplina_id', id)
    if ((filhos ?? 0) > 0) return { ok: false, error: `Tem ${filhos} assunto(s) vinculado(s). Remova-os antes.` }
  }

  const { data: antes } = await svc.from(tabela).select('nome').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  const { error } = await svc.from(tabela).delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: tabela, entidadeId: id, antes: { nome: (antes as any)?.nome ?? null } })
  invalidarCache(g.tenantId, tipo)
  revalidar()
  return { ok: true }
}
