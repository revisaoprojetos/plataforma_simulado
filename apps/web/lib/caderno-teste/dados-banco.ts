// Carregadores "aluno-safe" do banco para o caderno de teste (V2): recebem `svc` (createAdminClient) +
// `tenantId` JÁ AUTORIZADOS pelo chamador (admin server action OU rota /imprimir com sessão/token). Sem
// `getCurrentAccess` aqui — assim servem tanto ao admin quanto à entrega do aluno (rota por token/sessão).

import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { carregarRegistros } from '@/lib/caderno-designer/merge'
import { slugDiag } from '@/lib/caderno-teste/diagnostico'
import type { PreviewQuestao } from '@/lib/caderno-teste/tipos'

export type RegistroTeste = { id: string; nome: string; vars: Record<string, string>; respostas: Record<string, string> }
export type DiscBancoTeste = { nome: string; chave: string; pilar?: string }

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']

function pilarSlugDe(cats: unknown[], disc: string): string {
  const t = [...cats, disc].map((x) => (x ?? '').toString()).join(' ').toLowerCase()
  if (/portugu|l[ií]ngua/.test(t)) return 'lingua_portuguesa'
  if (t.includes('lei seca') || t.includes('legisla')) return 'lei_seca'
  if (t.includes('jurisprud')) return 'jurisprudencia'
  if (t.includes('doutrina')) return 'doutrina'
  return ''
}

/** Questões do banco (com alternativas) na ordem DESIGNADA (simulado_pastas.ordem_questoes; fallback: id). */
export async function carregarQuestoesBancoCore(svc: any, tenantId: string, bancoId: string, limite = 80): Promise<PreviewQuestao[]> {
  if (!bancoId) return []
  const vinc = await fetchAll<{ questao_id: string }>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', tenantId).order('questao_id', { ascending: true }))
  let ordemBanco: string[] = []
  try { const { data: pasta } = await svc.from('simulado_pastas').select('ordem_questoes').eq('id', bancoId).eq('tenant_id', tenantId).maybeSingle(); if (Array.isArray((pasta as any)?.ordem_questoes)) ordemBanco = (pasta as any).ordem_questoes } catch { /* coluna pode não existir */ }
  const posBanco = new Map(ordemBanco.map((id, i) => [id, i]))
  const ids = vinc.map((v) => v.questao_id)
    .sort((a, b) => (posBanco.get(a) ?? 1e9) - (posBanco.get(b) ?? 1e9))
    .slice(0, limite)
  if (!ids.length) return []
  const { data: qs } = await svc.from('simulado_questoes').select('id, enunciado, tipo').in('id', ids).eq('tenant_id', tenantId)
  const { data: alts } = await svc.from('simulado_alternativas').select('questao_id, texto, ordem, correta, comentario').in('questao_id', ids).eq('tenant_id', tenantId)
  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) { const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr) }
  const ordem = new Map(ids.map((id, i) => [id, i]))
  return (qs ?? [])
    .sort((x: any, y: any) => (ordem.get(x.id) ?? 0) - (ordem.get(y.id) ?? 0))
    .map((q: any, i: number) => ({
      id: q.id, numero: i + 1, enunciado: q.enunciado ?? '', tipo: q.tipo,
      alternativas: (altMap.get(q.id) ?? []).sort((m, n) => m.ordem - n.ordem).map((al, j) => ({ letra: LETRAS[j] ?? '?', texto: al.texto ?? '', correta: !!al.correta, comentario: al.comentario ?? '' })),
    }))
}

/** Alunos reais (vars de desempenho + respostas marcadas) + disciplinas do banco (nome+chave+pilar).
 *  `filtro.aluno/sessao` escopa AQUELE aluno (acha mesmo fora dos 30 primeiros). */
export async function carregarDadosBancoCore(svc: any, tenantId: string, bancoId: string, filtro?: { aluno?: string; sessao?: string }): Promise<{ registros: RegistroTeste[]; disciplinas: DiscBancoTeste[] }> {
  if (!bancoId) return { registros: [], disciplinas: [] }
  const { data: pasta } = await svc.from('simulado_pastas').select('nome, grupos').eq('id', bancoId).eq('tenant_id', tenantId).maybeSingle()
  const bancoNome = ((pasta as any)?.nome ?? 'Simulado') as string
  let registros: RegistroTeste[] = []
  try {
    const escopado = !!(filtro?.aluno || filtro?.sessao)
    const regs = await carregarRegistros(svc, tenantId, bancoId, bancoNome, filtro?.sessao, filtro?.aluno, escopado ? undefined : 30)
    registros = regs.map((r) => ({ id: r.id, nome: r.nome, vars: r.vars, respostas: r.respostas }))
  } catch { /* base sem sessões/respostas — segue sem alunos */ }

  let disciplinas: DiscBancoTeste[] = []
  try {
    const vinc = await fetchAll<{ questao_id: string }>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', tenantId).order('questao_id', { ascending: true }))
    const ids = vinc.map((v) => v.questao_id)
    const nomes = new Set<string>()
    const pilarPorDisc = new Map<string, Map<string, number>>()
    if (ids.length) {
      const qs = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_questoes').select('categoria, pilar_1, pilar_2, disciplinas:simulado_disciplinas(nome)').in('id', chunk).eq('tenant_id', tenantId))
      for (const q of qs) {
        const n = ((q as any).disciplinas?.nome as string | undefined)?.trim(); if (!n) continue
        nomes.add(n)
        const pilar = pilarSlugDe([(q as any).categoria, (q as any).pilar_1, (q as any).pilar_2], n)
        if (pilar) { const m = pilarPorDisc.get(n) ?? new Map(); m.set(pilar, (m.get(pilar) ?? 0) + 1); pilarPorDisc.set(n, m) }
      }
    }
    disciplinas = [...nomes].sort((a, b) => a.localeCompare(b)).map((nome) => {
      const m = pilarPorDisc.get(nome)
      const pilar = m ? [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] : undefined
      return { nome, chave: slugDiag(nome), pilar }
    })
  } catch { /* fallback abaixo */ }
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
  return { registros, disciplinas }
}
