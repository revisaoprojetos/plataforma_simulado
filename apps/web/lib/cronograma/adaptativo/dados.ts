import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cfg, DataISO, Plano } from './engine'
import { gerarPlano, dISO, semInicio } from './engine'
import { type Estado, type ProgMeta } from './estado'
import { carregarConteudo, carregarConteudoBanco, lpAutomaticoTodas } from './conteudo-banco'
import type { Conteudo } from './conteudo'
import { type ItemLP } from './motor28'
import { VERSAO_MOTOR, type Prog30 } from './motor30'
import { planoUsaMotorAtual } from './engine'
import { CATALOGO_HTML, nomeDisciplina } from './catalogo-html'
import { construirSnapshot, type AdaptativoSnapshot } from './snapshot'
import { fixarCronograma, temFixado, desfixarEmissoes, promoverProximoFixado } from '@/lib/cronograma/fixar'
import { lerParamsMotor } from './config-metas'
import { lerRegrasMotor } from './config-regras'
import { hashRegras } from './regras'
import { catalogoIdDoTenant, lerPaginasReais } from './catalogo-override-db'
import { recursoAusente, marcarAusente, marcarSeAusente } from '@/lib/db/recurso-ausente'
import { espelharEmSegundoPlano, lerDetalhesMetas, gravarDetalhesMetas } from './plano-metas'
import { sanearDetalhes, dataConclusao, certValido } from './meta-ids'
import { diagnosticarInsuficiencia, ehInsuficiencia, maxSemanasEfetivo, ErroPlanoInviavel } from './diagnostico-insuficiencia'
import { registrarGeracao, registrarEventoMeta, registrarSync, type OrigemGeracao } from './log-geracao'
import { revisoesAntesDoEstudo, aplicarAjustes } from './revisoes-coerentes'
import type { Grade } from './grade-diff'
import { planejarProgresso, emParaCliente, type ProgEnviado, type MetaAtual } from './progresso-regras'
import { garantirAS, chavesAtuais } from './remap-as-server'
import { camposAssinatura, idOrfao, assinaturaDoCfg, type AssinaturaAS } from './remap-as'
import { aulaKeyDoMetaId } from './progresso-por-chave'
import { curarProgressoPorChave } from './progresso-por-chave-server'
import { titulosDeOrfas } from './relink-documento-server'
import type { ConteudoBanco } from './conteudo-banco'

// Camada server do Cronograma Adaptativo. Backend-first: a página chama `carregarAdaptativo`
// e recebe o snapshot pronto. Mutações via estas funções (expostas por rotas /api, pois
// server actions quebram em domínio custom — landmine conhecido).
//
// Conteúdo (AS/WLP): hoje vem do SEED (conteúdo real do Revisão, 269 aulas). Quando houver
// cadastro de catálogo no admin, trocar `conteudoSeed()` pelo loader de banco por tenant.

const T_PLANO = 'simulado_cronograma_adaptativo_plano'
const T_META = 'simulado_cronograma_adaptativo_meta'

export interface MetaRow {
  meta_id: string
  estado: 'done' | 'missed' | null
  parcial_v: string | null
  parcial_em: string | null
  grau: number | null
  estrelas: number | null
  res: number | null
  err: number | null
  tempo_seg: number
  modo: string | null
  nota: string | null
  /** data REAL de conclusão e acertos (migração 20261110020000; ausentes em bancos sem a migração). */
  concluido_em?: string | null
  cert?: number | null
  /** chave estável da aula (migração 20261129000000; ausente em bancos sem a migração) — o progresso segue o DOCUMENTO. */
  aula_key?: string | null
  atualizado_em?: string | null
}
export interface PlanoRow {
  id: string
  estudante_id?: string
  titulo: string | null
  cfg: Cfg
  plano: Plano
  fim: number
  revs: Record<number, Array<[string, DataISO]>>
  pausa: { desde: DataISO } | null
  exemplo: boolean
  /** usado como lock otimista do remapeamento por chave (remap-as-server.ts) */
  atualizado_em?: string
}

/** Monta o Estado do motor a partir das linhas do banco. */
function montarEstado(plano: PlanoRow, metas: MetaRow[]): Estado {
  const prog: Record<string, ProgMeta> = {}
  const notas: Estado['notas'] = {}
  for (const m of metas) {
    const p: ProgMeta = {}
    if (m.estado) p.s = m.estado
    if (m.tempo_seg) p.t = m.tempo_seg
    if (m.parcial_v) p.parou = { v: m.parcial_v, em: (m.parcial_em || '') as DataISO }
    if (m.modo) p.modo = m.modo
    if (Object.keys(p).length) prog[m.meta_id] = p
    const n: { grau?: number; res?: number; err?: number; diff?: number } = {}
    if (m.grau != null) n.grau = m.grau
    if (m.res != null) n.res = m.res
    if (m.err != null) n.err = m.err
    if (m.estrelas != null) n.diff = m.estrelas
    if (Object.keys(n).length) notas[m.meta_id] = n
  }
  return {
    v: 2, cfg: plano.cfg, plano: plano.plano || {}, fim: plano.fim || 1,
    prog, notas, revs: plano.revs || {}, pausa: plano.pausa || null, exemplo: !!plano.exemplo,
  }
}

const COLS_PLANO = 'id,estudante_id,titulo,cfg,plano,fim,revs,pausa,exemplo,atualizado_em'
// Lê UM plano do aluno. Com planoId → aquele plano (validado por tenant+estudante).
// Sem planoId → o FIXADO (foco); se não houver fixado, cai no mais recente não-arquivado.
async function lerPlanoRow(svc: SupabaseClient, tenantId: string, estId: string, planoId?: string | null): Promise<PlanoRow | null> {
  if (planoId) {
    const { data } = await svc.from(T_PLANO).select(COLS_PLANO)
      .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('id', planoId).maybeSingle()
    return (data as unknown as PlanoRow) || null
  }
  const { data: fx } = await svc.from(T_PLANO).select(COLS_PLANO)
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('arquivada', false).eq('fixado', true).maybeSingle()
  if (fx) return fx as unknown as PlanoRow
  const { data: rec } = await svc.from(T_PLANO).select(COLS_PLANO)
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('arquivada', false)
    .order('criado_em', { ascending: false }).limit(1).maybeSingle()
  return (rec as unknown as PlanoRow) || null
}
async function lerMetas(svc: SupabaseClient, tenantId: string, planoId: string): Promise<MetaRow[]> {
  const COLS = 'meta_id,estado,parcial_v,parcial_em,grau,estrelas,res,err,tempo_seg,modo,nota,atualizado_em'
  // Colunas opcionais de migrações pendentes (aula_key: 20261129000000; concluido_em/cert: 20261110020000): a ausência é memorizada
  // 10 min (recursoAusente) — assim NÃO se tenta a query com a coluna a cada request (cada tentativa = 1 ERROR no Postgres).
  const temCert = !recursoAusente('col:meta.cert'), temAula = !recursoAusente('col:meta.aula_key')
  if (temCert) {
    const cols = COLS + ',concluido_em,cert' + (temAula ? ',aula_key' : '')
    const r0 = await svc.from(T_META).select(cols).eq('tenant_id', tenantId).eq('plano_id', planoId)
    if (!r0.error) return (r0.data as unknown as MetaRow[]) || []
    if (temAula && /aula_key/i.test(r0.error.message)) {
      marcarAusente('col:meta.aula_key')
      const r = await svc.from(T_META).select(COLS + ',concluido_em,cert').eq('tenant_id', tenantId).eq('plano_id', planoId)
      if (!r.error) return (r.data as unknown as MetaRow[]) || []
      marcarSeAusente('col:meta.cert', r.error.message)
    } else marcarSeAusente('col:meta.cert', r0.error.message)
  }
  // migração 20261110020000 pendente (sem concluido_em/cert): lê como antes
  const { data } = await svc.from(T_META).select(COLS).eq('tenant_id', tenantId).eq('plano_id', planoId)
  return (data as unknown as MetaRow[]) || []
}

/** Chaves estáveis (AS) com que o plano está carimbado; null = sem assinatura (não se grava aula_key). */
function chavesDoPlano(cfg: unknown): string[] | null {
  const a = assinaturaDoCfg(cfg as Record<string, unknown> | null)
  return a && a.chaves.length ? a.chaves : null
}
/** Upsert de linhas de meta tolerante à migração 20261129000000 pendente (coluna aula_key ausente → regrava sem ela). */
async function upsertMeta(svc: SupabaseClient, rows: Array<Record<string, unknown>>) {
  let r = await svc.from(T_META).upsert(rows, { onConflict: 'plano_id,meta_id' })
  if (r.error && /aula_key/i.test(r.error.message)) r = await svc.from(T_META).upsert(rows.map(({ aula_key: _a, ...x }) => x), { onConflict: 'plano_id,meta_id' })
  return r
}

// ── Cronograma Adaptativo 2.8: o que NÃO se move ao recalcular + migração automática ───────────────
/** Data de hoje no calendário do aluno (Brasília/Fortaleza, UTC−3 sem horário de verão). */
export function hojeCal(): DataISO { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date()) }

/**
 * Metas que ficam FIXAS num recálculo a partir de `ancora`: concluídas, de dias anteriores à âncora
 * (histórico/atrasos — "organizar atrasos" é ação própria) e qualquer meta com progresso registrado
 * (tempo, ponto de parada, anotação, dificuldade, questões). Garante que conclusões, tempo e anotações
 * nunca "somem" do plano (§8 invariantes).
 */
export function fixosPreservados(plano: Plano, metas: MetaRow[], ancora: DataISO | null): Plano {
  const comDado = new Set(metas.filter((m) => m.estado === 'done' || (m.tempo_seg || 0) > 0 || m.parcial_v || m.nota || m.grau != null || m.res != null || m.estrelas != null).map((m) => m.meta_id))
  const out: Plano = {}
  for (const [id, v] of Object.entries(plano || {})) {
    if (!Array.isArray(v)) continue
    if (comDado.has(id) || (ancora && v[0] < ancora)) out[id] = v
  }
  return out
}

/** Anotações por meta (grau/res/err) p/ a inteligência de desempenho do motor (ctx.notas). */
function notasDeMetas(metas: MetaRow[]): Record<string, { grau?: number; res?: number; err?: number; cert?: number }> {
  const out: Record<string, { grau?: number; res?: number; err?: number; cert?: number }> = {}
  for (const m of metas) {
    if (m.grau == null && m.res == null && m.err == null && m.cert == null) continue
    out[m.meta_id] = { ...(m.grau != null ? { grau: m.grau } : {}), ...(m.res != null ? { res: m.res } : {}), ...(m.err != null ? { err: m.err } : {}), ...(m.cert != null ? { cert: m.cert } : {}) }
  }
  return out
}

/** Detalhes que valem para o plano novo: os anteriores das metas que continuam na grade + os recém-gerados (estes vencem). */
function mesclarDetalhes(antigos: Record<string, unknown>, novos: Record<string, unknown> | undefined, plano: Plano): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [id, d] of Object.entries(antigos || {})) if (id in plano) out[id] = d
  for (const [id, d] of Object.entries(novos || {})) if (id in plano) out[id] = d
  return out
}

/** progresso das metas p/ o motor (estado, data REAL de conclusão `em`, tempo, ponto de parada). Sem a data real (planos/bancos antigos) o motor usa a planejada. */
function progDeMetas(metas: MetaRow[]): Record<string, Prog30> {
  const out: Record<string, Prog30> = {}
  for (const m of metas) out[m.meta_id] = { ...(m.estado === 'done' ? { s: 'done', ...(m.concluido_em ? { em: m.concluido_em.slice(0, 10) } : {}) } : {}), t: m.tempo_seg || 0, parou: m.parcial_v ? { v: m.parcial_v } : null }
  return out
}

const ehLpSemanal = (id: string) => /^lp:\d+:\d+$/.test(id)
type CfgPlano = Cfg & { motor?: string; catalogo?: string; maisPDFull?: boolean; lpIgnorar?: string[]; lpLegado?: Record<string, ItemLP>; ultimosTemas?: Record<string, number> }

/** Seleção de disciplinas do aluno com os nomes do cronograma ("Eleitoral" → "Direito Eleitoral"), sem duplicar. */
function normalizarDiscs(discs: unknown): string[] {
  const out: string[] = []
  for (const d of Array.isArray(discs) ? discs : []) { const n = typeof d === 'string' ? nomeDisciplina(d) : ''; if (n && !out.includes(n)) out.push(n) }
  return out
}
function normalizarUltimos(u: unknown): Record<string, number> | undefined {
  if (!u || typeof u !== 'object') return undefined
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(u as Record<string, number>)) { const n = nomeDisciplina(k); if (!(n in out) || v > out[n]) out[n] = v }
  return out
}
/** Último nº de artigo citado numa orientação de leitura ("… — Art. 6º, XXIV ao art. 7º" → 7). */
function ultimoArtigo(texto: string): number | null {
  const parte = String(texto || '').split(' — ').slice(1).join(' — ') || String(texto || '')
  let n: number | null = null
  for (const m of parte.matchAll(/\barts?\.?\s*(\d+)/gi)) n = Number(m[1])
  return n
}

/** Campos do cfg que pertencem ao SERVIDOR (assinatura do AS por chave de documento + metas órfãs): o iframe não os recebe nem os dita. */
const CAMPOS_SERVIDOR = ['chavesAS', 'discsAS', 'sigAS', 'orfas', 'regrasHash'] as const
function semCamposServidor<T extends object>(cfg: T): T {
  const out: Record<string, unknown> = { ...(cfg as Record<string, unknown>) }
  for (const k of [...CAMPOS_SERVIDOR, 'remapEm']) delete out[k]
  return out as T
}
/** cfg do cliente + campos do servidor vindos do plano gravado (ou, plano novo, a assinatura do AS atual). */
function comCamposServidor<T extends object>(cfgCli: T, doPlano: object | null | undefined, assinatura?: AssinaturaAS | null): T {
  const out = semCamposServidor(cfgCli) as Record<string, unknown>
  const src = (doPlano ?? {}) as Record<string, unknown>
  for (const k of CAMPOS_SERVIDOR) if (src[k] !== undefined) out[k] = src[k]
  if (out.chavesAS === undefined && assinatura && assinatura.chaves.length) Object.assign(out, camposAssinatura(assinatura))
  return out as T
}

/** Carimba cfg com o motor/catálogo atuais e disciplinas canônicas (planos gerados agora já estão corretos). */
function carimbar(cfg: CfgPlano, anterior?: CfgPlano | null, catalogoId: string = CATALOGO_HTML.id, motor: string = VERSAO_MOTOR): CfgPlano {
  return {
    ...cfg, motor, catalogo: catalogoId, discs: normalizarDiscs(cfg.discs),
    ...(cfg.ultimosTemas ? { ultimosTemas: normalizarUltimos(cfg.ultimosTemas) } : {}),
    ...(!cfg.lpLegado && anterior?.lpLegado ? { lpLegado: anterior.lpLegado } : {}),
    ...(!cfg.lpIgnorar && anterior?.lpIgnorar ? { lpIgnorar: anterior.lpIgnorar } : {}),
  }
}

/**
 * CORREÇÃO dos cronogramas já criados (uma vez por plano e por versão do catálogo, ao carregar):
 * recalcula a partir de HOJE com a lógica e os dados do modelo (motor28.ts + catalogo-html), mantendo fixas
 * as metas de `fixosPreservados` (concluídas, passadas e com tempo/anotação — nada se perde; as linhas de
 * simulado_cronograma_adaptativo_meta continuam com os mesmos ids). Além disso:
 *  · disciplinas com o nome do cronograma ("Direito Administrativo - verificar" → "Direito Administrativo");
 *  · LegProc antigo (lei semanal "lp:s:j" e corte automático "lp:<doc>:<n>") que fica no histórico ganha
 *    descrição própria (cfg.lpLegado), e as metas novas que ele já cobriu contam como lidas (cfg.lpIgnorar):
 *    lei semanal lida → 1ª meta da lei; corte automático → metas até o último artigo lido em sequência;
 *  · semanas de revisão futuras são remontadas.
 * Backup do plano anterior em storage (cronograma/backup-catalogo/<tenant>/<planoId>.json) antes de gravar.
 */
export async function migrarPlano(svc: SupabaseClient, tenantId: string, row0: PlanoRow, conteudoPre?: ConteudoBanco | Promise<ConteudoBanco> | null): Promise<PlanoRow> {
  // REMAPEAMENTO POR CHAVE PRIMEIRO: a grade só é regenerada sobre ids posicionais já alinhados ao AS atual (remap-as-server.ts).
  const g = await garantirAS(svc, tenantId, row0, { conteudo: conteudoPre })
  if (!g.consistente) return g.row // não dá para provar o alinhamento (AS indisponível/remap recusado): NÃO regenera
  const row = g.row
  const cfg = (row.cfg || {}) as CfgPlano
  // id do catálogo EFETIVO (base + versão do overlay do admin): salvar o Catálogo de metas muda o id → o plano migra 1x.
  const catId = await catalogoIdDoTenant(svc, tenantId)
  if (row.exemplo || cfg.catalogo === catId || !row.plano || !Object.keys(row.plano).length) return row
  const t0Mig = Date.now()
  const logMig = (ok: boolean, erro: string | null, cfgNovo?: CfgPlano, nMetas?: number, fim?: number) =>
    registrarGeracao(svc, { tenantId, estudanteId: row.estudante_id ?? '', planoId: row.id, acao: 'migrar', origem: 'migracao', motor: (cfgNovo ?? cfg).motor ?? null, catalogo: (cfgNovo ?? cfg).catalogo ?? catId, ok, erro, ms: Date.now() - t0Mig, nMetas, fim })
  try {
    const banco = await carregarConteudoBanco(svc, tenantId)
    const metas = await lerMetas(svc, tenantId, row.id)
    const hoje = hojeCal()
    const fixos = fixosPreservados(row.plano, metas, hoje)
    const feitas = new Set(metas.filter((m) => m.estado === 'done').map((m) => m.meta_id))
    const lpAtual = new Map((banco.LP || []).map((x) => [x.id, x]))
    const hex = (doc: string) => doc.replace(/-/g, '').slice(0, 12)
    // LegProc antigo sem conclusão nem registro (só atrasado) sai: o trecho volta pelas metas novas da lei
    const comDado = new Set(Object.keys(fixosPreservados(row.plano, metas, null)))
    for (const id of Object.keys(fixos)) if (id.startsWith('lp:') && !lpAtual.has(id) && !comDado.has(id)) delete fixos[id]
    const novasDoDoc = (doc: string) => (banco.LP || []).filter((x) => x.doc === doc)

    // LegProc antigo: descrição p/ o histórico + equivalência com as metas novas
    const antigos = Object.keys(fixos).filter((id) => id.startsWith('lp:') && !lpAtual.has(id))
    const precisaAuto = antigos.some((id) => !ehLpSemanal(id)) || (cfg.lpIgnorar || []).length > 0
    const auto = precisaAuto && banco.lpDocs?.length ? await lpAutomaticoTodas(svc, tenantId, banco.lpDocs) : []
    const autoMap = new Map(auto.map((x) => [x.id, x]))
    const discDoDoc = new Map((banco.lpDocs || []).map((d) => [d.id, nomeDisciplina(d.disc)]))
    const lpLegado: Record<string, ItemLP> = { ...(cfg.lpLegado || {}) }
    const ignorar = new Set((cfg.lpIgnorar || []).filter((id) => lpAtual.has(id)))
    for (const id of antigos) {
      if (ehLpSemanal(id)) {
        const [, s, j] = id.split(':'), doc = banco.WLPdoc?.[+s]?.[+j] ?? null
        lpLegado[id] ||= { id, disc: (doc && discDoDoc.get(doc)) || '', lei: doc || id, texto: banco.WLP?.[+s]?.[+j] || 'LegProc', doc }
        if (doc && feitas.has(id)) { const p = novasDoDoc(doc)[0]; if (p) ignorar.add(p.id) }
      } else {
        // corte automático antigo OU meta do catálogo-base desativada no admin (Catálogo de metas) que já tem histórico
        const it = autoMap.get(id) ?? (banco.base?.LP ?? []).find((x) => x.id === id)
        if (it) lpLegado[id] ||= { ...it, disc: nomeDisciplina(it.disc) }
      }
    }
    // corte automático: metas lidas em sequência desde o início da lei → até qual artigo
    for (const d of banco.lpDocs || []) {
      const meus = auto.filter((x) => x.doc === d.id).sort((a, b) => +a.id.split(':')[2] - +b.id.split(':')[2])
      let ate: number | null = null
      for (const x of meus) { if (!feitas.has(x.id)) break; ate = ultimoArtigo(x.texto) ?? ate }
      if (ate != null) for (const n of novasDoDoc(d.id)) { const u = ultimoArtigo(n.texto); if (u != null && u <= ate) ignorar.add(n.id) }
    }
    // equivalências da migração anterior ("1ª meta da lei lida": lp:<doc>:1)
    for (const id of cfg.lpIgnorar || []) {
      if (lpAtual.has(id)) continue
      const m = /^lp:([0-9a-f]{12}):1$/.exec(id); if (!m) continue
      const doc = (banco.lpDocs || []).find((x) => hex(x.id) === m[1]); const p = doc && novasDoDoc(doc.id)[0]
      if (p) ignorar.add(p.id)
    }

    const detalhesAtuais = await lerDetalhesMetas(svc, row.id)
    const legado = !planoUsaMotorAtual(cfg.motor) // plano gravado com o motor 2.8.1: migra pelo MESMO motor (planos existentes não mudam de comportamento)
    // Flag tema.cronograma_paginas_reais (opt-in): o total de páginas das aulas pode ter MUDADO → páginas já lidas nunca passam do novo total
    // (metas concluídas/parciais ficam em fixos/progresso; aqui só o contador por aula). Flag desligada = cfg intacto.
    let cfgBase = cfg as CfgPlano
    if ((await lerPaginasReais(svc, tenantId)).ativo && cfgBase.paginasLidas) {
      const lidas = cfgBase.paginasLidas as unknown as Record<string, number>
      cfgBase = { ...cfgBase, paginasLidas: Object.fromEntries(Object.entries(lidas).map(([k, n]) => [k, Math.min(Number(n) || 0, Number(banco.AS[+k]?.[3]) || Number(n) || 0)])) as unknown as CfgPlano['paginasLidas'] }
    }
    const regras = await lerRegrasMotor(svc, tenantId) // regras do motor como dados (padrão = comportamento 3.2.0)
    const cfg2 = { ...carimbar({ ...cfgBase, maisPDFull: cfg.maisPDFull ?? true, lpLegado, lpIgnorar: [...ignorar] }, undefined, catId, legado ? (cfg.motor || '2.8.1') : (cfg.motor || VERSAO_MOTOR)), ...(legado ? {} : { regrasHash: hashRegras(regras) }) } as CfgPlano
    // manterMotor: a correção automática do catálogo não promove o plano à regra nova (rev. 23 só vale ao recalcular/gerar de novo)
    const r = gerarPlano(cfg2, banco.AS, banco.WLP, fixos, hoje, banco.LP, { legado, manterMotor: true, ordem: banco.ordem, feitas, usados: metas.map((m) => m.meta_id), regras, params: await lerParamsMotor(svc, tenantId), notas: notasDeMetas(metas), prog: progDeMetas(metas), hoje, planoAtual: row.plano as Plano, detalhes: detalhesAtuais })
    const revs = Object.fromEntries(Object.entries(row.revs || {}).filter(([k]) => semInicio(cfg2.start, +k) <= hoje))
    try {
      const corpo = new Blob([JSON.stringify({ planoId: row.id, em: new Date().toISOString(), cfg: row.cfg, plano: row.plano, fim: row.fim, revs: row.revs })], { type: 'application/json' })
      await svc.storage.from('pdfs').upload(`cronograma/backup-catalogo/${tenantId}/${row.id}.json`, corpo, { upsert: false, contentType: 'application/json' })
    } catch { /* backup best-effort (já existe = migrado antes) */ }
    const { error } = await svc.from(T_PLANO)
      .update({ cfg: cfg2 as unknown as Record<string, unknown>, plano: r.plano as unknown as Record<string, unknown>, fim: r.fim, revs, atualizado_em: new Date().toISOString() })
      .eq('id', row.id).or(`cfg->>catalogo.is.null,cfg->>catalogo.neq.${catId}`) // concorrência: só uma migração grava
    if (error) { logMig(false, error.message); return row }
    if (!legado) await gravarDetalhesMetas(svc, row.id, mesclarDetalhes(detalhesAtuais, r.detalhes, r.plano), r.plano) // detalhes das metas geradas (antes do espelho)
    espelharEmSegundoPlano(svc, row.id)
    logMig(true, null, cfg2, Object.keys(r.plano || {}).length, r.fim)
    return { ...row, cfg: cfg2, plano: r.plano, fim: r.fim, revs }
  } catch (e) {
    logMig(false, (e as Error)?.message || 'erro_migracao')
    return row // falha na correção não derruba o cronograma do aluno (segue no plano anterior)
  }
}

/** Conteúdo do motor + descrição das metas antigas de LegProc deste plano. */
function comLegado(c: Conteudo, cfg: Cfg): Conteudo {
  const leg = (cfg as CfgPlano).lpLegado
  return leg && Object.keys(leg).length ? { ...c, LPdesc: leg } : c
}

export interface CargaAdaptativo {
  temPlano: boolean
  planoId: string | null
  titulo: string | null
  snapshot: AdaptativoSnapshot | null
}

/** Carga principal (backend-first): devolve o snapshot pronto ou temPlano=false (primeiro acesso). */
export async function carregarAdaptativo(svc: SupabaseClient, tenantId: string, estId: string, hoje: DataISO = hojeCal()): Promise<CargaAdaptativo> {
  const row0 = await lerPlanoRow(svc, tenantId, estId)
  if (!row0) return { temPlano: false, planoId: null, titulo: null, snapshot: null }
  const row = await migrarPlano(svc, tenantId, row0)
  const metas = await lerMetas(svc, tenantId, row.id)
  const est = montarEstado(row, metas)
  const conteudo = comLegado(await carregarConteudo(svc, tenantId), row.cfg)
  const snapshot = construirSnapshot(est, conteudo, hoje, await lerRegrasMotor(svc, tenantId)) // rótulo 'semana de revisão' pelas regras do tenant
  return { temPlano: true, planoId: row.id, titulo: row.titulo, snapshot }
}

/** Gera (ou recalcula) o plano a partir do cfg e persiste. ancora => redistribui o não-feito a partir dela. */
type OpcGerar = { titulo?: string; ancora?: DataISO | null; novo?: boolean; fixar?: boolean; origem?: OrigemGeracao; atorUserId?: string | null }
type ResGerar = { ok: boolean; planoId?: string; error?: string; fixado?: boolean; jaTinhaFixado?: boolean; _m?: { n: number; fim: number; motor?: string; catalogo?: string } }
/** Registro best-effort (after) de cada geração/recálculo — ver log-geracao.ts. Não altera o resultado nem o comportamento do aluno. */
export async function gerarAdaptativo(svc: SupabaseClient, tenantId: string, estId: string, cfg: Cfg, opc: OpcGerar = {}): Promise<ResGerar> {
  const t0 = Date.now()
  const acao = opc.novo ? 'gerar' : 'recalcular'
  try {
    const r = await gerarAdaptativoBase(svc, tenantId, estId, cfg, opc)
    registrarGeracao(svc, { tenantId, estudanteId: estId, planoId: r.planoId ?? null, acao: r.ok && r.fixado !== undefined ? 'gerar' : acao, origem: opc.origem ?? 'aluno', atorUserId: opc.atorUserId ?? null,
      motor: r._m?.motor ?? (cfg as CfgPlano).motor ?? null, catalogo: r._m?.catalogo ?? null, ok: r.ok, erro: r.ok ? null : r.error ?? 'erro', ms: Date.now() - t0, nMetas: r._m?.n ?? null, fim: r._m?.fim ?? null })
    if (r._m) { const { _m: _x, ...limpo } = r; return limpo }
    return r
  } catch (e) {
    registrarGeracao(svc, { tenantId, estudanteId: estId, acao, origem: opc.origem ?? 'aluno', atorUserId: opc.atorUserId ?? null, ok: false, erro: e instanceof ErroPlanoInviavel ? `plano_inviavel:${e.causa}: ${e.message}` : (e as Error)?.message || 'erro', ms: Date.now() - t0 })
    throw e
  }
}
async function gerarAdaptativoBase(
  svc: SupabaseClient, tenantId: string, estId: string,
  cfg: Cfg, opc: OpcGerar,
): Promise<ResGerar> {
  const conteudo = await carregarConteudoBanco(svc, tenantId) // superset de carregarConteudo (+ chaves estáveis p/ a assinatura do plano)
  // `novo` => cria OUTRO cronograma (e fixa). Senão => recalcula o plano em FOCO (fixado).
  const alvo0 = opc.novo ? null : await lerPlanoRow(svc, tenantId, estId)
  // ids do plano em foco alinhados ao AS atual ANTES de usar fixos/progresso posicionais
  const ga = alvo0 ? await garantirAS(svc, tenantId, alvo0, { conteudo }) : null
  if (ga && !ga.consistente) return { ok: false, error: 'as_inconsistente' }
  const alvo = ga ? ga.row : null
  const sigCli = typeof (cfg as { sigAS?: unknown }).sigAS === 'string' ? ((cfg as unknown) as { sigAS: string }).sigAS : null
  if (alvo && sigCli && (alvo.cfg as { sigAS?: string }).sigAS && sigCli !== (alvo.cfg as { sigAS?: string }).sigAS) return { ok: false, error: 'plano_divergente' } // iframe em outro referencial de aulas
  // fixos = metas concluídas (não se movem), lidas do plano alvo se existir
  // fixos = concluídas + passadas + com progresso (tempo/notas/parada) — nada estudado se perde (2.8 §8)
  let fixos: Record<string, [DataISO, number]> = {}
  const metasAlvo = alvo ? await lerMetas(svc, tenantId, alvo.id) : []
  if (alvo && opc.ancora) fixos = fixosPreservados(alvo.plano || {}, metasAlvo, opc.ancora)
  cfg = carimbar(cfg as CfgPlano, alvo?.cfg as CfgPlano | undefined, await catalogoIdDoTenant(svc, tenantId))
  { const at = await chavesAtuais(svc, tenantId, conteudo); cfg = comCamposServidor(cfg, alvo?.cfg, at.vazio ? null : at) as Cfg } // assinatura do AS com que esta grade nasce
  const regras = await lerRegrasMotor(svc, tenantId) // regras do motor como dados; o carimbo é só informativo (plano sem hash = regras padrão)
  cfg = { ...cfg, regrasHash: hashRegras(regras) } as Cfg
  const detalhesAtuais = alvo ? await lerDetalhesMetas(svc, alvo.id) : {}
  const paramsMotor = await lerParamsMotor(svc, tenantId)
  let r: ReturnType<typeof gerarPlano>
  try {
    r = gerarPlano(cfg, conteudo.AS, conteudo.WLP, fixos, opc.ancora || null, conteudo.LP, {
      detalhes: detalhesAtuais, regras,
      ordem: conteudo.ordem, feitas: metasAlvo.filter((m) => m.estado === 'done').map((m) => m.meta_id), usados: metasAlvo.map((m) => m.meta_id),
      params: paramsMotor, notas: notasDeMetas(metasAlvo), prog: progDeMetas(metasAlvo), hoje: opc.ancora || hojeCal(), planoAtual: (alvo?.plano || {}) as Plano,
    })
  } catch (e) {
    // Só COMUNICAÇÃO: explica a causa provável do ErroInsuficiencia (estimativa pura); o motor não é tocado e nada é gravado.
    if (!ehInsuficiencia(e)) throw e
    const d = diagnosticarInsuficiencia({ cfg: cfg as never, AS: conteudo.AS as never, maxSemanas: maxSemanasEfetivo(paramsMotor, regras), velPadrao: paramsMotor.velPadrao, regras })
    throw new ErroPlanoInviavel(d.causa, d.mensagem, d.detalhes)
  }
  const campos = {
    titulo: opc.titulo ?? alvo?.titulo ?? 'Meu cronograma',
    cfg: cfg as unknown as Record<string, unknown>,
    plano: r.plano as unknown as Record<string, unknown>,
    fim: r.fim, revs: {}, exemplo: false,
    atualizado_em: new Date().toISOString(),
  }
  if (alvo) {
    // Recalcula o plano em foco (preserva id, metas e foco).
    const { error } = await svc.from(T_PLANO).update(campos).eq('id', alvo.id)
    if (error) return { ok: false, error: error.message }
    await gravarDetalhesMetas(svc, alvo.id, mesclarDetalhes(detalhesAtuais, r.detalhes, r.plano), r.plano)
    espelharEmSegundoPlano(svc, alvo.id) // metas em linhas (espelho da grade)
    return { ok: true, planoId: alvo.id, _m: { n: Object.keys(r.plano || {}).length, fim: r.fim, motor: (cfg as CfgPlano).motor, catalogo: (cfg as CfgPlano).catalogo } }
  }
  // Novo plano: o 1º plano do aluno fixa sozinho. Se já existe um plano fixado, o novo NÃO o desfixa
  // (só vira foco se o chamador pedir `fixar:true` — o aluno confirmou 'Deixar este como principal?').
  // `jaFixado` considera os DOIS tipos (adaptativo + emissão Revisão): só 1 plano em foco por aluno.
  const jaFixado = await temFixado(svc, tenantId, estId)
  const fixarNovo = !jaFixado || opc.fixar === true
  if (fixarNovo && jaFixado) {
    await svc.from(T_PLANO).update({ fixado: false }).eq('tenant_id', tenantId).eq('estudante_id', estId).eq('fixado', true)
    await desfixarEmissoes(svc, tenantId, estId)
  }
  const { data, error } = await svc.from(T_PLANO)
    .insert({ tenant_id: tenantId, estudante_id: estId, fixado: fixarNovo, ...campos })
    .select('id').maybeSingle()
  if (error) return { ok: false, error: error.message }
  const novoId = (data as { id?: string } | null)?.id
  if (novoId) await gravarDetalhesMetas(svc, novoId, mesclarDetalhes({}, r.detalhes, r.plano), r.plano)
  espelharEmSegundoPlano(svc, novoId)
  return { ok: true, planoId: novoId, fixado: fixarNovo, jaTinhaFixado: !!jaFixado, _m: { n: Object.keys(r.plano || {}).length, fim: r.fim, motor: (cfg as CfgPlano).motor, catalogo: (cfg as CfgPlano).catalogo } }
}

export interface PlanoResumo {
  id: string
  titulo: string | null
  fixado: boolean
  criado_em: string
  atualizado_em: string
}

/** Lista os cronogramas (não-arquivados) do aluno — fixado primeiro, depois por recência. Paginado (.range). */
export async function listarPlanosAdaptativo(svc: SupabaseClient, tenantId: string, estId: string, opc: { limite?: number; offset?: number } = {}): Promise<PlanoResumo[]> {
  const limite = Math.min(Math.max(opc.limite ?? 50, 1), 100)
  const de = Math.max(opc.offset ?? 0, 0)
  const { data } = await svc.from(T_PLANO).select('id,titulo,fixado,criado_em,atualizado_em')
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('arquivada', false)
    .order('fixado', { ascending: false }).order('criado_em', { ascending: false }).order('id')
    .range(de, de + limite - 1)
  return ((data as unknown as PlanoResumo[]) || [])
}

/** Fixa um plano como foco do aluno (desfixa os demais, dos DOIS tipos, atomicamente — RPC). */
export async function fixarPlanoAdaptativo(svc: SupabaseClient, tenantId: string, estId: string, planoId: string): Promise<{ ok: boolean; error?: string }> {
  const t0 = Date.now()
  const r = await fixarCronograma(svc, tenantId, estId, 'adaptativo', planoId)
  registrarGeracao(svc, { tenantId, estudanteId: estId, planoId, acao: 'fixar', ok: r.ok, erro: r.ok ? null : r.error ?? 'erro', ms: Date.now() - t0 })
  return r
}

/** Arquiva (ou desarquiva) um cronograma. Se arquivar o fixado, promove o mais recente restante. */
export async function arquivarPlanoAdaptativo(svc: SupabaseClient, tenantId: string, estId: string, planoId: string, arquivar = true): Promise<{ ok: boolean; error?: string }> {
  const { data: row } = await svc.from(T_PLANO).select('id,fixado')
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('id', planoId).maybeSingle()
  if (!row) return { ok: false, error: 'nao_encontrado' }
  const eraFixado = !!(row as { fixado?: boolean }).fixado
  const { error } = await svc.from(T_PLANO)
    .update({ arquivada: arquivar, fixado: arquivar ? false : eraFixado, atualizado_em: new Date().toISOString() })
    .eq('id', planoId)
  if (arquivar) registrarGeracao(svc, { tenantId, estudanteId: estId, planoId, acao: 'arquivar', ok: !error, erro: error?.message ?? null })
  if (error) return { ok: false, error: error.message }
  if (arquivar && eraFixado) await promoverProximoFixado(svc, tenantId, estId) // mais recente restante (qualquer tipo)
  return { ok: true }
}

/** APAGA de vez o cronograma (linha + metas/detalhes/progresso por ON DELETE CASCADE). Sem volta. Se era o fixado, promove o mais recente restante. */
export async function apagarPlanoAdaptativo(svc: SupabaseClient, tenantId: string, estId: string, planoId: string): Promise<{ ok: boolean; error?: string; eraFixado?: boolean }> {
  const { data: row } = await svc.from(T_PLANO).select('id,fixado')
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('id', planoId).maybeSingle()
  if (!row) return { ok: false, error: 'nao_encontrado' }
  const eraFixado = !!(row as { fixado?: boolean }).fixado
  const { error } = await svc.from(T_PLANO).delete().eq('tenant_id', tenantId).eq('estudante_id', estId).eq('id', planoId)
  registrarGeracao(svc, { tenantId, estudanteId: estId, planoId, acao: 'apagar', ok: !error, erro: error?.message ?? null })
  if (error) return { ok: false, error: error.message }
  if (eraFixado) await promoverProximoFixado(svc, tenantId, estId)
  return { ok: true, eraFixado }
}

/** Renomeia um cronograma. */
export async function renomearPlanoAdaptativo(svc: SupabaseClient, tenantId: string, estId: string, planoId: string, titulo: string): Promise<{ ok: boolean; error?: string }> {
  const nome = (titulo || '').trim().slice(0, 80) || 'Meu cronograma'
  const { error } = await svc.from(T_PLANO).update({ titulo: nome, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('id', planoId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Patch no progresso/notas de uma meta (concluir/faltou/parcial/grau/estrelas/res·err/modo/nota). */
export async function patchMetaAdaptativo(
  svc: SupabaseClient, tenantId: string, estId: string,
  metaId: string, patch: Partial<Omit<MetaRow, 'meta_id'>>,
): Promise<{ ok: boolean; error?: string }> {
  const row = await lerPlanoRow(svc, tenantId, estId)
  if (!row) return { ok: false, error: 'sem_plano' }
  const payload: Record<string, unknown> = {
    tenant_id: tenantId, estudante_id: estId, plano_id: row.id, meta_id: metaId,
    atualizado_em: new Date().toISOString(), ...patch,
  }
  // concluir pelo botão: carimba a data REAL (hoje) quando o cliente não enviou; desmarcar zera.
  if ('estado' in patch) payload.concluido_em = patch.estado === 'done' ? (dataConclusao((patch as Record<string, unknown>).concluido_em) ?? hojeCal()) : null
  // estado anterior (só quando o estado muda) → evento marcar/desmarcar (best-effort, em after)
  let estadoAntes: string | null | undefined
  if ('estado' in patch) {
    const { data: ant } = await svc.from(T_META).select('estado').eq('tenant_id', tenantId).eq('plano_id', row.id).eq('meta_id', metaId).maybeSingle()
    estadoAntes = (ant as { estado?: string | null } | null)?.estado ?? null
  }
  // já estava concluída e o cliente não mandou data: NÃO recarimba (preserva a data real da 1ª conclusão)
  if (estadoAntes === 'done' && patch.estado === 'done' && dataConclusao((patch as Record<string, unknown>).concluido_em) == null) delete payload.concluido_em
  const chavePatch = aulaKeyDoMetaId(metaId, chavesDoPlano(row.cfg))
  if (chavePatch) payload.aula_key = chavePatch
  let { error } = await upsertMeta(svc, [payload])
  if (error && /concluido_em|\bcert\b/i.test(error.message)) { // migração 20261110020000 pendente: grava sem as colunas novas
    const { concluido_em: _c, cert: _k, ...semNovas } = payload
    ;({ error } = await upsertMeta(svc, [semNovas]))
  }
  if (error) return { ok: false, error: error.message }
  if (estadoAntes !== undefined) registrarEventoMeta(svc, { tenantId, planoId: row.id, estudanteId: estId, metaId, de: estadoAntes, para: (patch.estado as string | null | undefined) ?? null, origem: 'meta_clique' })
  return { ok: true }
}

/** Soma tempo (segundos) ao acumulado da meta (modo foco). Lê-soma-grava. */
export async function somarTempoMeta(svc: SupabaseClient, tenantId: string, estId: string, metaId: string, segAdd: number): Promise<{ ok: boolean; tempoSeg?: number; error?: string }> {
  const row = await lerPlanoRow(svc, tenantId, estId)
  if (!row) return { ok: false, error: 'sem_plano' }
  const { data: cur } = await svc.from(T_META).select('tempo_seg').eq('tenant_id', tenantId).eq('plano_id', row.id).eq('meta_id', metaId).maybeSingle()
  const base = (cur as { tempo_seg?: number } | null)?.tempo_seg || 0
  const novo = Math.max(0, base + Math.round(segAdd))
  const chaveTempo = aulaKeyDoMetaId(metaId, chavesDoPlano(row.cfg))
  const { error } = await upsertMeta(svc, [
    { tenant_id: tenantId, estudante_id: estId, plano_id: row.id, meta_id: metaId, tempo_seg: novo, atualizado_em: new Date().toISOString(), ...(chaveTempo ? { aula_key: chaveTempo } : {}) },
  ])
  if (error) return { ok: false, error: error.message }
  return { ok: true, tempoSeg: novo }
}

/** Pausar / retomar. Ao retomar, redistribui o não-feito a partir de hoje (ancora). */
export async function pausarAdaptativo(svc: SupabaseClient, tenantId: string, estId: string, pausar: boolean, hoje: DataISO = hojeCal()): Promise<{ ok: boolean; error?: string }> {
  const row = await lerPlanoRow(svc, tenantId, estId)
  if (!row) return { ok: false, error: 'sem_plano' }
  if (pausar) {
    const { error } = await svc.from(T_PLANO).update({ pausa: { desde: hoje }, atualizado_em: new Date().toISOString() }).eq('id', row.id)
    registrarGeracao(svc, { tenantId, estudanteId: estId, planoId: row.id, acao: 'pausar', ok: !error, erro: error?.message ?? null })
    return error ? { ok: false, error: error.message } : { ok: true }
  }
  // retomar: recalcula a partir de hoje preservando as metas feitas, limpa pausa
  const g = await gerarAdaptativo(svc, tenantId, estId, row.cfg, { ancora: hoje })
  if (!g.ok) return g
  const { error } = await svc.from(T_PLANO).update({ pausa: null, atualizado_em: new Date().toISOString() }).eq('id', row.id)
  return error ? { ok: false, error: error.message } : { ok: true }
}

// ── Ponte de persistência (iframe porte-fiel) ────────────────────────────────
// O modelo salva/carrega 3 "docs": estado / progresso / notas. A ponte troca o
// destino (localStorage/NUVEM) por estas funções. Formato IDÊNTICO ao modelo.

export interface DocsModelo {
  estado: { cfg: Cfg; plano: Plano; fim: number; revs: Record<number, Array<[string, DataISO]>>; pausa: { desde: DataISO } | null; exemplo: boolean; titulo?: string | null; extras?: unknown[]; detalhes?: Record<string, unknown> } | null
  progresso: { prog: Record<string, ProgMeta>; extras: unknown[] } | null
  notas: { notas: Record<string, { grau?: number; res?: number; err?: number; diff?: number; cert?: number }> } | null
}

/** Lê os 3 docs do modelo a partir das tabelas (ou nulls se não há plano). */
export async function carregarDocs(svc: SupabaseClient, tenantId: string, estId: string, opc: { conteudo?: ConteudoBanco | Promise<ConteudoBanco> | null } = {}): Promise<DocsModelo & { extras: unknown[]; planoId: string | null; sigAS: string | null; indisponiveis: MaterialIndisponivel[] }> {
  const row0 = await lerPlanoRow(svc, tenantId, estId)
  if (!row0) return { estado: null, progresso: null, notas: null, extras: [], planoId: null, sigAS: null, indisponiveis: [] }
  let row = await migrarPlano(svc, tenantId, row0, opc.conteudo) // já remapeia por chave de documento (garantirAS)
  const { data: raw } = await svc.from(T_PLANO).select('extras').eq('id', row.id).maybeSingle()
  const extras = ((raw as { extras?: unknown[] } | null)?.extras) || []
  let metas = await lerMetas(svc, tenantId, row.id)
  // PROGRESSO PRESO AO DOCUMENTO: linhas com aula_key cuja posição mudou acompanham o documento (idempotente; best-effort, com lock e rastreio).
  if (!row.exemplo && metas.some((m) => m.aula_key)) {
    try {
      const cura = await curarProgressoPorChave(svc, tenantId, row, metas, opc.conteudo)
      if (cura.aplicou) { metas = cura.metas; row = { ...row, atualizado_em: cura.atualizadoEm ?? row.atualizado_em } }
    } catch { /* nunca derruba o carregamento */ }
  }
  // INVARIANTE (incidente Welber, 19/11): revisão/questões de uma aula nunca antes do estudo não feito. Cura na carga, com lock otimista e rastreio.
  let planoServido = row.plano
  if (!row.exemplo) {
    try {
      const ajustes = revisoesAntesDoEstudo((row.plano || {}) as unknown as Grade, new Set(metas.filter((m) => m.estado === 'done').map((m) => m.meta_id)))
      if (ajustes.length) {
        const novo = aplicarAjustes((row.plano || {}) as unknown as Grade, ajustes)
        const { data: ok } = await svc.from(T_PLANO).update({ plano: novo as unknown as Record<string, unknown>, atualizado_em: new Date().toISOString() }).eq('id', row.id).eq('atualizado_em', row.atualizado_em).select('id')
        if (ok?.length) {
          planoServido = novo as unknown as typeof row.plano
          registrarGeracao(svc, { tenantId, estudanteId: estId, planoId: row.id, acao: 'migrar', origem: 'migracao', ok: true, erro: `revisoes_coerentes: ${ajustes.length} revisao(oes) antes do estudo recolocadas (${ajustes.slice(0, 6).map((a) => a.id).join(',')})` })
          await svc.from('simulado_audit_logs').insert({ tenant_id: tenantId, ator_tipo: 'sistema', tabela: T_PLANO, entidade: T_PLANO, entidade_id: row.id, operacao: 'RECORRIGIR', dados_anteriores: { estudante_id: estId, plano_id: row.id, motivo: 'revisao agendada antes do estudo (PDFull nao feito)' }, dados_novos: { estudante_id: estId, plano_id: row.id, ajustes }, detalhes: { origem: 'revisoes_coerentes' }, criado_em: new Date().toISOString() })
        }
      }
    } catch { /* cura best-effort: nunca derruba o carregamento */ }
  }
  const detalhes = await lerDetalhesMetas(svc, row.id)
  const prog: Record<string, ProgMeta> = {}
  const notas: Record<string, { grau?: number; res?: number; err?: number; diff?: number; cert?: number }> = {}
  for (const m of metas) {
    const p: ProgMeta = {}
    if (m.estado) p.s = m.estado
    const em = emParaCliente(m) // done legado sem data usa atualizado_em (nunca deixa o cliente sem `em` → sem recarimbo)
    if (em) p.em = em as DataISO
    if (m.tempo_seg) p.t = m.tempo_seg
    if (m.parcial_v) p.parou = { v: m.parcial_v, em: (m.parcial_em || '') as DataISO }
    if (m.modo) p.modo = m.modo
    if (Object.keys(p).length) prog[m.meta_id] = p
    const n: { grau?: number; res?: number; err?: number; diff?: number; cert?: number } = {}
    if (m.grau != null) n.grau = m.grau
    if (m.res != null) n.res = m.res
    if (m.err != null) n.err = m.err
    if (m.cert != null) n.cert = m.cert
    if (m.estrelas != null) n.diff = m.estrelas
    if (Object.keys(n).length) notas[m.meta_id] = n
  }
  return {
    // cfg SEM a assinatura/órfãs (campos do servidor; o iframe só recebe `sigAS` p/ provar que está no mesmo referencial ao salvar)
    estado: { cfg: semCamposServidor(row.cfg), plano: planoServido || {}, fim: row.fim || 1, revs: row.revs || {}, pausa: row.pausa || null, exemplo: !!row.exemplo, titulo: row.titulo ?? null, extras, detalhes },
    progresso: { prog, extras },
    notas: { notas },
    extras,
    planoId: row.id,
    indisponiveis: await materiaisIndisponiveis(svc, tenantId, row, prog),
    sigAS: typeof (row.cfg as { sigAS?: unknown }).sigAS === 'string' ? ((row.cfg as unknown) as { sigAS: string }).sigAS : null,
  }
}

/** Aula do plano cujo material (documento) saiu da Biblioteca (apagado/despublicado/movido) e NÃO tem substituto seguro. A aula NÃO some do cronograma:
 *  o progresso fica guardado (cfg.orfas / linhas 'og:…') e o iframe mostra 'Material indisponível' (sem concluir). Volta sozinha se o documento voltar. */
export interface MaterialIndisponivel {
  chave: string; docId: string | null; titulo: string | null; disciplina: string | null
  metas: Array<{ id: string; tipo: string; data: string | null; horas: number | null; estado: string | null }>
}
async function materiaisIndisponiveis(svc: SupabaseClient, tenantId: string, row: PlanoRow, prog: Record<string, ProgMeta>): Promise<MaterialIndisponivel[]> {
  try {
    const orf = ((row.cfg as unknown as { orfas?: Record<string, { titulo?: string; disc?: string; plano?: Record<string, [string, number]> }> }).orfas) ?? {}
    const chaves = Object.keys(orf)
    if (!chaves.length) return []
    const faltam = chaves.filter((k) => !orf[k].titulo)
    const extra = faltam.length ? await titulosDeOrfas(svc, tenantId, row.id, faltam) : new Map()
    return chaves.map((k) => {
      const o = orf[k], x = extra.get(k)
      const tpls = new Set<string>(Object.keys(o.plano ?? {}))
      for (const id of Object.keys(prog)) { const m = /^og:([^:]+):(.+)$/.exec(id); if (m && safeDecode(m[1]) === k) tpls.add(m[2]) }
      return {
        chave: k, docId: x?.docId ?? (/^d:([0-9a-f-]{36})/i.exec(k)?.[1] ?? null), titulo: o.titulo ?? x?.titulo ?? null, disciplina: o.disc ?? x?.disciplina ?? null,
        metas: [...tpls].map((tpl) => ({ id: idOrfao(k, tpl), tipo: tpl.split(':')[0], data: o.plano?.[tpl]?.[0] ?? null, horas: o.plano?.[tpl]?.[1] ?? null, estado: prog[idOrfao(k, tpl)]?.s ?? null })),
      }
    })
  } catch { return [] }
}
const safeDecode = (s: string): string => { try { return decodeURIComponent(s) } catch { return s } }

const ID_META = /^(pf|pp|fl|qu|lp|rf|rq|jp):[A-Za-z0-9:_-]{1,60}$/
/** Grade { meta_id: [AAAA-MM-DD, horas] }: ids no formato do motor, data ISO, horas numéricas; limite de tamanho. */
export function gradeValida(g: unknown): boolean {
  if (g == null) return true
  if (typeof g !== 'object' || Array.isArray(g)) return false
  const e = Object.entries(g as Record<string, unknown>)
  if (e.length > 30000) return false
  return e.every(([id, v]) => ID_META.test(id) && Array.isArray(v) && typeof v[0] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v[0]) && (v[1] == null || (typeof v[1] === 'number' && Number.isFinite(v[1]) && v[1] >= 0 && v[1] <= 24)))
}

/** Grava um doc do modelo. parte ∈ 'estado'|'progresso'|'notas'. */
export async function sincronizarDoc(svc: SupabaseClient, tenantId: string, estId: string, parte: string, doc: Record<string, unknown>, opts?: { planoId?: string | null; tocadas?: string[] | null; sigAS?: string | null }): Promise<{ ok: boolean; error?: string; recusadas?: Record<string, { motivo: string; liberaEm: string | null }>; ignoradas?: string[]; planoId?: string }> {
  if (parte === 'estado') {
    let cfg = doc.cfg as CfgPlano
    if (!cfg || !cfg.start) return { ok: false, error: 'cfg_invalido' }
    if (!gradeValida(doc.plano)) return { ok: false, error: 'plano_invalido' } // o cliente é a fonte da grade → valida o formato
    // Detalhes por meta (semana especial: pai, origem, material, ordemAlternancia...). undefined = o cliente não enviou → preserva o gravado.
    const bruto = (doc.detalhes ?? doc.detalhesMetas) as unknown
    const detalhesDoc = bruto === undefined ? undefined : sanearDetalhes(bruto)
    if (detalhesDoc === null) return { ok: false, error: 'detalhes_invalidos' }
    // Nome dado na criação (iframe). Vazio => não sobrescreve o título existente num recálculo.
    const tituloDoc = typeof doc.titulo === 'string' ? doc.titulo.trim().slice(0, 80) : ''
    // Estado de EXEMPLO/vazio nunca persiste no servidor: o plano só nasce no 'Gerar/Salvar' (acao 'gerar').
    if (doc.exemplo === true) return { ok: true }
    // O alvo é lido ANTES de gravar: preserva a descrição do LegProc antigo e carimba o catálogo quando o plano
    // veio do motor atual do iframe (um iframe antigo em cache não carimba → a correção roda no próximo acesso).
    const t0Sync = Date.now()
    const alvo0 = await lerPlanoRow(svc, tenantId, estId)
    if (alvo0 && opts?.planoId && opts.planoId !== alvo0.id) return { ok: false, error: 'plano_divergente' } // iframe desatualizado/outro plano: não sobrescreve a grade do plano em foco
    const alvo = alvo0 ? (await garantirAS(svc, tenantId, alvo0)).row : null // ids do plano alinhados ao AS atual (remap por chave)
    // o iframe prova em qual referencial de aulas está (sigAS devolvido no GET): divergiu => a grade dele usa índices antigos → 409 e recarrega
    const sigCli = opts?.sigAS ?? (typeof (doc.cfg as { sigAS?: unknown } | undefined)?.sigAS === 'string' ? (doc.cfg as { sigAS: string }).sigAS : null)
    const sigSrv = (alvo?.cfg as { sigAS?: string } | undefined)?.sigAS
    if (alvo && sigCli && sigSrv && sigCli !== sigSrv) { registrarGeracao(svc, { tenantId, estudanteId: estId, planoId: alvo.id, acao: 'sync', origem: 'iframe', ok: false, erro: 'as_divergente: estado' }); return { ok: false, error: 'plano_divergente' } }
    { const at = alvo ? null : await chavesAtuais(svc, tenantId).catch(() => null); cfg = comCamposServidor(cfg, alvo?.cfg, at && !at.vazio ? at : null) } // assinatura/órfãs são do servidor (o iframe não as dita)
    const catId = await catalogoIdDoTenant(svc, tenantId)
    if (planoUsaMotorAtual(cfg.motor)) cfg = carimbar(cfg, alvo?.cfg as CfgPlano | undefined, catId, cfg.motor)
    else if (cfg.catalogo === catId) cfg = { ...cfg, catalogo: undefined }
    const campos = {
      cfg: cfg as unknown as Record<string, unknown>,
      plano: (doc.plano || {}) as Record<string, unknown>,
      fim: (doc.fim as number) || 1,
      revs: (doc.revs || {}) as Record<string, unknown>,
      pausa: (doc.pausa ?? null) as Record<string, unknown> | null,
      exemplo: !!doc.exemplo,
      atualizado_em: new Date().toISOString(),
    }
    // O iframe edita o plano em FOCO (fixado). Se ainda não há plano, cria já fixado.
    if (alvo) {
      const upd = tituloDoc ? { ...campos, titulo: tituloDoc } : campos
      const { error } = await svc.from(T_PLANO).update(upd).eq('id', alvo.id)
      if (!error) { if (detalhesDoc !== undefined) await gravarDetalhesMetas(svc, alvo.id, detalhesDoc, campos.plano); espelharEmSegundoPlano(svc, alvo.id) }
      registrarSync(svc, { tenantId, estudanteId: estId, planoId: alvo.id, t0: t0Sync, erro: error?.message ?? null, depois: { cfg, plano: campos.plano, fim: campos.fim }, antes: { cfg: alvo.cfg, plano: alvo.plano } })
      return error ? { ok: false, error: error.message } : { ok: true, planoId: alvo.id }
    }
    // Sem plano: só cria se a grade não for vazia (nada de plano vazio por auto-save). Fixa (é o 1º do aluno).
    if (Object.keys((doc.plano || {}) as object).length === 0) return { ok: true }
    await svc.from(T_PLANO).update({ fixado: false }).eq('tenant_id', tenantId).eq('estudante_id', estId).eq('fixado', true)
    const { data: novo, error } = await svc.from(T_PLANO)
      .insert({ tenant_id: tenantId, estudante_id: estId, fixado: true, titulo: tituloDoc || 'Meu cronograma', ...campos })
      .select('id').maybeSingle()
    if (!error) {
      const novoId = (novo as { id?: string } | null)?.id
      if (novoId && detalhesDoc !== undefined) await gravarDetalhesMetas(svc, novoId, detalhesDoc, campos.plano)
      espelharEmSegundoPlano(svc, novoId)
    }
    registrarSync(svc, { tenantId, estudanteId: estId, planoId: (novo as { id?: string } | null)?.id ?? null, t0: t0Sync, erro: error?.message ?? null, depois: { cfg, plano: campos.plano, fim: campos.fim }, antes: null })
    return error ? { ok: false, error: error.message } : { ok: true, planoId: (novo as { id?: string } | null)?.id }
  }
  const row0 = await lerPlanoRow(svc, tenantId, estId)
  if (!row0) return { ok: false, error: 'sem_plano' }
  // GUARDA ANTI-MISTURA: o cliente diz de qual plano é o estado que ele edita; diferente do FIXADO → nada é gravado (409).
  if (opts?.planoId && opts.planoId !== row0.id) return { ok: false, error: 'plano_divergente' }
  const gAS = await garantirAS(svc, tenantId, row0)
  const row = gAS.row // ids do plano alinhados ao AS atual (remap por chave)
  // aula_key só quando o plano está provadamente alinhado ao AS (consistente) E tem assinatura: senão a chave gravada seria um chute
  const chavesAK = gAS.consistente ? chavesDoPlano(row.cfg) : null
  // GUARDA DE REFERENCIAL: ids de meta são posicionais; se o iframe está em outro AS (catálogo mudou depois da carga), não grava (409 → recarrega).
  const sigRow = (row.cfg as { sigAS?: string }).sigAS
  if (opts?.sigAS && sigRow && opts.sigAS !== sigRow) { registrarGeracao(svc, { tenantId, estudanteId: estId, planoId: row.id, acao: 'sync', origem: 'iframe', ok: false, erro: `as_divergente: ${parte}` }); return { ok: false, error: 'plano_divergente' } }
  if (parte === 'progresso') {
    const prog = (doc.prog || {}) as Record<string, ProgEnviado>
    const hoje = hojeCal()
    // Estado ATUAL das metas citadas (p/ não regravar o que não mudou e preservar concluido_em).
    const ids = Object.keys(prog)
    const atual: Record<string, MetaAtual | undefined> = {}
    for (let k = 0; k < ids.length; k += 150) {
      const fatia = ids.slice(k, k + 150)
      let r = await svc.from(T_META).select('meta_id,estado,tempo_seg,parcial_v,parcial_em,modo,concluido_em,atualizado_em').eq('tenant_id', tenantId).eq('plano_id', row.id).in('meta_id', fatia)
      if (r.error) r = await svc.from(T_META).select('meta_id,estado,tempo_seg,parcial_v,parcial_em,modo,atualizado_em').eq('tenant_id', tenantId).eq('plano_id', row.id).in('meta_id', fatia) as typeof r // migração 20261110020000 pendente
      if (r.error) return { ok: false, error: r.error.message } // sem o estado atual não dá p/ decidir com segurança
      for (const m of (r.data ?? []) as unknown as Array<MetaAtual & { meta_id: string }>) atual[m.meta_id] = { ...m, concluido_em: m.concluido_em ?? null }
    }
    const plano = planejarProgresso({ prog, atual, tocadas: opts?.tocadas, hoje })
    if (plano.loteRecusado) registrarGeracao(svc, { tenantId, estudanteId: estId, planoId: row.id, acao: 'sync', origem: 'iframe', ok: false, erro: `lote_recusado: ${plano.ignoradas.length} conclusoes novas sem tocadas` })
    else if (plano.ignoradas.length) registrarGeracao(svc, { tenantId, estudanteId: estId, planoId: row.id, acao: 'sync', origem: 'iframe', ok: false, erro: `conclusoes_ignoradas_sem_acao: ${plano.ignoradas.length}` })
    // FONTE ÚNICA (matriz): conclusão NOVA de meta cujo material está bloqueado (data/regra) ou sem acesso é RECUSADA — não grava 'done'
    // (nem conta p/ progresso/XP/sequência). Conclusões já gravadas não são revertidas. Falha de consulta = não recusa.
    let recusadas: Record<string, { motivo: string; liberaEm: string | null }> = {}
    const novas = plano.gravar.filter((l) => l.estado === 'done' && atual[l.meta_id]?.estado !== 'done').map((l) => l.meta_id)
    if (novas.length) {
      try {
        const { metasAdaptativoBloqueadas } = await import('@/lib/cronograma/gate-meta')
        recusadas = await metasAdaptativoBloqueadas(svc, tenantId, estId, novas)
      } catch { recusadas = {} }
    }
    const gravar = plano.gravar.filter((l) => !recusadas[l.meta_id])
    const agora = new Date().toISOString()
    const rows = gravar.map((l) => ({ tenant_id: tenantId, estudante_id: estId, plano_id: row.id, ...l, atualizado_em: agora, ...(chavesAK ? { aula_key: aulaKeyDoMetaId(l.meta_id, chavesAK) } : {}) }))
    if (rows.length) {
      let { error } = await upsertMeta(svc, rows)
      if (error && /concluido_em/i.test(error.message)) ({ error } = await upsertMeta(svc, rows.map(({ concluido_em: _c, ...r }) => r))) // migração 20261110020000 pendente
      if (error) return { ok: false, error: error.message }
    }
    // Metas que o aluno DESMARCOU chegam como objeto vazio ({}) no doc. Sem zerar aqui, a coluna
    // `estado` ('done'/'missed') antiga permanecia no banco e a meta "voltava marcada" ao recarregar.
    // Zera SÓ as colunas de progresso — a MESMA linha guarda as notas (grau/estrelas/res/err), que ficam.
    const limpar = plano.limpar
    for (let k = 0; k < limpar.length; k += 150) {
      const { error } = await svc.from(T_META)
        .update({ estado: null, tempo_seg: 0, parcial_v: null, parcial_em: null, modo: null, concluido_em: null, atualizado_em: agora })
        .eq('tenant_id', tenantId).eq('plano_id', row.id).in('meta_id', limpar.slice(k, k + 150))
      let erro = error
      if (erro && /concluido_em/i.test(erro.message)) ({ error: erro } = await svc.from(T_META)
        .update({ estado: null, tempo_seg: 0, parcial_v: null, parcial_em: null, modo: null, atualizado_em: agora })
        .eq('tenant_id', tenantId).eq('plano_id', row.id).in('meta_id', limpar.slice(k, k + 150)))
      if (erro) return { ok: false, error: erro.message }
    }
    // Auditoria: 1 evento por transição de estado (marcar/desmarcar, inclusive em lote/limpar e conclusão de aula inteira).
    for (const ev of plano.eventos) {
      if (recusadas[ev.metaId]) continue
      registrarEventoMeta(svc, { tenantId, planoId: row.id, estudanteId: estId, metaId: ev.metaId, de: ev.de, para: ev.para, origem: 'sync_iframe' })
    }
    if (Array.isArray(doc.extras)) await svc.from(T_PLANO).update({ extras: doc.extras }).eq('id', row.id)
    return { ok: true, ...(Object.keys(recusadas).length ? { recusadas } : {}), ...(plano.ignoradas.length ? { ignoradas: plano.ignoradas } : {}) }
  }
  if (parte === 'notas') {
    const notas = (doc.notas || {}) as Record<string, { grau?: number; res?: number; err?: number; diff?: number; cert?: number }>
    const rows = Object.entries(notas).filter(([, n]) => n && (n.grau != null || n.res != null || n.err != null || n.diff != null || n.cert != null)).map(([meta_id, n]) => ({
      tenant_id: tenantId, estudante_id: estId, plano_id: row.id, meta_id,
      grau: n.grau ?? null, res: n.res ?? null, err: n.err ?? null, estrelas: n.diff ?? null, cert: certValido(n.cert, n.res ?? null),
      atualizado_em: new Date().toISOString(),
      ...(chavesAK ? { aula_key: aulaKeyDoMetaId(meta_id, chavesAK) } : {}),
    }))
    if (rows.length) {
      let { error } = await upsertMeta(svc, rows)
      if (error && /\bcert\b/i.test(error.message)) ({ error } = await upsertMeta(svc, rows.map(({ cert: _c, ...r }) => r))) // migração 20261110020000 pendente
      if (error) return { ok: false, error: error.message }
    }
    return { ok: true }
  }
  return { ok: false, error: 'parte_desconhecida' }
}

/** Para o DOCX/relatório: devolve Estado + snapshot cru. */
export async function estadoParaRender(svc: SupabaseClient, tenantId: string, estId: string, hoje: DataISO = hojeCal()) {
  const row0 = await lerPlanoRow(svc, tenantId, estId)
  if (!row0) return null
  const row = (await garantirAS(svc, tenantId, row0)).row // ids alinhados ao AS atual antes de renderizar
  const metas = await lerMetas(svc, tenantId, row.id)
  const est = montarEstado(row, metas)
  const conteudo = comLegado(await carregarConteudo(svc, tenantId), row.cfg)
  return { estado: est, snapshot: construirSnapshot(est, conteudo, hoje, await lerRegrasMotor(svc, tenantId)), titulo: row.titulo }
}
