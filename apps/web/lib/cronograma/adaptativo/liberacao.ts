import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { ehTestadorGlobal } from '@/lib/sistema/testadores-globais'
import { carregarConteudoBanco } from './conteudo-banco'
import { chaveDisciplina } from './catalogo-html'

/**
 * LIBERAÇÃO POR DATA do Cronograma Adaptativo.
 *
 * Com o bloqueio ATIVO (admin › Cronograma › Cronograma adaptativo), cada MATERIAL do cronograma
 * (PDFULL da aula, PDFight/PDFlash da mesma aula e documentos de LegProc) só abre/baixa para o aluno
 * quando a meta correspondente chega no PLANO DELE (data da meta − "dias antes"), ou se ele já concluiu
 * a meta. Vale no cronograma E na Biblioteca (o gate fica nas funções de leitura/download do leitor).
 *
 * Documentos que NÃO são material do cronograma (fora das pastas vinculadas às disciplinas) seguem as
 * regras normais de acesso — este módulo não mexe neles.
 *
 * Config por tenant em `simulado_tenants.tema.cronograma_bloqueio` (sem migração; mesmo padrão de
 * leitura+merge que o resto do `tema`).
 */

export interface CfgLiberacao {
  /** Chave mestre: false = nada é bloqueado (comportamento antigo). */
  ativo: boolean
  /** Libera o material N dias ANTES da data da meta (0 = só no dia). */
  diasAntes: number
  /** Aluno SEM cronograma criado: bloqueia os materiais do cronograma ou libera normalmente. */
  semPlano: 'bloquear' | 'liberar'
  /** Material que não está no plano do aluno (ex.: disciplina que ele não escolheu). */
  foraDoPlano: 'bloquear' | 'liberar'
  /** Exceções: alunos e grupos SEM bloqueio. */
  alunos: string[]
  grupos: string[]
  atualizadoEm?: string | null
  atualizadoPor?: string | null
}

export const CFG_LIBERACAO_PADRAO: CfgLiberacao = {
  ativo: false, diasAntes: 0, semPlano: 'bloquear', foraDoPlano: 'bloquear', alunos: [], grupos: [],
}

const CHAVE_TEMA = 'cronograma_bloqueio'
const kCfg = (t: string) => `crono-lib:cfg:${t}`
const kMapa = (t: string) => `crono-lib:mapa:${t}`
const kPlano = (t: string, a: string) => `crono-lib:plano:${t}:${a}`
const kGrupos = (t: string, a: string) => `crono-lib:grupos:${t}:${a}`

export function normalizarCfg(raw: unknown): CfgLiberacao {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const lista = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x))] : [])
  const dias = Math.trunc(Number(r.diasAntes))
  return {
    ativo: r.ativo === true,
    diasAntes: Number.isFinite(dias) ? Math.max(0, Math.min(60, dias)) : 0,
    semPlano: r.semPlano === 'liberar' ? 'liberar' : 'bloquear',
    foraDoPlano: r.foraDoPlano === 'liberar' ? 'liberar' : 'bloquear',
    alunos: lista(r.alunos),
    grupos: lista(r.grupos),
    atualizadoEm: typeof r.atualizadoEm === 'string' ? r.atualizadoEm : null,
    atualizadoPor: typeof r.atualizadoPor === 'string' ? r.atualizadoPor : null,
  }
}

/** Lê a config (cache curto; `salvarCfgLiberacao` invalida na hora). Erro → padrão (DESLIGADO). */
export async function lerCfgLiberacao(svc: SupabaseClient, tenantId: string): Promise<CfgLiberacao> {
  return remember<CfgLiberacao>(kCfg(tenantId), 30, async () => {
    try {
      const { data } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
      return normalizarCfg(((data as { tema?: Record<string, unknown> } | null)?.tema ?? {})[CHAVE_TEMA])
    } catch { return { ...CFG_LIBERACAO_PADRAO } }
  })
}

/** Grava a config (merge no `tema`, sem apagar as outras chaves) e invalida o cache. */
export async function salvarCfgLiberacao(svc: SupabaseClient, tenantId: string, cfg: CfgLiberacao, atorId: string | null): Promise<{ ok: boolean; error?: string }> {
  const { data, error: e1 } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
  if (e1) return { ok: false, error: e1.message }
  const tema = { ...(((data as { tema?: Record<string, unknown> } | null)?.tema) ?? {}) }
  tema[CHAVE_TEMA] = { ...normalizarCfg(cfg), atualizadoEm: new Date().toISOString(), atualizadoPor: atorId }
  const { error } = await svc.from('simulado_tenants').update({ tema }).eq('id', tenantId)
  if (error) return { ok: false, error: error.message }
  await esquecer(kCfg(tenantId)).catch(() => {})
  await esquecer(kMapa(tenantId)).catch(() => {})
  return { ok: true }
}

// ── Mapa doc → meta(s) do cronograma ─────────────────────────────────────────────────────────────
/** a = aula (índice em AS: libera com pf/pp/fl/qu/rf/rq daquela aula) · lp = bloco de lei seca. */
export type AlvoDoc = { k: 'a'; i: number } | { k: 'lp'; ids: string[] }
export interface MapaDocs { docs: Record<string, AlvoDoc>; aulas: number; legproc: number; materiais: number; titulos: Record<string, string> }

const numAula = (t: string) => { const m = /\baula\s*0*(\d{1,3})\b/i.exec(t || ''); return m ? Number(m[1]) : null }
const normDisc = (s: string) => chaveDisciplina(s) // "Eleitoral" = "Direito Eleitoral" etc. (catalogo-html)

export async function mapaDocsCronograma(svc: SupabaseClient, tenantId: string): Promise<MapaDocs> {
  return remember<MapaDocs>(kMapa(tenantId), 300, async () => {
    const vazio: MapaDocs = { docs: {}, aulas: 0, legproc: 0, materiais: 0, titulos: {} }
    const c = await carregarConteudoBanco(svc, tenantId).catch(() => null)
    if (!c || c.vazio) return vazio
    const docs: Record<string, AlvoDoc> = {}; const titulos: Record<string, string> = {}
    const porDiscNum = new Map<string, number>() // "disciplina|nºaula" → índice em AS
    let aulas = 0, legproc = 0, materiais = 0
    const ativas = c.ordem ? new Set(c.ordem) : null
    const apoio: Array<{ id: string; titulo: string; disc: string }> = []
    c.AS.forEach((e, i) => {
      const docId = e[6]; if (!docId) return
      // fora da distribuição (ex.: PDFIGHT guardado em pasta sem tipo): trata como material de apoio
      if (ativas && !ativas.has(i)) { apoio.push({ id: docId, titulo: String(e[2] ?? ''), disc: String(e[0]) }); return }
      docs[docId] = { k: 'a', i }; titulos[docId] = String(e[2] ?? ''); aulas++
      const n = numAula(String(e[2] ?? '')) ?? Number(e[1])
      if (n) porDiscNum.set(`${normDisc(String(e[0]))}|${n}`, i)
    })
    // LegProc: a lei (documento) libera na 1ª meta dela no plano. Ids 2.8 ("lp:<doc>:<n>") + antigos ("lp:s:j").
    const lpIds = new Map<string, string[]>()
    const addLp = (docId: string, id: string, titulo: string) => { const l = lpIds.get(docId) || []; l.push(id); lpIds.set(docId, l); if (!titulos[docId]) titulos[docId] = titulo }
    for (const it of c.LP || []) if (it.doc) addLp(it.doc, it.id, it.texto.split(' — ')[0])
    ;(c.WLPdoc || []).forEach((linha, s) => (linha || []).forEach((docId, j) => { if (docId) addLp(docId, `lp:${s}:${j}`, String(c.WLP[s]?.[j] ?? '')) }))
    for (const [docId, ids] of lpIds) { docs[docId] = { k: 'lp', ids }; legproc++ }
    // PDFight/PDFlash/Questões: liberam JUNTO com a aula de mesmo nº e disciplina (sem par → fica livre).
    for (const m of [...(c.materiais || []), ...apoio]) {
      const n = numAula(m.titulo); if (!n) continue
      const i = porDiscNum.get(`${normDisc(m.disc)}|${n}`); if (i == null) continue
      docs[m.id] = { k: 'a', i }; titulos[m.id] = m.titulo; materiais++
    }
    return { docs, aulas, legproc, materiais, titulos }
  })
}

// ── Plano do aluno (datas por meta) ──────────────────────────────────────────────────────────────
interface PlanoAluno { tem: boolean; datas: Record<string, string>; feitas: string[] }

/** O plano EM FOCO do aluno (fixado; senão o mais recente não-arquivado) — o mesmo que o cronograma mostra. */
async function planoDoAluno(svc: SupabaseClient, tenantId: string, alunoId: string): Promise<PlanoAluno> {
  return remember<PlanoAluno>(kPlano(tenantId, alunoId), 60, async () => {
    const T = 'simulado_cronograma_adaptativo_plano'
    // 1ª leitura LEVE (sem o JSON da grade): id, exemplo e se as metas já estão em linhas (plano_meta). Sem a coluna → só o JSON.
    const leve = (cols: string) => () => svc.from(T).select(cols).eq('tenant_id', tenantId).eq('estudante_id', alunoId).eq('arquivada', false)
    const achar = async (cols: string) => {
      let { data: row, error } = await leve(cols)().eq('fixado', true).maybeSingle()
      if (error) return { row: null, error }
      if (!row) ({ data: row, error } = await leve(cols)().order('criado_em', { ascending: false }).limit(1).maybeSingle())
      return { row: row as unknown as { id: string; exemplo: boolean; grade_espelhada_hash?: string | null; plano?: Record<string, [string, number]> | null } | null, error }
    }
    let { row: r, error: errLeve } = await achar('id, exemplo, grade_espelhada_hash')
    const comLinhas = !errLeve
    if (errLeve) ({ row: r } = await achar('id, exemplo'))
    if (!r || r.exemplo) return { tem: false, datas: {}, feitas: [] }

    const datas: Record<string, string> = {}
    if (comLinhas && r.grade_espelhada_hash) {
      // LINHAS (plano_meta): só meta_id + data — nada de baixar a grade inteira em JSON
      for (let from = 0; ; from += 1000) {
        const { data: rows, error } = await svc.from('simulado_cronograma_adaptativo_plano_meta').select('meta_id, data_prevista')
          .eq('plano_id', r.id).order('meta_id', { ascending: true }).range(from, from + 999)
        if (error) { for (const k of Object.keys(datas)) delete datas[k]; break } // falhou no meio → cai no JSON abaixo
        for (const m of (rows ?? []) as Array<{ meta_id: string; data_prevista: string }>) datas[m.meta_id] = m.data_prevista
        if (!rows || rows.length < 1000) break
      }
    }
    if (!Object.keys(datas).length) {
      // fallback: grade em JSON (plano ainda não espelhado, ou migração pendente)
      const { data: pj } = await svc.from(T).select('plano').eq('id', r.id).maybeSingle()
      const plano = (pj as { plano: Record<string, [string, number]> | null } | null)?.plano
      if (!plano || !Object.keys(plano).length) return { tem: false, datas: {}, feitas: [] }
      for (const [id, v] of Object.entries(plano)) if (Array.isArray(v) && typeof v[0] === 'string') datas[id] = v[0]
    }
    const { data: metas } = await svc.from('simulado_cronograma_adaptativo_meta').select('meta_id')
      .eq('tenant_id', tenantId).eq('plano_id', r.id).eq('estado', 'done')
    return { tem: true, datas, feitas: ((metas ?? []) as Array<{ meta_id: string }>).map((m) => m.meta_id) }
  })
}

async function alunoEmGrupoLiberado(svc: SupabaseClient, tenantId: string, alunoId: string, grupos: string[]): Promise<boolean> {
  if (!grupos.length) return false
  const meus = await remember<string[]>(kGrupos(tenantId, alunoId), 60, async () => {
    const { data } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', alunoId)
    return ((data ?? []) as Array<{ grupo_id: string }>).map((g) => g.grupo_id)
  })
  return meus.some((g) => grupos.includes(g))
}

/** A meta (id do motor) se refere a este alvo? pf:i · pp:i:p · fl:i · qu:i · rf:sem:i · rq:sem:i · lp:s:j */
function metaDoAlvo(metaId: string, alvo: AlvoDoc): boolean {
  const [t, a, b] = metaId.split(':')
  if (alvo.k === 'lp') return t === 'lp' && alvo.ids.includes(metaId)
  if (t === 'lp') return false
  const idx = t === 'rf' || t === 'rq' ? Number(b) : Number(a)
  return idx === alvo.i
}

/** Hoje em Brasília (YYYY-MM-DD) e soma de dias numa data ISO. */
export function hojeBrt(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()) }
function somarDias(iso: string, d: number): string { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10) }

export type MotivoLiberacao = 'desligado' | 'nao-cronograma' | 'testador' | 'excecao' | 'concluida' | 'data' | 'sem-plano' | 'fora-do-plano'
export interface Liberacao { bloqueado: boolean; motivo: MotivoLiberacao; liberaEm: string | null; titulo?: string }

/**
 * Decide se o material está liberado para o aluno. Seguro por padrão do lado do ALUNO só quando o
 * bloqueio está ATIVO: qualquer erro de leitura do plano/config cai em "desligado" (não tranca o
 * lançamento por falha de infraestrutura).
 */
export async function liberacaoDoc(svc: SupabaseClient, tenantId: string, alunoId: string, docId: string): Promise<Liberacao> {
  try {
    const cfg = await lerCfgLiberacao(svc, tenantId)
    if (!cfg.ativo) return { bloqueado: false, motivo: 'desligado', liberaEm: null }
    const mapa = await mapaDocsCronograma(svc, tenantId)
    const alvo = mapa.docs[docId]
    if (!alvo) return { bloqueado: false, motivo: 'nao-cronograma', liberaEm: null }
    const titulo = mapa.titulos[docId]
    if (cfg.alunos.includes(alunoId)) return { bloqueado: false, motivo: 'excecao', liberaEm: null, titulo }
    if (await ehTestadorGlobal({ tenantId, estudanteId: alunoId })) return { bloqueado: false, motivo: 'testador', liberaEm: null, titulo }
    if (await alunoEmGrupoLiberado(svc, tenantId, alunoId, cfg.grupos)) return { bloqueado: false, motivo: 'excecao', liberaEm: null, titulo }
    const p = await planoDoAluno(svc, tenantId, alunoId)
    if (!p.tem) return { bloqueado: cfg.semPlano === 'bloquear', motivo: 'sem-plano', liberaEm: null, titulo }
    if (p.feitas.some((m) => metaDoAlvo(m, alvo))) return { bloqueado: false, motivo: 'concluida', liberaEm: null, titulo }
    let primeira: string | null = null
    for (const [id, d] of Object.entries(p.datas)) if (metaDoAlvo(id, alvo) && (!primeira || d < primeira)) primeira = d
    if (!primeira) return { bloqueado: cfg.foraDoPlano === 'bloquear', motivo: 'fora-do-plano', liberaEm: null, titulo }
    const liberaEm = somarDias(primeira, -cfg.diasAntes)
    return { bloqueado: liberaEm > hojeBrt(), motivo: 'data', liberaEm, titulo }
  } catch {
    return { bloqueado: false, motivo: 'desligado', liberaEm: null }
  }
}

/** Atalho para os gates do leitor/download. */
export async function docBloqueadoNoCronograma(svc: SupabaseClient, tenantId: string, alunoId: string, docId: string): Promise<boolean> {
  return (await liberacaoDoc(svc, tenantId, alunoId, docId)).bloqueado
}

/** Para o admin: quanto do cronograma está liberado para um aluno + próximas liberações. */
export async function simularLiberacaoAluno(svc: SupabaseClient, tenantId: string, alunoId: string): Promise<{
  total: number; liberados: number; bloqueados: number; motivo: MotivoLiberacao | null
  proximas: Array<{ titulo: string; liberaEm: string }>
}> {
  const mapa = await mapaDocsCronograma(svc, tenantId)
  await esquecer(kPlano(tenantId, alunoId)).catch(() => {})
  let liberados = 0, bloqueados = 0; let motivo: MotivoLiberacao | null = null
  const proximas: Array<{ titulo: string; liberaEm: string }> = []
  for (const docId of Object.keys(mapa.docs)) {
    const l = await liberacaoDoc(svc, tenantId, alunoId, docId)
    if (l.bloqueado) { bloqueados++; if (l.liberaEm) proximas.push({ titulo: l.titulo || docId, liberaEm: l.liberaEm }) } else liberados++
    if (!motivo || motivo === 'data' || motivo === 'concluida') motivo = l.motivo
  }
  proximas.sort((a, b) => a.liberaEm.localeCompare(b.liberaEm))
  return { total: Object.keys(mapa.docs).length, liberados, bloqueados, motivo, proximas: proximas.slice(0, 8) }
}
