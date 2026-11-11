import 'server-only'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { remember } from '@/lib/cache/relatorio-cache'
import { ehTestadorGlobal } from '@/lib/sistema/testadores-globais'
import { lerSessaoImpersonation } from '@/lib/impersonation/session'
import { regrasSegmentoDoAluno, type RegrasSegmentoAluno } from '@/lib/segmentos/regras-produto'
import { planoFixado } from '@/lib/cronograma/fixar'
import { planoDoAluno, mapaDocsCronograma, hojeBrt } from '@/lib/cronograma/adaptativo/liberacao'
import { indiceAulaDaMeta, subtipoMeta } from '@/lib/cronograma/adaptativo/meta-ids'
import { carregarConteudoBanco } from '@/lib/cronograma/adaptativo/conteudo-banco'
import { chaveDisciplina, numeroAula } from '@/lib/cronograma/adaptativo/catalogo-html'
import { addDias, offsetDesdeSegunda } from '@/lib/cronograma/datas'
import { calendarioValido } from '@/lib/cronograma/calendario-congelado'
import {
  decidirLiberacao, ehDispCronograma, formatarRotuloLiberacao, paramsEfetivos, SEM_PLANO,
  type DispCronograma, type ParamsLiberacao, type PlanoAula,
} from './liberacao-aulas-decisao'

export { ehDispCronograma, type DispCronograma } from './liberacao-aulas-decisao'

/**
 * LIBERAÇÃO DE AULAS DO EXTENSIVO por planilha + cronograma fixado do aluno.
 *
 * Ativada SÓ por uma disponibilidade do tipo 'cronograma' (regra de segmento em simulado_produto_disponibilidade_seg
 * ou disponibilidade base do módulo/aula/item):
 *   { tipo:'cronograma', sem_plano:'planilha'|'liberado'|'atual', com_plano:'concluir_meta'|'plano'|'mais_cedo',
 *     dias_antes:number, antes:'bloqueado_cadeado' }
 * Campos ausentes herdam a cfg do produto (simulado_produto_liberacao_cfg); sem cfg → padrão (planilha/concluir_meta/0).
 * `cfg.ativo` NÃO desliga uma regra explícita (a cfg é só o padrão dos parâmetros).
 *
 * `disp(id, base)` devolve uma Disponibilidade CONCRETA (o resto do currículo não muda):
 *   liberada            → { tipo:'na_matricula' }
 *   bloqueada por data  → { tipo:'data', data:<AAAA-MM-DDT03:00Z> }            ("Libera em DD/MM")
 *   aguarda meta        → { tipo:'data', data:SENTINELA_META (ano 9999) }      (curriculo-aluno traduz p/ mensagem)
 * Sem nenhuma regra 'cronograma' para o aluno/produto a função devolve null (zero custo extra).
 * Testadores globais e impersonation veem tudo (a regra resolve para liberada).
 */

export const SENTINELA_META = '9999-12-31T00:00:00.000Z'
export const MSG_AGUARDA_META = 'Libera ao concluir a meta no seu cronograma'
export const ehSentinelaMeta = (d: Date | null | undefined) => !!d && d.getUTCFullYear() >= 9999

export interface LiberacaoAulas {
  /** Disponibilidade efetiva: segmento (prioridade) → 'cronograma' resolvido → base. */
  disp: (alvoId: string, base: unknown) => unknown
  /** true = bloqueado pelo motor de cronograma; false = liberado por ele; null = alvo não governado por 'cronograma'. */
  bloqueado: (alvoId: string, base: unknown) => boolean | null
  /** Idem, para um ITEM (considera a regra do item e a da aula/módulo que o contém). */
  /** Rótulo do cadeado conforme o cronograma ("Libera em seg., 16/11/2026 · semana 3 do seu cronograma"); null = usar o padrão. */
  rotulo: (alvoId: string, base: unknown) => string | null
  bloqueadoItem: (item: { id: string; modulo_id: string; disponibilidade?: unknown }) => boolean | null
}

type Mod = { id: string; pai_id: string | null; disponibilidade?: unknown }
type Item = { id: string; modulo_id: string; ref_id?: string | null; tipo_ref?: string | null; disponibilidade?: unknown }
type Linha = { aula_id: string; disciplina: string; numero_aula: number | null; data_liberacao: string; semana?: number | null }

const SENT = Symbol('sem-regra-segmento')
const ABERTO = { tipo: 'na_matricula', antes: 'bloqueado_cadeado' } as const

async function verTudo(svc: any, tenantId: string, estudanteId: string): Promise<boolean> {
  if (await ehTestadorGlobal({ tenantId, estudanteId }).catch(() => false)) return true
  try { const s = await lerSessaoImpersonation(); return !!s && s.estudanteId === estudanteId } catch { return false }
}

/** Plano do aluno → função aula→PlanoAula. Cacheia só o que é caro (conteúdo do catálogo, 300s, compartilhado). */
async function carregarPlano(svc: any, tenantId: string, estudanteId: string): Promise<null | ((aula: { id: string; disc: string; num: number | null }, docs: string[]) => Promise<PlanoAula>)> {
  const fix = await planoFixado(svc, tenantId, estudanteId).catch(() => null)
  if (!fix) return null

  if (fix.tipo === 'adaptativo') {
    const [p, mapa, idxDiscNum] = await Promise.all([
      planoDoAluno(svc, tenantId, estudanteId),
      mapaDocsCronograma(svc, tenantId).catch(() => null),
      remember<Record<string, number>>(`lib-aulas:idx-disc-num:${tenantId}`, 300, async () => {
        const c = await carregarConteudoBanco(svc, tenantId)
        const ativas = c.ordem ? new Set(c.ordem) : null
        const out: Record<string, number> = {}
        c.AS.forEach((e, i) => {
          if (!e[6] || (ativas && !ativas.has(i))) return
          const n = numeroAula(String(e[2] ?? '')) ?? Number(e[1])
          if (n) out[`${chaveDisciplina(String(e[0]))}|${n}`] = i
        })
        return out
      }).catch(() => ({} as Record<string, number>)),
    ])
    if (!p.tem) return null
    const feitas = new Set(p.feitas)
    // metas "da aula" = PDFull regular (pf) e suas partes (pp); revisão/reforço/PDFlash/questões não contam.
    const porIndice = new Map<number, string[]>()
    for (const id of Object.keys(p.datas)) {
      const t = id.split(':')[0]
      if ((t !== 'pf' && t !== 'pp') || subtipoMeta(id)) continue
      const i = indiceAulaDaMeta(id); if (i == null) continue
      const l = porIndice.get(i) ?? []; l.push(id); porIndice.set(i, l)
    }
    return async (aula, docs) => {
      let i: number | null = null
      for (const d of docs) { const a = mapa?.docs[d]; if (a && a.k === 'a') { i = a.i; break } }
      if (i == null && aula.num) i = idxDiscNum[`${chaveDisciplina(aula.disc)}|${aula.num}`] ?? null
      const metas = i != null ? porIndice.get(i) ?? [] : []
      if (!metas.length) return { tem: true, noPlano: false, dataMeta: null, concluida: false }
      const ord = metas.filter((m) => p.datas[m]).sort((a, b) => p.datas[a].localeCompare(p.datas[b]))
      const dataMeta = ord[0] ? p.datas[ord[0]] : null
      return { tem: true, noPlano: true, dataMeta, concluida: metas.every((m) => feitas.has(m)), semana: ord[0] ? p.semanas?.[ord[0]] ?? null : null }
    }
  }

  // Cronograma PADRÃO (emissão Revisão): metas 'pdfull' do catálogo + checks do aluno + calendário congelado.
  const { data: em, error } = await svc.from('simulado_cronograma_emissoes').select('id, cronograma_id, grade_snapshot')
    .eq('tenant_id', tenantId).eq('id', fix.id).maybeSingle()
  if (error || !em) return null
  const cron = em as { id: string; cronograma_id: string; grade_snapshot?: unknown }
  const [metas, checks, crono] = await Promise.all([
    fetchAll<{ id: string; semana: number; dia: number; disciplina: string; aula: string | null }>(() =>
      svc.from('simulado_cronograma_metas').select('id, semana, dia, disciplina, aula').eq('tenant_id', tenantId).eq('cronograma_id', cron.cronograma_id).eq('tipo', 'pdfull').order('id') as any),
    fetchAll<{ meta_id: string }>(() => svc.from('simulado_cronograma_meta_checks').select('meta_id').eq('tenant_id', tenantId).eq('emissao_id', cron.id).order('meta_id') as any),
    svc.from('simulado_cronogramas').select('dias_curso').eq('tenant_id', tenantId).eq('id', cron.cronograma_id).maybeSingle(),
  ])
  const feitas = new Set(checks.map((c) => c.meta_id))
  const cal = calendarioValido(cron.grade_snapshot) ? cron.grade_snapshot : null
  const diasCurso: number[] = cal?.dias_curso ?? ((crono?.data as any)?.dias_curso ?? [])
  const dataDe = (m: { semana: number; dia: number }): { data: string | null; semana: number; dow: number | null } => {
    const slot = cal?.slots.find((s) => s.kind === 'conteudo' && (s as any).semanaCatalogo === m.semana)
    const idx = diasCurso.length ? Math.min(Math.max(m.dia, 0), diasCurso.length - 1) : -1
    const dow = idx >= 0 ? diasCurso[idx] : null
    if (!slot || idx < 0) return { data: null, semana: m.semana, dow }
    return { data: addDias(slot.inicio, offsetDesdeSegunda(diasCurso[idx])), semana: slot.numero, dow }
  }
  const porChave = new Map<string, Array<{ id: string; data: string | null; semana: number; dow: number | null }>>()
  for (const m of metas) {
    const n = numeroAula(m.aula ?? ''); if (!n) continue
    const k = `${chaveDisciplina(m.disciplina)}|${n}`
    const l = porChave.get(k) ?? []; l.push({ id: m.id, ...dataDe(m) }); porChave.set(k, l)
  }
  return async (aula) => {
    const l = aula.num ? porChave.get(`${chaveDisciplina(aula.disc)}|${aula.num}`) : undefined
    if (!l?.length) return { tem: true, noPlano: false, dataMeta: null, concluida: false }
    const cmp = [...l].sort((a, b) => (a.data ?? '9').localeCompare(b.data ?? '9') || a.semana - b.semana)[0]
    return { tem: true, noPlano: true, dataMeta: cmp.data, concluida: l.every((x) => feitas.has(x.id)), semana: cmp.semana, diaSemana: cmp.dow }
  }
}

export async function liberacaoAulasDoAluno(
  svc: any, tenantId: string, estudanteId: string, produtoId: string,
  ctx: { porSeg?: RegrasSegmentoAluno | null; modulos?: Mod[]; itens?: Item[] } = {},
): Promise<LiberacaoAulas | null> {
  try {
    const modulos: Mod[] = ctx.modulos ?? await fetchAll<Mod>(() =>
      svc.from('simulado_produto_modulos').select('id, pai_id, disponibilidade').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false).order('id') as any)
    const itens: Item[] = ctx.itens ?? []
    const porSeg = ctx.porSeg !== undefined ? ctx.porSeg : await regrasSegmentoDoAluno(svc, tenantId, estudanteId, produtoId).catch(() => null)

    // própria disponibilidade (segmento tem prioridade) e se veio de segmento
    const propria = (id: string, base: unknown): { d: unknown; seg: boolean } => {
      const s = porSeg ? porSeg.disp(id, SENT) : SENT
      return s !== SENT ? { d: s, seg: true } : { d: base, seg: false }
    }
    // Há alguma regra 'cronograma' que valha para este aluno? Senão: null (nada muda, nenhuma query extra).
    const alvos: Array<[string, unknown]> = [...modulos.map((m): [string, unknown] => [m.id, m.disponibilidade]), ...itens.map((i): [string, unknown] => [i.id, i.disponibilidade])]
    if (!alvos.some(([id, b]) => ehDispCronograma(propria(id, b).d))) return null

    const ver = await verTudo(svc, tenantId, estudanteId)
    const porId = new Map(modulos.map((m) => [m.id, m]))
    const itemPorId = new Map(itens.map((i) => [i.id, i]))
    const filhos = new Map<string, string[]>()
    for (const m of modulos) if (m.pai_id) { const l = filhos.get(m.pai_id) ?? []; l.push(m.id); filhos.set(m.pai_id, l) }
    const docsPorModulo = new Map<string, string[]>()
    for (const i of itens) if (i.tipo_ref === 'documento_biblioteca' && i.ref_id) { const l = docsPorModulo.get(i.modulo_id) ?? []; l.push(i.ref_id); docsPorModulo.set(i.modulo_id, l) }

    if (ver) {
      const aberto = { ...ABERTO }
      const gov = (id: string, base: unknown) => ehDispCronograma(propria(id, base).d)
      return {
        disp: (id, base) => { const p = propria(id, base); return ehDispCronograma(p.d) ? aberto : p.d },
        bloqueado: (id, base) => (gov(id, base) ? false : null),
        rotulo: () => null,
        bloqueadoItem: () => false,
      }
    }

    const [cfgRes, linhasRes, planoFn] = await Promise.all([
      svc.from('simulado_produto_liberacao_cfg').select('sem_plano, com_plano, dias_antes').eq('tenant_id', tenantId).eq('produto_id', produtoId).maybeSingle(),
      fetchAll<Linha>(() => svc.from('simulado_produto_liberacao_aulas').select('aula_id, disciplina, numero_aula, data_liberacao, semana')
        .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).not('aula_id', 'is', null).order('ordem') as any).catch(() => [] as Linha[]),
      carregarPlano(svc, tenantId, estudanteId).catch(() => null),
    ])
    const cfg = (cfgRes?.error ? null : cfgRes?.data) as Partial<ParamsLiberacao> | null
    const linhaPorAula = new Map<string, Linha>()
    for (const l of linhasRes) { const ex = linhaPorAula.get(l.aula_id); if (!ex || l.data_liberacao < ex.data_liberacao) linhaPorAula.set(l.aula_id, l) }

    // aulas (com linha) sob o alvo: ele próprio e descendentes
    const aulasDe = (id: string): string[] => {
      const out: string[] = []; const pilha = [id]; let g = 0
      while (pilha.length && g++ < 5000) { const x = pilha.pop()!; if (linhaPorAula.has(x)) out.push(x); for (const f of filhos.get(x) ?? []) pilha.push(f) }
      return out
    }
    const hoje = hojeBrt()
    const planoMemo = new Map<string, PlanoAula>()
    const planoDaAula = async (aulaId: string): Promise<PlanoAula> => {
      if (!planoFn) return SEM_PLANO
      let p = planoMemo.get(aulaId)
      if (!p) { const l = linhaPorAula.get(aulaId)!; p = await planoFn({ id: aulaId, disc: l.disciplina, num: l.numero_aula }, docsPorModulo.get(aulaId) ?? []); planoMemo.set(aulaId, p) }
      return p
    }
    // Resolução é SÍNCRONA no consumo: pré-calcula o plano de TODAS as aulas com linha (poucas centenas, em memória).
    await Promise.all([...linhaPorAula.keys()].map(planoDaAula))

    const resolver = (aulaAlvo: string, regra: unknown): { aberto: boolean; disp: Record<string, unknown>; rotulo?: string | null } => {
      const params = paramsEfetivos(regra, cfg)
      const antes = (regra as { antes?: string })?.antes === 'oculto' ? 'oculto' : 'bloqueado_cadeado'
      const aulas = aulasDe(aulaAlvo)
      if (!aulas.length) return { aberto: true, disp: { ...ABERTO } }
      const dec = aulas.map((a) => decidirLiberacao({ cfg: params, linha: { data_liberacao: linhaPorAula.get(a)!.data_liberacao }, plano: planoMemo.get(a) ?? SEM_PLANO, hoje }))
      if (dec.some((d) => d.liberada) || dec.every((d) => !d.interfere)) return { aberto: true, disp: { ...ABERTO } }
      const datas = dec.map((d) => d.liberaEm).filter((x): x is string => !!x).sort()
      // rótulo: da aula bloqueada que libera primeiro (sem data = a que aguarda meta, só se nenhuma tiver data)
      const idx = dec.map((d, k) => ({ d, k })).filter((x) => !x.d.liberada).sort((a, b) => (a.d.liberaEm ?? '9').localeCompare(b.d.liberaEm ?? '9'))[0]
      let rotulo: string | null = null
      if (idx) {
        const a = aulas[idx.k], pl = planoMemo.get(a) ?? SEM_PLANO, ln = linhaPorAula.get(a)!, d = idx.d
        if (d.motivo === 'concluir-meta') rotulo = formatarRotuloLiberacao({ origem: 'concluir', data: pl.dataMeta, semana: pl.semana, diaSemana: pl.diaSemana })
        else if (d.liberaEm && pl.tem && pl.noPlano && d.motivo !== 'fora-do-plano' && !(d.motivo === 'mais-cedo' && d.liberaEm === ln.data_liberacao)) rotulo = formatarRotuloLiberacao({ origem: 'plano', data: d.liberaEm, semana: pl.semana, diaSemana: pl.diaSemana })
        else if (d.liberaEm) rotulo = formatarRotuloLiberacao({ origem: 'planilha', data: d.liberaEm, semana: ln.semana })
      }
      return { aberto: false, rotulo, disp: { tipo: 'data', data: datas[0] ? `${datas[0]}T03:00:00.000Z` : SENTINELA_META, antes } }
    }
    // Regra que governa o módulo/aula: a própria, ou (se a aula só tem a base padrão) a do ancestral mais próximo.
    const regraDoModulo = (id: string, base: unknown): unknown | null => {
      const p = propria(id, base)
      if (ehDispCronograma(p.d)) return p.d
      const baseNeutra = !p.seg && (!p.d || (p.d as { tipo?: string }).tipo === 'na_matricula')
      if (!baseNeutra) return null
      let cur = porId.get(id)?.pai_id ?? null; let g = 0
      while (cur && g++ < 50) {
        const m = porId.get(cur); if (!m) break
        const pa = propria(m.id, m.disponibilidade)
        if (ehDispCronograma(pa.d)) return pa.d
        cur = m.pai_id
      }
      return null
    }
    const eModulo = (id: string) => porId.has(id)

    const dispDe = (id: string, base: unknown) => {
      if (eModulo(id)) { const r = regraDoModulo(id, base); if (r) return resolver(id, r) }
      else { const it = itemPorId.get(id); const p = propria(id, base); if (it && ehDispCronograma(p.d)) return resolver(it.modulo_id, p.d) }
      return null
    }
    return {
      disp: (id, base) => { const r = dispDe(id, base); return r ? r.disp : propria(id, base).d },
      bloqueado: (id, base) => { const r = dispDe(id, base); return r ? !r.aberto : null },
      rotulo: (id, base) => dispDe(id, base)?.rotulo ?? null,
      bloqueadoItem: (item) => {
        const ri = dispDe(item.id, item.disponibilidade ?? null)
        const m = porId.get(item.modulo_id)
        const rm = m ? dispDe(m.id, m.disponibilidade) : null
        if (!ri && !rm) return null
        return (ri ? !ri.aberto : false) || (rm ? !rm.aberto : false)
      },
    }
  } catch {
    return null // qualquer falha de infra: comportamento atual (não tranca o aluno)
  }
}

/**
 * Gate de LEITURA/DOWNLOAD (leitor.ts): o documento só aparece em aulas de extensivo cuja liberação por
 * cronograma está bloqueada para o aluno? Só bloqueia quando TODAS as colocações do documento em produtos estão
 * bloqueadas pelo motor; qualquer colocação não governada/liberada → false. Testador/impersonation → false.
 * Custo normal: 1 consulta indexada por documento (cache 60s); sem regra 'cronograma' nada mais roda.
 */
export async function docBloqueadoPorLiberacaoAulas(svc: any, tenantId: string, estudanteId: string, documentoId: string): Promise<boolean> {
  try {
    return await remember<boolean>(`lib-aulas:doc:${tenantId}:${estudanteId}:${documentoId}`, 60, async () => {
      if (await verTudo(svc, tenantId, estudanteId)) return false
      const { data } = await svc.from('simulado_produto_modulo_itens').select('id, produto_id, modulo_id, ref_id, tipo_ref, disponibilidade')
        .eq('tenant_id', tenantId).eq('ref_id', documentoId).eq('tipo_ref', 'documento_biblioteca').eq('deletado', false).eq('situacao', 'ativo').limit(50)
      const lista = (data ?? []) as Array<Item & { produto_id: string }>
      if (!lista.length) return false
      for (const produtoId of [...new Set(lista.map((i) => i.produto_id))]) {
        const doProduto = lista.filter((i) => i.produto_id === produtoId)
        const lib = await liberacaoAulasDoAluno(svc, tenantId, estudanteId, produtoId, { itens: doProduto })
        if (!lib) return false
        for (const it of doProduto) if (lib.bloqueadoItem(it) !== true) return false
      }
      return true
    })
  } catch { return false }
}
