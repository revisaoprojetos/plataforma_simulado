'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { carregarRegistros } from '@/lib/caderno-designer/merge'
import { slugDiag } from '@/lib/caderno-teste/diagnostico'
import { materialDoConfig, materialEnunciadoDoConfig, type MaterialCaderno } from '@/lib/caderno-designer/material'
import { metaDaModalidade } from '@/lib/caderno-teste/tipos'
import type { BuilderV3, PreviewQuestao } from '@/lib/caderno-teste/tipos'

export type RegistroTeste = { id: string; nome: string; vars: Record<string, string> }
export type DiscBancoTeste = { nome: string; chave: string; pilar?: string }
export type QuestaoMeta = { numero: number; disciplinaChave: string; disciplinaNome: string; assunto: string }

/** Metadados leves (sem alternativas) de todas as questões do banco, na ordem do caderno: número +
 * disciplina + assunto. Usado no editor do card de disciplina p/ listar as questões daquela disciplina. */
export async function questoesMetaBanco(bancoId: string): Promise<{ ok: boolean; questoes: QuestaoMeta[] }> {
  const access = await getCurrentAccess()
  if (!access.tenantId || !bancoId) return { ok: true, questoes: [] }
  const svc = createAdminClient()
  const vinc = await fetchAll<{ questao_id: string }>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', access.tenantId!).order('questao_id', { ascending: true }))
  const ids = vinc.map((v) => v.questao_id)
  if (!ids.length) return { ok: true, questoes: [] }
  const qs = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_questoes').select('id, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome)').in('id', chunk).eq('tenant_id', access.tenantId!))
  const meta = new Map<string, { nome: string; assunto: string }>()
  for (const q of qs) meta.set((q as any).id, { nome: (((q as any).disciplinas?.nome ?? '') as string).trim(), assunto: (((q as any).assuntos?.nome ?? '') as string).trim() })
  const questoes: QuestaoMeta[] = ids.map((id, i) => { const m = meta.get(id); const nome = m?.nome ?? ''; return { numero: i + 1, disciplinaChave: nome ? slugDiag(nome) : '', disciplinaNome: nome, assunto: m?.assunto ?? '' } })
  return { ok: true, questoes }
}

/** Pilar canônico (slug) a partir da categoria/pilares da questão + nome da disciplina (igual merge.ts). */
function pilarSlugDe(cats: unknown[], disc: string): string {
  const t = [...cats, disc].map((x) => (x ?? '').toString()).join(' ').toLowerCase()
  if (/portugu|l[ií]ngua/.test(t)) return 'lingua_portuguesa'
  if (t.includes('lei seca') || t.includes('legisla')) return 'lei_seca'
  if (t.includes('jurisprud')) return 'jurisprudencia'
  if (t.includes('doutrina')) return 'doutrina'
  return ''
}

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']
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
  if (!access.tenantId) return { ok: false }
  if (!bancoId) return { ok: true, questoes: [] }
  const svc = createAdminClient()
  const vinc = await fetchAll<{ questao_id: string }>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', access.tenantId!).order('questao_id', { ascending: true }))
  const ids = vinc.map((v) => v.questao_id).slice(0, 80) // teto para a prévia (não é a geração final)
  if (!ids.length) return { ok: true, questoes: [] }
  const { data: qs } = await svc.from('simulado_questoes').select('id, enunciado, tipo').in('id', ids).eq('tenant_id', access.tenantId)
  const { data: alts } = await svc.from('simulado_alternativas').select('questao_id, texto, ordem, correta, comentario').in('questao_id', ids).eq('tenant_id', access.tenantId)
  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) { const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr) }
  const ordem = new Map(ids.map((id, i) => [id, i]))
  const questoes: PreviewQuestao[] = (qs ?? [])
    .sort((x: any, y: any) => (ordem.get(x.id) ?? 0) - (ordem.get(y.id) ?? 0))
    .map((q: any, i: number) => ({
      id: q.id, numero: i + 1, enunciado: q.enunciado ?? '', tipo: q.tipo,
      alternativas: (altMap.get(q.id) ?? []).sort((m, n) => m.ordem - n.ordem).map((al, j) => ({ letra: LETRAS[j] ?? '?', texto: al.texto ?? '', correta: !!al.correta, comentario: al.comentario ?? '' })),
    }))
  return { ok: true, questoes }
}

/**
 * Dados adaptativos do banco para o Diagnóstico: ALUNOS reais (com as variáveis de desempenho —
 * nota, %, por pilar, por disciplina, assuntos das erradas) + as DISCIPLINAS do banco (nome+chave).
 * Reusa `carregarRegistros` (mesmo motor da mala direta do editor real).
 */
export async function dadosBancoTeste(bancoId: string): Promise<{ ok: boolean; registros: RegistroTeste[]; disciplinas: DiscBancoTeste[] }> {
  const access = await getCurrentAccess()
  if (!access.tenantId || !bancoId) return { ok: true, registros: [], disciplinas: [] }
  const svc = createAdminClient()
  const { data: pasta } = await svc.from('simulado_pastas').select('nome, grupos').eq('id', bancoId).eq('tenant_id', access.tenantId).maybeSingle()
  const bancoNome = ((pasta as any)?.nome ?? 'Simulado') as string
  let registros: RegistroTeste[] = []
  try {
    const regs = await carregarRegistros(svc, access.tenantId, bancoId, bancoNome, undefined, undefined, 30)
    registros = regs.map((r) => ({ id: r.id, nome: r.nome, vars: r.vars }))
  } catch { /* base sem sessões/respostas — segue sem alunos */ }

  // Disciplinas AUTORITATIVAS: nomes reais das disciplinas das questões DO BANCO selecionado —
  // slug igual ao das variáveis (merge.ts), então nome/quantidade/% adaptam a qualquer banco.
  let disciplinas: DiscBancoTeste[] = []
  try {
    const vinc = await fetchAll<{ questao_id: string }>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', access.tenantId!).order('questao_id', { ascending: true }))
    const ids = vinc.map((v) => v.questao_id)
    const nomes = new Set<string>()
    const pilarPorDisc = new Map<string, Map<string, number>>() // nome → (pilarSlug → contagem)
    if (ids.length) {
      const qs = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_questoes').select('categoria, pilar_1, pilar_2, disciplinas:simulado_disciplinas(nome)').in('id', chunk).eq('tenant_id', access.tenantId!))
      for (const q of qs) {
        const n = ((q as any).disciplinas?.nome as string | undefined)?.trim(); if (!n) continue
        nomes.add(n)
        const pilar = pilarSlugDe([(q as any).categoria, (q as any).pilar_1, (q as any).pilar_2], n)
        if (pilar) { const m = pilarPorDisc.get(n) ?? new Map(); m.set(pilar, (m.get(pilar) ?? 0) + 1); pilarPorDisc.set(n, m) }
      }
    }
    disciplinas = [...nomes].sort((a, b) => a.localeCompare(b)).map((nome) => {
      const m = pilarPorDisc.get(nome)
      const pilar = m ? [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] : undefined // pilar predominante
      return { nome, chave: slugDiag(nome), pilar }
    })
  } catch { /* fallback abaixo */ }
  // Fallback 1: grupos configurados no banco. Fallback 2: variáveis do 1º aluno (total_<slug>).
  if (!disciplinas.length) {
    const nomes = new Set<string>()
    for (const g of (Array.isArray((pasta as any)?.grupos) ? (pasta as any).grupos : [])) for (const d of (g?.disciplinas ?? [])) if (typeof d === 'string' && d.trim()) nomes.add(d.trim())
    disciplinas = [...nomes].map((nome) => ({ nome, chave: slugDiag(nome) }))
  }
  if (!disciplinas.length && registros[0]) {
    const v = registros[0].vars
    const human = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
    disciplinas = Object.keys(v).filter((k) => k.startsWith('total_') && !k.startsWith('total_pilar_') && k !== 'total_questoes').map((k) => { const c = k.slice('total_'.length); return { nome: human(c), chave: c } })
  }
  return { ok: true, registros, disciplinas }
}

export type CadernoTesteGrupo = { id: string; modalidade: string; label: string }
export type CadernoTesteResumo = { id: string; nome: string; atualizadoEm: string | null; itens: CadernoTesteGrupo[]; material: MaterialCaderno; materialEnunciado: MaterialCaderno }

/** Lista os cadernos de TESTE vinculados a um banco (config.builderV3.bancoId === bancoId), com o material PDF. */
export async function listarCadernosTesteDoBanco(bancoId: string): Promise<CadernoTesteResumo[]> {
  const access = await getCurrentAccess()
  if (!access.tenantId || !bancoId) return []
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
        return { id: String(it?.id ?? ''), modalidade: String(it?.modalidade ?? ''), label: it?.ajustes?.titulo || `${meta.nome}${modeloNome ? ` · ${modeloNome}` : ''}` }
      }).filter((g: CadernoTesteGrupo) => g.id)
      return { id: c.id, nome: c.nome ?? 'Caderno de teste', atualizadoEm: c.atualizado_em ?? null, itens, material: materialDoConfig(cfg), materialEnunciado: materialEnunciadoDoConfig(cfg) }
    })
}

/** Cria um caderno de TESTE já vinculado ao banco e retorna o id (para abrir o editor). */
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
