import { assinaturaDoCfg, parteAula, lerOrfao, type Grade } from './remap-as'
import { revisoesAntesDoEstudo } from './revisoes-coerentes'

/**
 * AUDITOR DE INTEGRIDADE de um plano do Cronograma Adaptativo (módulo PURO — sem banco; testado em __tests__/auditar-plano.test.ts).
 * Só LÊ e classifica: devolve anomalias tipadas. Nenhuma correção é aplicada aqui.
 */
export const TIPOS_ANOMALIA = [
  'feito_em_aula_diferente', 'revisao_antes_do_estudo', 'id_fora_do_catalogo', 'aula_sem_pdfull_na_grade',
  'materia_fora_da_selecao', 'plano_sem_assinatura', 'grade_vazia', 'meta_orfa',
] as const
export type TipoAnomalia = (typeof TIPOS_ANOMALIA)[number]

export const ROTULO_ANOMALIA: Record<TipoAnomalia, string> = {
  feito_em_aula_diferente: 'Progresso em aula diferente',
  revisao_antes_do_estudo: 'Revisão antes do estudo',
  id_fora_do_catalogo: 'Meta fora do catálogo',
  aula_sem_pdfull_na_grade: 'Aula sem PDFull na grade',
  materia_fora_da_selecao: 'Matéria fora da seleção',
  plano_sem_assinatura: 'Plano sem assinatura',
  grade_vazia: 'Grade vazia',
  meta_orfa: 'Meta órfã (material indisponível)',
}

export interface LinhaAuditoria { meta_id: string; estado?: string | null; aula_key?: string | null; concluido_em?: string | null; atualizado_em?: string | null }
export interface EntradaAuditoria {
  grade: Grade | null | undefined
  cfg: Record<string, unknown> | null | undefined
  linhas: readonly LinhaAuditoria[]
  /** AS atual: chave e disciplina de cada posição. */
  atual: { chaves: readonly string[]; discs: readonly string[] }
}
export interface Anomalia {
  tipo: TipoAnomalia
  metaId: string | null
  /** chave da aula que HOJE ocupa a posição do id no catálogo (null se não existe). */
  aulaAtual: string | null
  /** chave gravada na linha (aula_key) ou na assinatura do plano. */
  aulaGravada: string | null
  /** data relevante (conclusão/atualização da linha, ou data agendada na grade). */
  data: string | null
  detalhe: string
}

export const norm = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const ehHist = (pos: string): boolean => pos.startsWith(':hist')
const ehFeito = (l: LinhaAuditoria): boolean => l.estado === 'done'

export function auditarPlano(e: EntradaAuditoria): Anomalia[] {
  const out: Anomalia[] = []
  const cfg = (e.cfg ?? {}) as Record<string, unknown>
  const grade: Grade = (e.grade ?? {}) as Grade
  const ids = Object.keys(grade)
  const { chaves, discs } = e.atual
  const add = (a: Partial<Anomalia> & Pick<Anomalia, 'tipo' | 'detalhe'>) => out.push({ metaId: null, aulaAtual: null, aulaGravada: null, data: null, ...a })

  if (!assinaturaDoCfg(cfg)) add({ tipo: 'plano_sem_assinatura', detalhe: 'O plano não guarda a assinatura do catálogo (cfg.chavesAS): não há como provar a que aula cada meta se refere.' })
  if (!ids.length) add({ tipo: 'grade_vazia', detalhe: 'O plano não tem nenhuma meta na grade.' })

  // posição de cada aula DENTRO da sua disciplina (p/ ultimosTemas)
  const posNaDisc: number[] = []
  const contDisc = new Map<string, number>()
  chaves.forEach((_, i) => { const d = norm(discs[i]); const n = contDisc.get(d) ?? 0; posNaDisc.push(n); contDisc.set(d, n + 1) })
  const ultimos = new Map<string, number>()
  if (cfg.ultimosTemas && typeof cfg.ultimosTemas === 'object') for (const [d, n] of Object.entries(cfg.ultimosTemas as Record<string, unknown>)) if (typeof n === 'number' && Number.isFinite(n)) ultimos.set(norm(d), n)

  // ── linhas de progresso ──
  for (const l of e.linhas) {
    const data = l.concluido_em ?? l.atualizado_em ?? null
    const o = lerOrfao(l.meta_id)
    if (o) {
      add({ tipo: 'meta_orfa', metaId: l.meta_id, aulaGravada: o.chave, aulaAtual: chaves.includes(o.chave) ? o.chave : null, data,
        detalhe: chaves.includes(o.chave) ? 'O documento voltou ao catálogo, mas a meta segue guardada como órfã (deveria ter sido restaurada).' : 'Documento removido do catálogo: o progresso está guardado como órfão.' })
      continue
    }
    const p = parteAula(l.meta_id)
    if (!p) continue
    const atualK = chaves[p.idx] ?? null
    if (atualK == null) { add({ tipo: 'id_fora_do_catalogo', metaId: l.meta_id, aulaGravada: l.aula_key ?? null, data, detalhe: `Progresso aponta para a posição ${p.idx}, que não existe no catálogo atual (${chaves.length} aulas).` }); continue }
    if (l.aula_key && l.aula_key !== atualK) {
      add({ tipo: 'feito_em_aula_diferente', metaId: l.meta_id, aulaAtual: atualK, aulaGravada: l.aula_key, data,
        detalhe: `${ehFeito(l) ? 'Marcada como feita' : 'Marcação'} quando a posição ${p.idx} era ${l.aula_key}; hoje é ${atualK}.` })
    }
  }

  // ── grade ──
  const feitas = new Set(e.linhas.filter(ehFeito).map((l) => l.meta_id))
  const porAula = new Map<number, { pdfull: boolean; revisao: string[] }>()
  const selecao = new Set(((Array.isArray(cfg.discs) ? cfg.discs : []) as unknown[]).map(norm).filter(Boolean))
  const foraSel = new Set<string>()
  for (const id of ids) {
    const p = parteAula(id)
    if (!p) continue
    if (p.idx >= chaves.length) { add({ tipo: 'id_fora_do_catalogo', metaId: id, data: grade[id]?.[0] ?? null, detalhe: `A grade tem a meta ${id}, mas o catálogo atual só tem ${chaves.length} aulas.` }); continue }
    const a = porAula.get(p.idx) ?? { pdfull: false, revisao: [] }
    const tipo = p.pre.startsWith('rf') || p.pre.startsWith('rq') ? 'rev' : p.pre.slice(0, 2)
    if (tipo === 'pf' || tipo === 'pp') a.pdfull = true
    else if ((tipo === 'fl' || tipo === 'qu') && !ehHist(p.pos)) a.revisao.push(id)
    else if (tipo === 'rev') a.revisao.push(id)
    porAula.set(p.idx, a)
    if (selecao.size) { const d = norm(discs[p.idx]); if (d && !selecao.has(d) && !foraSel.has(d)) { foraSel.add(d); add({ tipo: 'materia_fora_da_selecao', metaId: id, aulaAtual: chaves[p.idx], data: grade[id]?.[0] ?? null, detalhe: `A grade tem metas de "${discs[p.idx]}", que não está entre as matérias selecionadas do aluno.` }) } }
  }
  for (const [idx, a] of porAula) {
    if (a.pdfull || !a.revisao.length) continue
    const d = norm(discs[idx]), ut = ultimos.get(d)
    if (ut != null && posNaDisc[idx] <= ut) continue // aula declarada como já estudada: só revisão/questões, sem PDFull, é o esperado
    add({ tipo: 'aula_sem_pdfull_na_grade', metaId: a.revisao[0], aulaAtual: chaves[idx], data: grade[a.revisao[0]]?.[0] ?? null,
      detalhe: `A aula ${idx} (${discs[idx] || 'sem matéria'}) tem ${a.revisao.join(', ')} na grade, mas nenhum PDFull — e ela não está entre as já estudadas declaradas.` })
  }
  for (const aj of revisoesAntesDoEstudo(grade, feitas)) {
    add({ tipo: 'revisao_antes_do_estudo', metaId: aj.id, aulaAtual: aulaDoId(aj.id, chaves), data: aj.de, detalhe: `${aj.id} está agendada em ${aj.de}, antes do estudo (PDFull) ainda não feito.` })
  }
  return out
}

function aulaDoId(id: string, chaves: readonly string[]): string | null {
  const p = parteAula(id)
  return p ? chaves[p.idx] ?? null : null
}

/** Contagem de planos distintos por tipo (para os KPIs). */
export function contarPorTipo(porPlano: ReadonlyArray<readonly Anomalia[]>): Record<TipoAnomalia, number> {
  const r = Object.fromEntries(TIPOS_ANOMALIA.map((t) => [t, 0])) as Record<TipoAnomalia, number>
  for (const lista of porPlano) for (const t of new Set(lista.map((a) => a.tipo))) r[t]++
  return r
}
