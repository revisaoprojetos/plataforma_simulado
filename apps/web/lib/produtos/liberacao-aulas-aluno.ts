import 'server-only'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { remember } from '@/lib/cache/relatorio-cache'
import { ehTestadorGlobal } from '@/lib/sistema/testadores-globais'
import { lerSessaoImpersonation } from '@/lib/impersonation/session'
import { regrasSegmentoDoAluno, type RegrasSegmentoAluno } from '@/lib/segmentos/regras-produto'
import { ContextoAluno, avaliarSegmentos } from '@/lib/segmentos/avaliar'
import { planoFixado } from '@/lib/cronograma/fixar'
import { planoDoAluno, mapaDocsCronograma, hojeBrt } from '@/lib/cronograma/adaptativo/liberacao'
import { indiceAulaDaMeta, subtipoMeta } from '@/lib/cronograma/adaptativo/meta-ids'
import { carregarConteudoBanco } from '@/lib/cronograma/adaptativo/conteudo-banco'
import { chaveDisciplina, numeroAula } from '@/lib/cronograma/adaptativo/catalogo-html'
import { addDias, offsetDesdeSegunda } from '@/lib/cronograma/datas'
import { calendarioValido } from '@/lib/cronograma/calendario-congelado'
import {
  decidirAulaComExcecao, regraCronogramaGovernante, ehDispCronograma, formatarRotuloLiberacao, paramsEfetivos, SEM_PLANO,
  dataBaseDaAula, excecoesAplicaveis, resolverExcecao, ROTULO_BLOQUEADO_ADMIN,
  type DispCronograma, type ParamsLiberacao, type PlanoAula, type Decisao, type ExcecaoLib, type TrilhaDaAula,
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
/** Bloqueio manual (exceção 'bloquear'): ano 9998 — curriculo-aluno traduz p/ MSG_BLOQUEADO_ADMIN. */
export const SENTINELA_BLOQUEIO = '9998-12-31T00:00:00.000Z'
export const MSG_BLOQUEADO_ADMIN = ROTULO_BLOQUEADO_ADMIN
export const ehSentinelaBloqueio = (d: Date | null | undefined) => !!d && d.getUTCFullYear() === 9998

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

export type Mod = { id: string; pai_id: string | null; disponibilidade?: unknown }
export type Item = { id: string; modulo_id: string; ref_id?: string | null; tipo_ref?: string | null; disponibilidade?: unknown }
type Linha = { id?: string; aula_id: string; disciplina: string; numero_aula: number | null; data_liberacao: string; semana?: number | null }

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

type TrilhaRow = { id: string; nome: string; offset_dias: number; segmento_ids: string[] | null }
type DataTrilha = { data: string; trilha: string }

/** Trilhas ativas do produto (compartilhado entre alunos, 60s). Tabela ausente/erro → []. */
async function trilhasAtivas(svc: any, tenantId: string, produtoId: string): Promise<TrilhaRow[]> {
  return remember<TrilhaRow[]>(`lib-aulas:trilhas:${tenantId}:${produtoId}`, 60, async () => {
    try {
      const { data, error } = await svc.from('simulado_liberacao_trilhas').select('id, nome, offset_dias, segmento_ids')
        .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).order('ordem').order('id').limit(200)
      return error ? [] : ((data ?? []) as TrilhaRow[])
    } catch { return [] }
  }).catch(() => [] as TrilhaRow[])
}

/**
 * aula_id → { data (AAAA-MM-DD), trilha (nome) } para o aluno: trilhas em que ele casa (segmento_ids via avaliarSegmentos),
 * MENOR data entre elas; trilha que não traz a aula não contribui. Aula ausente do mapa = usar a data-base da planilha.
 * Cache 60s por aluno+produto. Sem trilhas no produto → {} sem nenhuma query por aluno.
 */
async function datasDeTrilhaDoAluno(svc: any, tenantId: string, estudanteId: string, produtoId: string, linhas: Linha[], ctxAluno: ContextoAluno): Promise<Record<string, DataTrilha>> {
  const trilhas = await trilhasAtivas(svc, tenantId, produtoId)
  if (!trilhas.length) return {}
  return remember<Record<string, DataTrilha>>(`lib-aulas:trilha-datas:${tenantId}:${estudanteId}:${produtoId}`, 60, async () => {
    try {
      const todosSeg = [...new Set(trilhas.flatMap((t) => t.segmento_ids ?? []))]
      if (!todosSeg.length) return {}
      const noSeg = await avaliarSegmentos(ctxAluno, todosSeg)
      const casadas = trilhas.filter((t) => (t.segmento_ids ?? []).some((id) => noSeg.get(id)))
      if (!casadas.length) return {}
      const ids = casadas.map((t) => t.id)
      const linhasTA: Array<{ trilha_id: string; liberacao_aula_id: string; data_cronograma: string | null; data_manual: string | null }> = []
      for (let k = 0; k < ids.length; k += 80) {
        const bloco = ids.slice(k, k + 80)
        linhasTA.push(...await fetchAll<any>(() => svc.from('simulado_liberacao_trilha_aulas')
          .select('id, trilha_id, liberacao_aula_id, data_cronograma, data_manual').in('trilha_id', bloco).order('id') as any))
      }
      const aulaDeLinha = new Map<string, string>()
      for (const l of linhas) if (l.id) aulaDeLinha.set(l.id, l.aula_id)
      const ordem = new Map(casadas.map((t, i) => [t.id, i]))
      const trilhaPorId = new Map(casadas.map((t) => [t.id, t]))
      const porAula = new Map<string, TrilhaDaAula[]>()
      for (const r of [...linhasTA].sort((a, b) => (ordem.get(a.trilha_id) ?? 0) - (ordem.get(b.trilha_id) ?? 0))) {
        const aula = aulaDeLinha.get(r.liberacao_aula_id); const t = trilhaPorId.get(r.trilha_id)
        if (!aula || !t) continue
        const l = porAula.get(aula) ?? []
        l.push({ nome: t.nome, datas: { data_cronograma: r.data_cronograma, data_manual: r.data_manual, offset_dias: t.offset_dias } })
        porAula.set(aula, l)
      }
      const out: Record<string, DataTrilha> = {}
      for (const [aula, ts] of porAula) { const r = dataBaseDaAula(ts, null); if (r.data && r.trilha) out[aula] = { data: r.data, trilha: r.trilha } }
      return out
    } catch { return {} }
  }).catch(() => ({} as Record<string, DataTrilha>))
}

/** O produto tem alguma exceção ativa? (compartilhado, 60s) — evita queries por aluno quando não há nenhuma. */
async function produtoTemExcecoes(svc: any, tenantId: string, produtoId: string): Promise<boolean> {
  return remember<boolean>(`lib-aulas:tem-exc:${tenantId}:${produtoId}`, 60, async () => {
    try {
      const { data, error } = await svc.from('simulado_liberacao_excecoes').select('id').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).limit(1)
      return !error && (data ?? []).length > 0
    } catch { return false }
  }).catch(() => false)
}

/** Exceções do produto que valem para o aluno (dele + dos grupos dele em que é membro vigente), filtradas por vigência. */
async function excecoesDoAluno(svc: any, tenantId: string, estudanteId: string, produtoId: string, ctxAluno: ContextoAluno): Promise<ExcecaoLib[]> {
  try {
    const gr = await ctxAluno.grupos() // mesmo pertencimento usado pelos Segmentos (membro e não vencido)
    const agora = new Date().toISOString()
    const grupos = new Set([...gr.entries()].filter(([, m]) => !m.expira_em || m.expira_em > agora).map(([id]) => id))
    const gids = [...grupos].sort()
    const brutas = await remember<ExcecaoLib[]>(`lib-aulas:exc:${tenantId}:${estudanteId}:${produtoId}`, 30, async () => {
      const cols = 'alvo_tipo, alvo_id, estudante_id, grupo_id, acao, motivo, expira_em, ativo'
      const base = () => svc.from('simulado_liberacao_excecoes').select(cols).eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true)
      const rs = await Promise.all([
        base().eq('estudante_id', estudanteId).limit(2000),
        ...Array.from({ length: Math.ceil(gids.length / 80) }, (_, k) => base().in('grupo_id', gids.slice(k * 80, k * 80 + 80)).limit(2000)),
      ])
      return rs.flatMap((r: any) => (r.error ? [] : ((r.data ?? []) as ExcecaoLib[])))
    })
    return excecoesAplicaveis(brutas, { estudanteId, grupos }, agora)
  } catch { return [] }
}

export async function liberacaoAulasDoAluno(
  svc: any, tenantId: string, estudanteId: string, produtoId: string,
  ctx: { porSeg?: RegrasSegmentoAluno | null; modulos?: Mod[]; itens?: Item[]; ctxAluno?: ContextoAluno } = {},
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
    const temCrono = alvos.some(([id, b]) => ehDispCronograma(propria(id, b).d))
    // Exceções manuais valem mesmo sem regra 'cronograma' (1 consulta compartilhada/60s por produto; sem exceções → null).
    const temExc = await produtoTemExcecoes(svc, tenantId, produtoId)
    if (!temCrono && !temExc) return null
    const ctxAluno = ctx.ctxAluno ?? new ContextoAluno(svc, tenantId, estudanteId)

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

    // EXCEÇÕES manuais (aluno ou grupo): vencem trilha, planilha, plano e meta. bloquear > liberar; módulo vale p/ tudo dentro.
    const excecoes = temExc ? await excecoesDoAluno(svc, tenantId, estudanteId, produtoId, ctxAluno) : []
    const exMemo = new Map<string, ReturnType<typeof resolverExcecao>>()
    const excDeModulo = (moduloId: string | undefined) => {
      if (!moduloId || !excecoes.length) return null
      if (exMemo.has(moduloId)) return exMemo.get(moduloId)!
      const cadeia: string[] = []; let cur: string | null = moduloId; let g = 0
      while (cur && g++ < 50) { cadeia.push(cur); cur = porId.get(cur)?.pai_id ?? null }
      const r = resolverExcecao(cadeia, excecoes); exMemo.set(moduloId, r); return r
    }
    const excDe = (id: string) => excDeModulo(porId.has(id) ? id : itemPorId.get(id)?.modulo_id)

    const montarCronograma = async (): Promise<LiberacaoAulas> => {
    const [cfgRes, linhasRes, planoFn] = await Promise.all([
      svc.from('simulado_produto_liberacao_cfg').select('sem_plano, com_plano, dias_antes').eq('tenant_id', tenantId).eq('produto_id', produtoId).maybeSingle(),
      fetchAll<Linha>(() => svc.from('simulado_produto_liberacao_aulas').select('aula_id, disciplina, numero_aula, data_liberacao, semana')
        .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).not('aula_id', 'is', null).order('ordem') as any).catch(() => [] as Linha[]),
      carregarPlano(svc, tenantId, estudanteId).catch(() => null),
    ])
    const cfg = (cfgRes?.error ? null : cfgRes?.data) as Partial<ParamsLiberacao> | null
    const linhaPorAula = new Map<string, Linha>()
    for (const l of linhasRes) { const ex = linhaPorAula.get(l.aula_id); if (!ex || l.data_liberacao < ex.data_liberacao) linhaPorAula.set(l.aula_id, l) }
    // TRILHAS: a data-base da aula passa a ser a da(s) trilha(s) em que o aluno casa (menor); nenhuma traz a aula → planilha.
    const trilhaPorAula = await datasDeTrilhaDoAluno(svc, tenantId, estudanteId, produtoId, linhasRes, ctxAluno)
    const dataBase = (a: string): string => trilhaPorAula[a]?.data ?? linhaPorAula.get(a)!.data_liberacao

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
      const dec: Decisao[] = aulas.map((a) => {
        return decidirAulaComExcecao({ excecao: excDe(a), cfg: params, linha: { data_liberacao: dataBase(a) }, plano: planoMemo.get(a) ?? SEM_PLANO, hoje })
      })
      if (dec.some((d) => d.liberada) || dec.every((d) => !d.interfere)) return { aberto: true, disp: { ...ABERTO } }
      if (dec.every((d) => d.motivo === 'bloqueado-admin')) return { aberto: false, rotulo: ROTULO_BLOQUEADO_ADMIN, disp: { tipo: 'data', data: SENTINELA_BLOQUEIO, antes } }
      const datas = dec.map((d) => d.liberaEm).filter((x): x is string => !!x).sort()
      // rótulo: da aula bloqueada que libera primeiro (sem data = a que aguarda meta, só se nenhuma tiver data)
      const idx = dec.map((d, k) => ({ d, k })).filter((x) => !x.d.liberada).sort((a, b) => (a.d.liberaEm ?? '9').localeCompare(b.d.liberaEm ?? '9'))[0]
      let rotulo: string | null = null
      if (idx) {
        const a = aulas[idx.k], pl = planoMemo.get(a) ?? SEM_PLANO, ln = { ...linhaPorAula.get(a)!, data_liberacao: dataBase(a) }, d = idx.d
        const tr = trilhaPorAula[a]?.trilha ?? null
        if (d.motivo === 'bloqueado-admin') rotulo = ROTULO_BLOQUEADO_ADMIN
        else
        if (d.motivo === 'concluir-meta') rotulo = formatarRotuloLiberacao({ origem: 'concluir', data: pl.dataMeta, semana: pl.semana, diaSemana: pl.diaSemana })
        else if (d.liberaEm && pl.tem && pl.noPlano && d.motivo !== 'fora-do-plano' && !(d.motivo === 'mais-cedo' && d.liberaEm === ln.data_liberacao)) rotulo = formatarRotuloLiberacao({ origem: 'plano', data: d.liberaEm, semana: pl.semana, diaSemana: pl.diaSemana })
        else if (d.liberaEm) rotulo = formatarRotuloLiberacao({ origem: 'planilha', data: d.liberaEm, semana: tr ? null : ln.semana, trilha: tr })
      }
      return { aberto: false, rotulo, disp: { tipo: 'data', data: datas[0] ? `${datas[0]}T03:00:00.000Z` : SENTINELA_META, antes } }
    }
    // Regra que governa o módulo/aula: a própria, ou (se a aula só tem a base padrão) a do ancestral mais próximo.
    const regraDoModulo = (id: string, base: unknown): unknown | null => regraCronogramaGovernante(id, base, porId, propria)
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
    }

    const cronoLib = temCrono ? await montarCronograma() : null
    if (!excecoes.length) return cronoLib
    const b: LiberacaoAulas = cronoLib ?? {
      disp: (id, base) => propria(id, base).d, bloqueado: () => null, rotulo: () => null, bloqueadoItem: () => null,
    }
    return {
      disp: (id, base) => {
        const e = excDe(id)
        if (!e) return b.disp(id, base)
        return e.acao === 'liberar' ? { ...ABERTO } : { tipo: 'data', data: SENTINELA_BLOQUEIO, antes: 'bloqueado_cadeado' }
      },
      bloqueado: (id, base) => { const e = excDe(id); return e ? e.acao === 'bloquear' : b.bloqueado(id, base) },
      rotulo: (id, base) => { const e = excDe(id); return e ? (e.acao === 'bloquear' ? ROTULO_BLOQUEADO_ADMIN : null) : b.rotulo(id, base) },
      bloqueadoItem: (item) => { const e = excDeModulo(item.modulo_id); return e ? e.acao === 'bloquear' : b.bloqueadoItem(item) },
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

// ───────────────────────────── EXPLICAÇÃO (admin) — MESMO núcleo de decisão do motor ─────────────────────────────

export interface DetalheCronoAula {
  /** Existe regra 'cronograma' (segmento/base/ancestral) valendo para a aula deste aluno? */
  governada: boolean
  regraOrigem: 'segmento' | 'base' | 'ancestral' | null
  params: ParamsLiberacao | null
  /** null = não governada, ou governada sem linha na planilha (o motor deixa aberto). */
  decisao: Decisao | null
  semLinha: boolean
  dataPlanilha: string | null
  dataBase: string | null
  trilha: string | null
  plano: PlanoAula
  excecao: { acao: 'liberar' | 'bloquear'; motivo: string | null; alvoId: string } | null
  rotulo: string | null
}

/**
 * Para o painel "por que este aluno vê/não vê esta aula": reúne os MESMOS insumos do motor (cfg, planilha, trilhas do aluno,
 * plano fixado, exceções) e decide cada aula com `decidirAulaComExcecao` — a mesma função pura que o motor usa. Não altera
 * nada para o aluno. `verTudo` = testador global/impersonation (o motor abre tudo).
 */
export async function detalheCronogramaDoAluno(
  svc: any, tenantId: string, estudanteId: string, produtoId: string,
  ctx: { modulos: Mod[]; itens: Item[]; porSeg: RegrasSegmentoAluno | null; ctxAluno: ContextoAluno },
): Promise<{ verTudo: boolean; detalhe: (aulaId: string, base: unknown) => DetalheCronoAula }> {
  const { modulos, itens, porSeg, ctxAluno } = ctx
  const ver = await verTudo(svc, tenantId, estudanteId)
  const porId = new Map(modulos.map((m) => [m.id, m]))
  const propria = (id: string, base: unknown): { d: unknown; seg: boolean } => {
    const s = porSeg ? porSeg.disp(id, SENT) : SENT
    return s !== SENT ? { d: s, seg: true } : { d: base, seg: false }
  }
  const docsPorModulo = new Map<string, string[]>()
  for (const i of itens) if (i.tipo_ref === 'documento_biblioteca' && i.ref_id) { const l = docsPorModulo.get(i.modulo_id) ?? []; l.push(i.ref_id); docsPorModulo.set(i.modulo_id, l) }

  const excecoes = await excecoesDoAluno(svc, tenantId, estudanteId, produtoId, ctxAluno)
  const cadeiaDe = (moduloId: string): string[] => { const c: string[] = []; let cur: string | null = moduloId; let g = 0; while (cur && g++ < 50) { c.push(cur); cur = porId.get(cur)?.pai_id ?? null } return c }
  const [cfgRes, linhasRes, planoFn] = await Promise.all([
    svc.from('simulado_produto_liberacao_cfg').select('sem_plano, com_plano, dias_antes').eq('tenant_id', tenantId).eq('produto_id', produtoId).maybeSingle(),
    fetchAll<Linha>(() => svc.from('simulado_produto_liberacao_aulas').select('id, aula_id, disciplina, numero_aula, data_liberacao, semana')
      .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).not('aula_id', 'is', null).order('ordem') as any).catch(() => [] as Linha[]),
    carregarPlano(svc, tenantId, estudanteId).catch(() => null),
  ])
  const cfg = (cfgRes?.error ? null : cfgRes?.data) as Partial<ParamsLiberacao> | null
  const linhaPorAula = new Map<string, Linha>()
  for (const l of linhasRes) { const ex = linhaPorAula.get(l.aula_id); if (!ex || l.data_liberacao < ex.data_liberacao) linhaPorAula.set(l.aula_id, l) }
  const trilhaPorAula = await datasDeTrilhaDoAluno(svc, tenantId, estudanteId, produtoId, linhasRes, ctxAluno)
  const hoje = hojeBrt()
  const planoMemo = new Map<string, PlanoAula>()
  await Promise.all([...linhaPorAula.keys()].map(async (aulaId) => {
    if (!planoFn) { planoMemo.set(aulaId, SEM_PLANO); return }
    const l = linhaPorAula.get(aulaId)!
    planoMemo.set(aulaId, await planoFn({ id: aulaId, disc: l.disciplina, num: l.numero_aula }, docsPorModulo.get(aulaId) ?? []))
  }))

  const detalhe = (aulaId: string, base: unknown): DetalheCronoAula => {
    const vazio: DetalheCronoAula = { governada: false, regraOrigem: null, params: null, decisao: null, semLinha: false, dataPlanilha: linhaPorAula.get(aulaId)?.data_liberacao ?? null, dataBase: null, trilha: null, plano: SEM_PLANO, excecao: null, rotulo: null }
    const regra = regraCronogramaGovernante(aulaId, base, porId, propria)
    const exc = resolverExcecao(cadeiaDe(aulaId), excecoes)
    // Exceção vale mesmo sem regra de cronograma (o motor monta o bloqueio/abertura manual à parte).
    if (!regra) return { ...vazio, excecao: exc }
    const p = propria(aulaId, base)
    const regraOrigem: DetalheCronoAula['regraOrigem'] = ehDispCronograma(p.d) ? (p.seg ? 'segmento' : 'base') : 'ancestral'
    const params = paramsEfetivos(regra, cfg)
    const linha = linhaPorAula.get(aulaId)
    if (!linha) return { ...vazio, governada: true, regraOrigem, params, semLinha: true, excecao: exc }
    const dataBase = trilhaPorAula[aulaId]?.data ?? linha.data_liberacao
    const plano = planoMemo.get(aulaId) ?? SEM_PLANO
    const decisao = decidirAulaComExcecao({ excecao: exc, cfg: params, linha: { data_liberacao: dataBase }, plano, hoje })
    const tr = trilhaPorAula[aulaId]?.trilha ?? null
    let rotulo: string | null = null
    if (!decisao.liberada) {
      if (decisao.motivo === 'bloqueado-admin') rotulo = ROTULO_BLOQUEADO_ADMIN
      else if (decisao.motivo === 'concluir-meta') rotulo = formatarRotuloLiberacao({ origem: 'concluir', data: plano.dataMeta, semana: plano.semana, diaSemana: plano.diaSemana })
      else if (decisao.liberaEm && plano.tem && plano.noPlano && decisao.motivo !== 'fora-do-plano' && !(decisao.motivo === 'mais-cedo' && decisao.liberaEm === dataBase)) rotulo = formatarRotuloLiberacao({ origem: 'plano', data: decisao.liberaEm, semana: plano.semana, diaSemana: plano.diaSemana })
      else if (decisao.liberaEm) rotulo = formatarRotuloLiberacao({ origem: 'planilha', data: decisao.liberaEm, semana: tr ? null : linha.semana, trilha: tr })
    }
    return { governada: true, regraOrigem, params, decisao, semLinha: false, dataPlanilha: linha.data_liberacao, dataBase, trilha: tr, plano, excecao: exc, rotulo }
  }
  return { verTudo: ver, detalhe }
}

