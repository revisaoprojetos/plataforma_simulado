'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { slugDiag } from '@/lib/caderno-teste/diagnostico'
import { materialDoConfig, materialEnunciadoDoConfig, type MaterialCaderno } from '@/lib/caderno-designer/material'
import { metaDaModalidade, novoItem } from '@/lib/caderno-teste/tipos'
import type { BuilderV3, Modalidade, PreviewQuestao } from '@/lib/caderno-teste/tipos'
import { carregarQuestoesBancoCore, carregarDadosBancoCore } from '@/lib/caderno-teste/dados-banco'

// Tipos declarados aqui (não re-exportados de uma lib) — em arquivo 'use server' o Next trata todo
// export como server action; re-export de `type` quebra o build. São estruturalmente = aos da lib.
export type RegistroTeste = { id: string; nome: string; vars: Record<string, string>; respostas: Record<string, string> }
export type DiscBancoTeste = { nome: string; chave: string; pilar?: string }
export type QuestaoMeta = { numero: number; disciplinaChave: string; disciplinaNome: string; assunto: string }

/** Metadados leves (sem alternativas) de todas as questões do banco, na ordem do caderno: número +
 * disciplina + assunto. Usado no editor do card de disciplina p/ listar as questões daquela disciplina. */
export async function questoesMetaBanco(bancoId: string): Promise<{ ok: boolean; questoes: QuestaoMeta[] }> {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(await checkPermission('questoes:view')) || !bancoId) return { ok: true, questoes: [] }
  const svc = createAdminClient()
  const vinc = await fetchAll<{ questao_id: string }>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', access.tenantId!).order('questao_id', { ascending: true }))
  let ordemBanco: string[] = []
  try { const { data: pasta } = await svc.from('simulado_pastas').select('ordem_questoes').eq('id', bancoId).eq('tenant_id', access.tenantId!).maybeSingle(); if (Array.isArray((pasta as any)?.ordem_questoes)) ordemBanco = (pasta as any).ordem_questoes } catch { /* coluna pode não existir */ }
  const posBanco = new Map(ordemBanco.map((id, i) => [id, i]))
  const ids = vinc.map((v) => v.questao_id).sort((a, b) => (posBanco.get(a) ?? 1e9) - (posBanco.get(b) ?? 1e9))
  if (!ids.length) return { ok: true, questoes: [] }
  const qs = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_questoes').select('id, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome)').in('id', chunk).eq('tenant_id', access.tenantId!))
  const meta = new Map<string, { nome: string; assunto: string }>()
  for (const q of qs) meta.set((q as any).id, { nome: (((q as any).disciplinas?.nome ?? '') as string).trim(), assunto: (((q as any).assuntos?.nome ?? '') as string).trim() })
  const questoes: QuestaoMeta[] = ids.map((id, i) => { const m = meta.get(id); const nome = m?.nome ?? ''; return { numero: i + 1, disciplinaChave: nome ? slugDiag(nome) : '', disciplinaNome: nome, assunto: m?.assunto ?? '' } })
  return { ok: true, questoes }
}

const TABELA = 'simulado_cadernos_teste'

/** Salva o builder do caderno de TESTE (config.builderV3 + bancoId). Sincroniza o nome com o título. */
export async function salvarBuilderTeste(id: string, builder: BuilderV3): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { data: atual } = await svc.from(TABELA).select('config').eq('id', id).eq('tenant_id', access.tenantId).maybeSingle()
  if (!atual) return { ok: false, error: 'Caderno não encontrado.' }
  const config = { ...(((atual as any).config ?? {}) as Record<string, unknown>), builderV3: builder, bancoId: builder.bancoId }
  // Nome do caderno = título do grupo ativo (ou o 1º).
  const at = builder.itens.find((i) => i.id === builder.ativo) ?? builder.itens[0]
  const nome = (at?.ajustes.titulo || '').trim()
  const patch: Record<string, unknown> = { config, atualizado_em: new Date().toISOString() }
  if (nome) patch.nome = nome
  const { error } = await svc.from(TABELA).update(patch).eq('id', id).eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: TABELA, entidadeId: id, depois: { grupos: builder.itens.length } })
  revalidatePath('/admin/cadernos-teste')
  return { ok: true }
}

/** Questões de um banco (para a prévia). Limitado — é só preview. */
export async function previewQuestoesBanco(bancoId: string): Promise<{ ok: boolean; questoes?: PreviewQuestao[] }> {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(await checkPermission('questoes:view'))) return { ok: false }
  const questoes = await carregarQuestoesBancoCore(createAdminClient(), access.tenantId, bancoId)
  return { ok: true, questoes }
}

/**
 * Dados adaptativos do banco para o Diagnóstico: ALUNOS reais (com as variáveis de desempenho —
 * nota, %, por pilar, por disciplina, assuntos das erradas) + as DISCIPLINAS do banco (nome+chave).
 * Reusa `carregarRegistros` (mesmo motor da mala direta do editor real).
 */
export async function dadosBancoTeste(bancoId: string, filtro?: { aluno?: string; sessao?: string }): Promise<{ ok: boolean; registros: RegistroTeste[]; disciplinas: DiscBancoTeste[] }> {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(await checkPermission('questoes:view')) || !bancoId) return { ok: true, registros: [], disciplinas: [] }
  const { registros, disciplinas } = await carregarDadosBancoCore(createAdminClient(), access.tenantId, bancoId, filtro)
  return { ok: true, registros, disciplinas }
}

export type CadernoTesteGrupo = { id: string; modalidade: string; label: string }
export type CadernoTesteResumo = { id: string; nome: string; atualizadoEm: string | null; itens: CadernoTesteGrupo[]; material: MaterialCaderno; materialEnunciado: MaterialCaderno }

/** Lista os cadernos de TESTE vinculados a um banco (config.builderV3.bancoId === bancoId), com o material PDF. */
export async function listarCadernosTesteDoBanco(bancoId: string): Promise<CadernoTesteResumo[]> {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(await checkPermission('questoes:view')) || !bancoId) return []
  const svc = createAdminClient()
  const r = await svc.from(TABELA).select('id, nome, config, atualizado_em').eq('tenant_id', access.tenantId).eq('deletado', false).order('atualizado_em', { ascending: false })
  const rows = (r.data ?? []) as any[]
  return rows
    .filter((c) => { const cfg = (c.config ?? {}) as any; return (cfg?.builderV3?.bancoId ?? cfg?.bancoId ?? null) === bancoId })
    .map((c) => {
      const cfg = (c.config ?? {}) as any
      const raw = Array.isArray(cfg?.builderV3?.itens) ? cfg.builderV3.itens : []
      const itens: CadernoTesteGrupo[] = raw.map((it: any) => {
        const meta = metaDaModalidade(it?.modalidade)
        const modeloNome = meta.modelos.find((m) => m.id === it?.modelo)?.nome
        // Rótulo do grupo = MODALIDADE (+ modelo) — identifica cada tipo. O nome do caderno fica no cabeçalho.
        return { id: String(it?.id ?? ''), modalidade: String(it?.modalidade ?? ''), label: `${meta.nome}${modeloNome ? ` · ${modeloNome}` : ''}` }
      }).filter((g: CadernoTesteGrupo) => g.id)
      return { id: c.id, nome: c.nome ?? 'Caderno de teste', atualizadoEm: c.atualizado_em ?? null, itens, material: materialDoConfig(cfg), materialEnunciado: materialEnunciadoDoConfig(cfg) }
    })
}

/** Cria um caderno de TESTE já vinculado ao banco e retorna o id (para abrir o editor). */
export async function apagarCadernoTeste(id: string, bancoId?: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update')) && !(await checkPermission('questoes:delete'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId || !id) return { ok: false, error: 'Tenant/caderno não resolvido.' }
  const svc = createAdminClient()
  const { data: antes } = await svc.from(TABELA).select('nome, config').eq('id', id).eq('tenant_id', access.tenantId).maybeSingle()
  const del = await svc.from(TABELA).delete().eq('id', id).eq('tenant_id', access.tenantId)
  if (del.error) return { ok: false, error: del.error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: TABELA, entidadeId: id, antes: (antes as any) ?? undefined })
  if (bancoId) revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}

export async function criarCadernoTesteNoBanco(bancoId: string, nome?: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!(await checkPermission('questoes:create')) && !(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId || !bancoId) return { ok: false, error: 'Tenant/banco não resolvido.' }
  const svc = createAdminClient()
  const { data: pasta } = await svc.from('simulado_pastas').select('nome').eq('id', bancoId).eq('tenant_id', access.tenantId).maybeSingle()
  const titulo = (nome && nome.trim()) || `Caderno de teste — ${(pasta as any)?.nome ?? 'Simulado'}`
  const ins = await svc.from(TABELA).insert({ tenant_id: access.tenantId, nome: titulo, config: { bancoId } }).select('id').single()
  if (ins.error || !ins.data) return { ok: false, error: ins.error?.message ?? 'Erro ao criar' }
  await registrarAudit({ operacao: 'INSERT', entidade: TABELA, entidadeId: (ins.data as any).id, depois: { nome: titulo, bancoId } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true, id: (ins.data as any).id }
}

// Modalidade + rótulo de cada SLOT da entrega (para criar o caderno certo direto do card).
const SLOT_MODALIDADE: Record<'diagnostico' | 'folha' | 'enunciado' | 'gabarito', Modalidade> = {
  diagnostico: 'diagnostico', folha: 'folha_respostas', enunciado: 'caderno_questoes', gabarito: 'caderno_questoes',
}
const SLOT_ROTULO: Record<'diagnostico' | 'folha' | 'enunciado' | 'gabarito', string> = {
  diagnostico: 'Diagnóstico', folha: 'Folha de Resposta', enunciado: 'Caderno de Enunciado', gabarito: 'Gabarito Comentado',
}

/** Cria um caderno da modalidade do SLOT já ASSOCIADO à entrega do banco (caderno_entrega[slot]) e
 *  devolve o id p/ abrir o editor. Fluxo do card da Entrega: clicar vazio → cria + edita, sem selecionar. */
export async function criarCadernoParaSlot(bancoId: string, slot: 'diagnostico' | 'folha' | 'enunciado' | 'gabarito'): Promise<{ ok: boolean; cadernoId?: string; itemId?: string; error?: string }> {
  if (!(await checkPermission('questoes:create')) && !(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId || !bancoId) return { ok: false, error: 'Tenant/banco não resolvido.' }
  const svc = createAdminClient()
  const modalidade = SLOT_MODALIDADE[slot]
  const rotulo = SLOT_ROTULO[slot]
  const modeloId = metaDaModalidade(modalidade).modelos[0]?.id ?? ''
  const item = novoItem(modalidade, modeloId)
  item.ajustes.titulo = rotulo
  const builder: BuilderV3 = { v: 3, bancoId, itens: [item], ativo: item.id }
  const { data: pasta } = await svc.from('simulado_pastas').select('nome, caderno_entrega').eq('id', bancoId).eq('tenant_id', access.tenantId).maybeSingle()
  const titulo = `${rotulo} — ${(pasta as any)?.nome ?? 'Simulado'}`
  const ins = await svc.from(TABELA).insert({ tenant_id: access.tenantId, nome: titulo, config: { bancoId, builderV3: builder } }).select('id').single()
  if (ins.error || !ins.data) return { ok: false, error: ins.error?.message ?? 'Erro ao criar' }
  const cadernoId = (ins.data as any).id as string
  const entrega = { ...(((pasta as any)?.caderno_entrega ?? {}) as Record<string, unknown>), [slot]: { cadernoId, itemId: item.id } }
  const up = await svc.from('simulado_pastas').update({ caderno_entrega: entrega }).eq('id', bancoId).eq('tenant_id', access.tenantId)
  if (up.error) return { ok: false, error: /column .*caderno_entrega/i.test(up.error.message) ? 'Rode o SQL scripts/sql/banco-caderno-entrega.sql (coluna caderno_entrega ausente).' : up.error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: TABELA, entidadeId: cadernoId, depois: { nome: titulo, bancoId, slot } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true, cadernoId, itemId: item.id }
}

// ===== Montagem / entrega do Caderno (teste) por banco (slots) =====
export type MontagemGrupo = { cadernoId: string; cadernoNome: string; itemId: string; modalidade: string; modelo: string; label: string }
export type EntregaRef = { cadernoId?: string; itemId?: string; pdfUrl?: string; pdfNome?: string } | null
export type EntregaSlots = { diagnostico?: EntregaRef; folha?: EntregaRef; enunciado?: EntregaRef; gabarito?: EntregaRef }

export type MontagemPdf = { url: string; nome: string; origem: string }

/** Carrega a montagem salva do banco + grupos + PDFs já enviados nos cadernos do banco. */
export async function carregarMontagem(bancoId: string): Promise<{ entrega: EntregaSlots; grupos: MontagemGrupo[]; pdfs: MontagemPdf[]; discursivo: boolean }> {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(await checkPermission('questoes:view')) || !bancoId) return { entrega: {}, grupos: [], pdfs: [], discursivo: false }
  const svc = createAdminClient()
  const r = await svc.from(TABELA).select('id, nome, config').eq('tenant_id', access.tenantId).eq('deletado', false)
  const grupos: MontagemGrupo[] = []
  const pdfs: MontagemPdf[] = []
  const vistoUrl = new Set<string>()
  for (const c of ((r.data ?? []) as any[])) {
    const cfg = (c.config ?? {}) as any
    if ((cfg?.builderV3?.bancoId ?? cfg?.bancoId ?? null) !== bancoId) continue
    for (const it of (Array.isArray(cfg?.builderV3?.itens) ? cfg.builderV3.itens : [])) {
      const meta = metaDaModalidade(it?.modalidade)
      const modeloNome = meta.modelos.find((m) => m.id === it?.modelo)?.nome
      if (!it?.id) continue
      grupos.push({ cadernoId: c.id, cadernoNome: c.nome ?? 'Caderno', itemId: String(it.id), modalidade: String(it.modalidade ?? ''), modelo: String(it.modelo ?? ''), label: `${meta.nome}${modeloNome ? ` · ${modeloNome}` : ''}` })
    }
    // PDFs já enviados neste caderno (Gabarito e Enunciado)
    const mg = materialDoConfig(cfg); if (mg.pdfUrl && !vistoUrl.has(mg.pdfUrl)) { vistoUrl.add(mg.pdfUrl); pdfs.push({ url: mg.pdfUrl, nome: mg.pdfNome || 'Gabarito', origem: `${c.nome ?? 'Caderno'} · Gabarito` }) }
    const me = materialEnunciadoDoConfig(cfg); if (me.pdfUrl && !vistoUrl.has(me.pdfUrl)) { vistoUrl.add(me.pdfUrl); pdfs.push({ url: me.pdfUrl, nome: me.pdfNome || 'Enunciado', origem: `${c.nome ?? 'Caderno'} · Enunciado` }) }
  }
  let entrega: EntregaSlots = {}
  let discursivo = false
  try {
    const p = await svc.from('simulado_pastas').select('caderno_entrega, tipo').eq('id', bancoId).eq('tenant_id', access.tenantId).maybeSingle()
    entrega = ((p.data as any)?.caderno_entrega ?? {}) as EntregaSlots
    discursivo = (p.data as any)?.tipo === 'discursiva'
  } catch { /* coluna pode não existir ainda */ }
  // Fallback robusto: o banco tem QUESTÃO discursiva? (o `tipo` do banco pode não estar setado).
  if (!discursivo) {
    try {
      const qp = await fetchAll<any>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).order('questao_id'))
      const qids = [...new Set(qp.map((r) => r.questao_id).filter(Boolean))] as string[]
      if (qids.length) {
        const disc = await fetchAllByIn<any>(qids, (c) => svc.from('simulado_questoes').select('id').in('id', c).eq('tipo', 'discursiva').eq('tenant_id', access.tenantId))
        discursivo = disc.length > 0
      }
    } catch { /* ignora */ }
  }
  return { entrega: entrega ?? {}, grupos, pdfs, discursivo }
}

/** Salva a montagem (slots) do banco em simulado_pastas.caderno_entrega. */
export async function salvarMontagem(bancoId: string, entrega: EntregaSlots): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId || !bancoId) return { ok: false, error: 'Tenant/banco não resolvido.' }
  const svc = createAdminClient()
  const up = await svc.from('simulado_pastas').update({ caderno_entrega: entrega }).eq('id', bancoId).eq('tenant_id', access.tenantId)
  if (up.error) return { ok: false, error: /column .*caderno_entrega/i.test(up.error.message) ? 'Rode o SQL scripts/sql/banco-caderno-entrega.sql (coluna caderno_entrega ausente).' : up.error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: bancoId, depois: { caderno_entrega: entrega } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}
