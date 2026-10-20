import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'

// Camada de dados da Área de Teste (prévia + variáveis). Reutilizada pela server action (laboratório),
// pelas rotas de API (plugin do OnlyOffice) e pelo cálculo da prévia.

export type QuestaoSim = { disciplina: string; assunto: string; pilar: string; ordem: number }
export type DisciplinaOpt = { nome: string; total: number; assuntos: string }
export type PickerPasta = { id: string; nome: string; cor: string | null; icone: string | null; capa: string | null; orig: string | null; cfg: any | null; paiId: string | null; count: number }
export type PickerSim = { id: string; titulo: string; status: string; pastaId: string | null; cor: string | null; icone: string | null; capa: string | null; orig: string | null; cfg: any | null }

/** Slug de variável — MESMA normalização do relatório real (lib/caderno-designer/merge.ts). */
export function slugVar(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/** Normaliza categoria/pilar em UM pilar canônico (igual merge.ts). Língua Portuguesa é card à parte. */
export function pilarDe(categoria: any, pilar1: any, pilar2: any, disciplina: string): string {
  const catTxt = [categoria, pilar1, pilar2].map((x) => (x ?? '').toString()).join(' ').toLowerCase()
  const d = (disciplina || '').toLowerCase()
  if (/portugu|l[ií]ngua/.test(catTxt) || /portugu|l[ií]ngua/.test(d)) return 'Língua Portuguesa'
  if (catTxt.includes('lei seca') || catTxt.includes('legisla')) return 'Lei seca'
  if (catTxt.includes('jurisprud')) return 'Jurisprudência'
  if (catTxt.includes('doutrina')) return 'Doutrina'
  return ''
}

/** Questões do simulado NA ORDEM (disciplina/assunto/pilar) + disciplinas com contagem. */
export async function carregarQuestoesSimulado(simuladoId: string): Promise<{ disciplinas: DisciplinaOpt[]; questoes: QuestaoSim[]; erro?: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !simuladoId) return { disciplinas: [], questoes: [], erro: 'tenant/simulado não resolvido' }
  const svc = createAdminClient()
  try {
    const pq = await fetchAllByIn<any>([simuladoId], (chunk) =>
      svc.from('simulado_prova_questoes')
        .select('questao_id, ordem, anulada, questoes:simulado_questoes(categoria, pilar_1, pilar_2, assunto_detalhe, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome))')
        .in('simulado_id', chunk).order('ordem', { ascending: true }))
    const questoes: QuestaoSim[] = []
    const totPorDisc = new Map<string, number>()
    for (const r of (pq ?? []) as any[]) {
      if (r.anulada) continue
      const q = Array.isArray(r.questoes) ? r.questoes[0] : r.questoes
      const disciplina = q?.disciplinas?.nome || 'Sem disciplina'
      const assunto = ((q?.assuntos?.nome ?? q?.assunto_detalhe ?? '') as string).toString().trim()
      const pilar = pilarDe(q?.categoria, q?.pilar_1, q?.pilar_2, disciplina)
      questoes.push({ disciplina, assunto, pilar, ordem: Number(r.ordem ?? questoes.length) })
      totPorDisc.set(disciplina, (totPorDisc.get(disciplina) ?? 0) + 1)
    }
    const disciplinas = [...totPorDisc.entries()].map(([nome, total]) => ({ nome, total, assuntos: '' })).sort((a, b) => b.total - a.total)
    return { disciplinas, questoes }
  } catch (e) {
    return { disciplinas: [], questoes: [], erro: `Falha ao ler disciplinas: ${(e as any)?.message || String(e)}` }
  }
}

/** Árvore de pastas (folder_area='simulado') + simulados com capa/visual resolvidos (pro picker). */
export async function carregarPicker(): Promise<{ pastas: PickerPasta[]; simulados: PickerSim[] }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { pastas: [], simulados: [] }
  const svc = createAdminClient()
  const pastasRaw = ((await fetchAll<any>(() => svc.from('simulado_pastas')
    .select('id, nome, cor, icone, capa_url, capa_card_url, capa_meta, is_folder, folder_area, pai_id, deletado, tenant_id')
    .eq('tenant_id', tenantId).order('nome', { ascending: true }))) ?? [])
    .filter((p: any) => !p.deletado && p.is_folder && p.folder_area === 'simulado')
  const simsRaw = (await fetchAll<any>(() => svc.from('simulado_simulados')
    .select('id, titulo, status, pasta_id, regras, created_at')
    .eq('tenant_id', tenantId).eq('deletado', false).is('owner_estudante_id', null)
    .order('created_at', { ascending: false }).order('id', { ascending: true }))) ?? []
  const vis = await resolverVisualSimulados(svc, simsRaw.map((s) => ({ id: s.id, regras: s.regras })))

  const simulados: PickerSim[] = simsRaw.map((s) => {
    const v = vis.get(s.id)
    return {
      id: String(s.id), titulo: s.titulo || '(sem título)', status: s.status || 'rascunho', pastaId: s.pasta_id ?? null,
      cor: v?.cor ?? null, icone: v?.icone ?? null, capa: v?.capaBanner ?? v?.capa ?? null, orig: v?.capaMeta?.orig ?? null, cfg: v?.capaMeta?.ticket ?? null,
    }
  })
  const filhos = new Map<string, string[]>()
  for (const p of pastasRaw) { const k = p.pai_id ?? '__root__'; (filhos.get(k) ?? filhos.set(k, []).get(k)!).push(p.id) }
  const diretos = new Map<string, number>()
  for (const s of simulados) if (s.pastaId) diretos.set(s.pastaId, (diretos.get(s.pastaId) ?? 0) + 1)
  const contar = (pid: string): number => { let n = diretos.get(pid) ?? 0; for (const f of (filhos.get(pid) ?? [])) n += contar(f); return n }
  const pastas: PickerPasta[] = pastasRaw.map((p) => {
    const meta = p.capa_meta || null
    return { id: String(p.id), nome: p.nome || '(sem nome)', cor: p.cor ?? null, icone: p.icone ?? null, capa: p.capa_card_url ?? p.capa_url ?? null, orig: meta?.orig ?? null, cfg: meta?.ticket ?? meta?.poster ?? null, paiId: p.pai_id ?? null, count: contar(String(p.id)) }
  })
  return { pastas, simulados }
}
