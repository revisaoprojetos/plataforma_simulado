'use server'
import type { RefClass, ClassificacaoPadrao } from './actions-tipos'

// Ações LOCAIS do Banco de Questões no Estúdio (por fora). O CRUD de banco/questão/import é
// REUSADO de app/admin/banco-questoes/actions.ts e app/admin/questoes/actions.ts — aqui só mora a
// "classificação padrão do banco" (metadado que preenche questões novas e aparece no acervo).
//
// Armazenamento MIGRATION-FREE: tenant.tema.banco_class_padrao[bancoId] = { disciplina:{id,nome}, ... }
// (mesmo padrão de salvarPastaCardFade). Guarda id + nome (denormalizado) p/ o acervo não re-resolver.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

const VAZIA: ClassificacaoPadrao = { disciplina: null, assunto: null, banca: null, orgao: null }

async function guard(acao: 'view' | 'update') {
  const perm = acao === 'update' ? 'questoes:update' : 'questoes:view'
  if (!(await checkPermission(perm)) && !(await checkPermission('questoes:view'))) {
    return { ok: false as const, error: 'Sem permissão.' }
  }
  const a = await getCurrentAccess()
  if (!a.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: a.tenantId }
}

function lerMapa(tema: Record<string, any> | null | undefined): Record<string, ClassificacaoPadrao> {
  const m = (tema?.banco_class_padrao ?? {}) as Record<string, any>
  return m && typeof m === 'object' ? m : {}
}

/** Lê a classificação padrão de UM banco (ou de VÁRIOS, se `bancoIds` for passado). */
export async function lerClassificacaoPadrao(bancoId: string): Promise<ClassificacaoPadrao> {
  const g = await guard('view')
  if (!g.ok) return VAZIA
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_tenants').select('tema').eq('id', g.tenantId).maybeSingle()
  const mapa = lerMapa((data as any)?.tema)
  const v = mapa[bancoId] as ClassificacaoPadrao | undefined
  return { ...VAZIA, ...(v ?? {}) }
}

/** Lê a classificação padrão de TODOS os bancos do tenant (p/ o acervo mostrar o subtítulo). */
export async function lerClassificacaoPadraoLote(): Promise<Record<string, ClassificacaoPadrao>> {
  const g = await guard('view')
  if (!g.ok) return {}
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_tenants').select('tema').eq('id', g.tenantId).maybeSingle()
  return lerMapa((data as any)?.tema)
}

/** Salva a classificação padrão de um banco. Recebe os IDs escolhidos DO CADASTRO; resolve os nomes. */
export async function salvarClassificacaoPadrao(
  bancoId: string,
  sel: { disciplinaId?: string | null; assuntoId?: string | null; bancaId?: string | null; orgaoId?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  if (!bancoId) return { ok: false, error: 'Banco inválido.' }
  const svc = createAdminClient()

  // Resolve nome de cada id escolhido (só do tenant). Vazio/null → limpa o campo.
  const resolver = async (tabela: string, id?: string | null): Promise<RefClass> => {
    if (!id) return null
    const { data } = await svc.from(tabela).select('id, nome').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
    return data ? { id: (data as any).id, nome: (data as any).nome ?? '—' } : null
  }
  const nova: ClassificacaoPadrao = {
    disciplina: await resolver('simulado_disciplinas', sel.disciplinaId),
    assunto: await resolver('simulado_assuntos', sel.assuntoId),
    banca: await resolver('simulado_bancas', sel.bancaId),
    orgao: await resolver('simulado_orgaos', sel.orgaoId),
  }

  const { data: t } = await svc.from('simulado_tenants').select('tema').eq('id', g.tenantId).maybeSingle()
  const tema = (((t as any)?.tema) ?? {}) as Record<string, any>
  const mapa = { ...lerMapa(tema) }
  mapa[bancoId] = nova
  const { error } = await svc.from('simulado_tenants').update({ tema: { ...tema, banco_class_padrao: mapa } }).eq('id', g.tenantId)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: bancoId, depois: { classificacao_padrao: { disciplina: nova.disciplina?.nome ?? null, assunto: nova.assunto?.nome ?? null, banca: nova.banca?.nome ?? null, orgao: nova.orgao?.nome ?? null } } })
  revalidatePath('/admin/conteudos/materiais/questoes')
  revalidatePath(`/admin/conteudos/materiais/questoes/${bancoId}`)
  return { ok: true }
}

// ───────────────────────────── Destinos (Mover) e Duplicar questões ─────────────────────────────

/** Bancos e pastas do tenant (p/ os diálogos "Mover"). Leitura enxuta, filtrada no banco. */
export async function listarDestinosBanco(excluirBancoId?: string | null): Promise<{
  bancos: { id: string; nome: string }[]; pastas: { id: string; nome: string }[]
}> {
  const g = await guard('view')
  if (!g.ok) return { bancos: [], pastas: [] }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_pastas')
    .select('id, nome, is_folder')
    .eq('tenant_id', g.tenantId).eq('folder_area', 'banco').eq('deletado', false)
    .order('nome', { ascending: true }).limit(500)
  const itens = (data ?? []) as { id: string; nome: string | null; is_folder?: boolean | null }[]
  const mapa = (x: { id: string; nome: string | null }) => ({ id: x.id, nome: x.nome ?? '—' })
  return {
    bancos: itens.filter((x) => !x.is_folder && x.id !== excluirBancoId).map(mapa),
    pastas: itens.filter((x) => !!x.is_folder).map(mapa),
  }
}

const COLS_NAO_COPIAR = ['id', 'created_at', 'updated_at', 'criado_em', 'atualizado_em', 'deletado', 'deletado_em', 'deletado_por', 'external_id', 'criado_por', 'atualizado_por']

/** Duplica questões (cópia da questão + alternativas + competências) dentro do MESMO banco. */
export async function duplicarQuestoesNoBanco(bancoId: string, questaoIds: string[]): Promise<{ ok: boolean; count?: number; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  if (!(await checkPermission('questoes:create'))) return { ok: false, error: 'Sem permissão para criar questões.' }
  const ids = [...new Set((questaoIds ?? []).filter(Boolean))].slice(0, 200)
  if (!bancoId || !ids.length) return { ok: false, error: 'Selecione ao menos uma questão.' }
  const svc = createAdminClient()
  const { data: banco } = await svc.from('simulado_pastas').select('id').eq('id', bancoId).eq('tenant_id', g.tenantId).maybeSingle()
  if (!banco) return { ok: false, error: 'Banco não encontrado.' }

  let feitas = 0
  for (const qid of ids) {
    const { data: orig } = await svc.from('simulado_questoes').select('*').eq('id', qid).eq('tenant_id', g.tenantId).maybeSingle()
    if (!orig) continue
    const campos: Record<string, any> = { ...(orig as any) }
    for (const c of COLS_NAO_COPIAR) delete campos[c]
    campos.tenant_id = g.tenantId
    let nova: any = null
    let erro: any = null
    for (let i = 0; i < 10; i++) {
      ;({ data: nova, error: erro } = await svc.from('simulado_questoes').insert(campos).select('id').single())
      if (!erro) break
      // Coluna gerada/inexistente → remove só ela e tenta de novo.
      const col = /column "?([a-z0-9_]+)"?/i.exec(erro.message)?.[1] ?? /'([a-z0-9_]+)' column/i.exec(erro.message)?.[1]
      if (!col || !(col in campos) || col === 'tenant_id') break
      delete campos[col]
    }
    if (erro || !nova) return { ok: false, count: feitas, error: erro?.message ?? 'Erro ao duplicar.' }

    const { data: alts } = await svc.from('simulado_alternativas').select('*').eq('questao_id', qid).eq('tenant_id', g.tenantId)
    if (alts?.length) {
      await svc.from('simulado_alternativas').insert((alts as any[]).map((a) => {
        const { id: _i, created_at: _c, ...r } = a
        return { ...r, questao_id: nova.id, tenant_id: g.tenantId }
      }))
    }
    const { data: comps } = await svc.from('simulado_competencias').select('*').eq('questao_id', qid).eq('tenant_id', g.tenantId)
    if (comps?.length) {
      await svc.from('simulado_competencias').insert((comps as any[]).map((a) => {
        const { id: _i, created_at: _c, ...r } = a
        return { ...r, questao_id: nova.id, tenant_id: g.tenantId }
      }))
    }
    await svc.from('simulado_questao_pasta').insert({ tenant_id: g.tenantId, pasta_id: bancoId, questao_id: nova.id })
    await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_questoes', entidadeId: nova.id, depois: { copia_de: qid, banco: bancoId } })
    feitas++
  }
  revalidatePath('/admin/conteudos/materiais/questoes')
  revalidatePath(`/admin/conteudos/materiais/questoes/${bancoId}`)
  return { ok: true, count: feitas }
}

/** Move questões de um banco para outro (vincula no destino e desvincula da origem; a questão é a mesma). */
export async function moverQuestoesEntreBancos(origemId: string, destinoId: string, questaoIds: string[]): Promise<{ ok: boolean; count?: number; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  const ids = [...new Set((questaoIds ?? []).filter(Boolean))]
  if (!origemId || !destinoId || origemId === destinoId || !ids.length) return { ok: false, error: 'Escolha um banco de destino diferente.' }
  const svc = createAdminClient()
  const { data: bs } = await svc.from('simulado_pastas').select('id').eq('tenant_id', g.tenantId).in('id', [origemId, destinoId])
  if ((bs ?? []).length < 2) return { ok: false, error: 'Banco não encontrado.' }
  for (let i = 0; i < ids.length; i += 80) {
    const fatia = ids.slice(i, i + 80)
    const { data: ja } = await svc.from('simulado_questao_pasta').select('questao_id').eq('tenant_id', g.tenantId).eq('pasta_id', destinoId).in('questao_id', fatia)
    const tem = new Set((ja ?? []).map((r: any) => r.questao_id))
    const novas = fatia.filter((q) => !tem.has(q))
    if (novas.length) {
      const { error } = await svc.from('simulado_questao_pasta').insert(novas.map((questao_id) => ({ tenant_id: g.tenantId, pasta_id: destinoId, questao_id })))
      if (error) return { ok: false, error: error.message }
    }
    const { error: e2 } = await svc.from('simulado_questao_pasta').delete().eq('tenant_id', g.tenantId).eq('pasta_id', origemId).in('questao_id', fatia)
    if (e2) return { ok: false, error: e2.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: destinoId, depois: { questoes_movidas: ids.length, de: origemId } })
  revalidatePath('/admin/conteudos/materiais/questoes')
  revalidatePath(`/admin/conteudos/materiais/questoes/${origemId}`)
  revalidatePath(`/admin/conteudos/materiais/questoes/${destinoId}`)
  return { ok: true, count: ids.length }
}
