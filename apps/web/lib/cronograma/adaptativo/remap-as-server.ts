import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember } from '@/lib/cache/relatorio-cache'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { carregarConteudoBanco, type ConteudoBanco } from './conteudo-banco'
import { chavesUnicas } from './catalogo-override'
import { lerDetalhesMetas, gravarDetalhesMetas, espelharEmSegundoPlano } from './plano-metas'
import { registrarGeracao } from './log-geracao'
import type { PlanoRow } from './dados'
import { assinaturaDoCfg, camposAssinatura, hashAS, docIdDaChave, type AssinaturaAS } from './remap-as'
import { remapearEstadoComRelink } from './relink-documento'
import { resolverRelinks, titulosDeOrfas } from './relink-documento-server'

// Camada SERVER do remapeamento por chave de documento (regras e formato: ver remap-as.ts).
//  · garantirAS(row): chamado ao CARREGAR o plano (GET, migração, sync, geração). Compara a assinatura gravada no plano com o AS atual
//    e, se divergir, remapeia progresso/grade/contadores por chave de documento. Idempotente; plano legado (sem assinatura) só
//    recebe a assinatura atual ('remap_sem_base') — nunca se adivinha um remapeamento retroativo.
//  · documentosEmUsoPorPlanos(tenant): ids de documentos referenciados por planos NÃO arquivados (gate da trava de exclusão).

const T_PLANO = 'simulado_cronograma_adaptativo_plano'
const T_META = 'simulado_cronograma_adaptativo_meta'
/** Remapear só com a certeza razoável de que o AS atual é íntegro: perda > 60% das aulas de uma vez (com ≥ 20 aulas) é tratada como falha de carga. */
const QUEDA_BRUSCA = 0.6
/** Marca de remapeamento em andamento no cfg (cfg.remapEm) — outro request não repete enquanto estiver fresca. */
const TRAVA_MS = 5 * 60 * 1000

export interface AtualAS extends AssinaturaAS { vazio: boolean }

/** AS atual do tenant (chaves + disciplinas). Usa o MESMO cache do GET do cronograma (`crono-conteudo:<tenant>`, 120 s). */
export async function chavesAtuais(svc: SupabaseClient, tenantId: string, pre?: ConteudoBanco | Promise<ConteudoBanco> | null): Promise<AtualAS> {
  const c = await (pre ?? remember<ConteudoBanco>(`crono-conteudo:${tenantId}`, 120, () => carregarConteudoBanco(svc, tenantId)))
  const AS = c.AS ?? []
  return { chaves: c.chaves?.length === AS.length ? c.chaves : chavesUnicas(AS), discs: AS.map((a) => String(a[0] ?? '')), vazio: !!c.vazio }
}

export interface ResGarantir {
  row: PlanoRow
  /** true = os ids do plano estão no MESMO referencial do AS atual (pode regenerar/migrar a grade). false = não deu para provar → não regenerar. */
  consistente: boolean
  remapeou: boolean
}

type LinhaMeta = { meta_id: string } & Record<string, unknown>
const COLS_META = 'tenant_id,estudante_id,plano_id,meta_id,estado,parcial_v,parcial_em,grau,estrelas,res,err,tempo_seg,modo,nota,atualizado_em'

async function lerLinhas(svc: SupabaseClient, tenantId: string, planoId: string): Promise<LinhaMeta[]> {
  const ler = (cols: string) => fetchAll<any>(() => svc.from(T_META).select(cols).eq('tenant_id', tenantId).eq('plano_id', planoId).order('meta_id', { ascending: true }), 1000, 'remap_as:metas')
  try { return await ler(COLS_META + ',concluido_em,cert') } catch { return await ler(COLS_META) } // migração 20261110020000 pendente
}

async function gravarLinhas(svc: SupabaseClient, linhas: LinhaMeta[]): Promise<string | null> {
  for (let k = 0; k < linhas.length; k += 400) {
    const { error } = await svc.from(T_META).upsert(linhas.slice(k, k + 400), { onConflict: 'plano_id,meta_id' })
    if (error) return error.message
  }
  return null
}
async function apagarLinhas(svc: SupabaseClient, tenantId: string, planoId: string, ids: string[]): Promise<string | null> {
  for (let k = 0; k < ids.length; k += 80) {
    const { error } = await svc.from(T_META).delete().eq('tenant_id', tenantId).eq('plano_id', planoId).in('meta_id', ids.slice(k, k + 80))
    if (error) return error.message
  }
  return null
}

function log(svc: SupabaseClient, tenantId: string, row: PlanoRow, ok: boolean, texto: string, n?: number) {
  registrarGeracao(svc, { tenantId, estudanteId: row.estudante_id ?? '', planoId: row.id, acao: 'remap_as', origem: 'migracao', ok, erro: texto, nMetas: n ?? null })
}

/**
 * Garante que os ids posicionais do plano estão alinhados ao AS atual. Nunca lança (falha = devolve a linha como veio, consistente=false).
 * `conteudo` opcional: o conteúdo já carregado pelo chamador (GET) — assim assinatura e AS entregue ao iframe são do MESMO objeto.
 */
export async function garantirAS(svc: SupabaseClient, tenantId: string, row: PlanoRow, opc: { conteudo?: ConteudoBanco | Promise<ConteudoBanco> | null } = {}): Promise<ResGarantir> {
  try { return await garantirASInterno(svc, tenantId, row, opc.conteudo) } catch (e) {
    log(svc, tenantId, row, false, `remap_falhou: ${(e as Error)?.message ?? 'erro'}`)
    return { row, consistente: false, remapeou: false }
  }
}

async function garantirASInterno(svc: SupabaseClient, tenantId: string, row: PlanoRow, pre?: ConteudoBanco | Promise<ConteudoBanco> | null): Promise<ResGarantir> {
  if (row.exemplo) return { row, consistente: true, remapeou: false }
  const cfg = (row.cfg ?? {}) as Record<string, unknown>
  const guardada = assinaturaDoCfg(cfg)
  const atual = await chavesAtuais(svc, tenantId, pre)
  // AS "vazio" (carga falhou ou Biblioteca sem aulas → catálogo do modelo): NÃO é referência confiável
  if (atual.vazio || !atual.chaves.length) return { row, consistente: !guardada, remapeou: false }
  const sigAtual = hashAS(atual.chaves, atual.discs)
  if (guardada && cfg.sigAS === sigAtual) return { row, consistente: true, remapeou: false }

  const agora = new Date().toISOString()
  const trava = typeof cfg.remapEm === 'string' ? Date.parse(cfg.remapEm) : NaN
  if (Number.isFinite(trava) && Date.now() - trava < TRAVA_MS) return { row, consistente: false, remapeou: false } // outro request remapeando
  if (Number.isFinite(trava)) { log(svc, tenantId, row, false, 'remap_travado: marca antiga sem conclusao (revisar backup-remap)'); return { row, consistente: false, remapeou: false } }

  // lock otimista: só quem ainda vê o mesmo atualizado_em consegue gravar
  const travar = async (cfgNovo: Record<string, unknown>, extra: Record<string, unknown> = {}, esperado = row.atualizado_em) => {
    const q = svc.from(T_PLANO).update({ cfg: cfgNovo, atualizado_em: agora, ...extra }).eq('id', row.id)
    const { data, error } = await (esperado ? q.eq('atualizado_em', esperado) : q).select('id')
    return !error && (data?.length ?? 0) > 0
  }

  // ── plano LEGADO (sem assinatura): não dá para provar o AS da geração → grava a atual e segue (sem adivinhar) ──
  if (!guardada) {
    const cfgNovo = { ...cfg, ...camposAssinatura(atual) }
    const ok = await travar(cfgNovo)
    if (!ok) return { row, consistente: true, remapeou: false }
    log(svc, tenantId, row, true, `remap_sem_base: assinatura gravada (${atual.chaves.length} aulas); sem remapeamento retroativo`)
    return { row: { ...row, cfg: cfgNovo as unknown as PlanoRow['cfg'], atualizado_em: agora }, consistente: true, remapeou: false }
  }

  // ── queda brusca: provável falha de carga do conteúdo → não mexe ──
  if (guardada.chaves.length >= 20 && atual.chaves.length < guardada.chaves.length * (1 - QUEDA_BRUSCA)) {
    log(svc, tenantId, row, false, `remap_recusado_queda_brusca: ${guardada.chaves.length} -> ${atual.chaves.length} aulas`)
    return { row, consistente: false, remapeou: false }
  }

  // ── REMAPEAMENTO por chave ──
  const linhas = await lerLinhas(svc, tenantId, row.id)
  const detalhes = await lerDetalhesMetas(svc, row.id)
  // RELINK por nome (documento apagado e RECRIADO com o mesmo título/pasta → mesma aula; só com candidato ÚNICO — ver relink-documento.ts)
  const rl = await resolverRelinks(svc, tenantId, guardada, atual, row.id)
  const r = remapearEstadoComRelink<LinhaMeta>({ cfg, plano: (row.plano || {}) as never, revs: (row.revs || {}) as never, detalhes: detalhes as never, metas: linhas }, guardada, atual, rl.relinks)
  const cfgFinal = { ...r.cfg, ...camposAssinatura(atual) } as Record<string, unknown>
  // aulas que ficaram órfãs: guarda título/disciplina (snapshot) p/ o aluno ver 'Material indisponível — <título>' sem depender do documento
  try {
    const orf = (cfgFinal.orfas && typeof cfgFinal.orfas === 'object' ? cfgFinal.orfas : {}) as Record<string, Record<string, unknown>>
    const sem = Object.keys(orf).filter((k) => !orf[k].titulo)
    if (sem.length) { const tt = await titulosDeOrfas(svc, tenantId, row.id, sem); for (const k of sem) { const t = tt.get(k); if (t?.titulo) orf[k].titulo = t.titulo; if (t?.disciplina) orf[k].disc = t.disciplina } }
  } catch { /* best-effort */ }
  delete cfgFinal.remapEm
  const relinkTxt = rl.relinks.length ? ` relink_doc=${rl.relinks.length}` : ''
  const resumo = `${guardada.chaves.length}->${atual.chaves.length} aulas; movidas=${r.stats.aulasMovidas} orfas=${r.stats.aulasOrfas} novas=${r.stats.aulasNovas}; linhas: movidas=${r.stats.metasMovidas} orfas=${r.stats.metasOrfas} restauradas=${r.stats.metasRestauradas}; grade removida=${r.stats.gradeRemovida}${relinkTxt}`

  // backup completo ANTES de qualquer escrita (best-effort; rollback manual)
  try {
    const corpo = new Blob([JSON.stringify({ planoId: row.id, em: agora, de: guardada, para: atual, cfg: row.cfg, plano: row.plano, fim: row.fim, revs: row.revs, detalhes, metas: linhas })], { type: 'application/json' })
    await svc.storage.from('pdfs').upload(`cronograma/backup-remap/${tenantId}/${row.id}-${Date.now()}.json`, corpo, { upsert: false, contentType: 'application/json' })
  } catch { /* best-effort */ }

  // 1) reivindica o plano (marca remapEm + novo atualizado_em); quem perder a corrida não repete
  if (!(await travar({ ...cfg, remapEm: agora }))) return { row, consistente: false, remapeou: false }

  // 2) linhas de progresso: grava os destinos (upsert) e só então apaga os ids que ficaram sem dono (nunca "apaga e recria")
  const porId = new Map(linhas.map((x) => [x.meta_id, x]))
  const alteradas = r.mudancas.map((m) => ({ de: m.de, para: m.para, linha: porId.get(m.de)! })).filter((x) => x.linha)
  const novasLinhas = alteradas.map((x) => ({ ...x.linha, meta_id: x.para }))
  const destinos = new Set(alteradas.map((x) => x.para))
  const sobraram = alteradas.map((x) => x.de).filter((id) => !destinos.has(id))
  const desfazer = async () => { // devolve as linhas originais e limpa a marca
    await gravarLinhas(svc, alteradas.map((x) => x.linha))
    await apagarLinhas(svc, tenantId, row.id, [...destinos].filter((id) => !porId.has(id)))
    await svc.from(T_PLANO).update({ cfg, atualizado_em: new Date().toISOString() }).eq('id', row.id)
  }
  let erro = await gravarLinhas(svc, novasLinhas)
  if (!erro) erro = await apagarLinhas(svc, tenantId, row.id, sobraram)
  if (erro) { await desfazer(); log(svc, tenantId, row, false, `remap_falhou_linhas: ${erro}`); return { row, consistente: false, remapeou: false } }

  // 3) grava o plano remapeado + assinatura nova (só se ninguém mexeu desde a reivindicação)
  const fimEm = new Date().toISOString()
  const { data: fin, error: errFin } = await svc.from(T_PLANO)
    .update({ cfg: cfgFinal, plano: r.plano, revs: r.revs, atualizado_em: fimEm })
    .eq('id', row.id).eq('atualizado_em', agora).select('id')
  if (errFin || !fin?.length) { await desfazer(); log(svc, tenantId, row, false, `remap_falhou_plano: ${errFin?.message ?? 'concorrencia'}`); return { row, consistente: false, remapeou: false } }
  if (Object.keys(detalhes).length) await gravarDetalhesMetas(svc, row.id, r.detalhes, r.plano)
  espelharEmSegundoPlano(svc, row.id) // grade/cfg mudaram → o espelho relacional (e o arquivamento de órfãos) se refaz
  log(svc, tenantId, row, true, `remap_as: ${resumo}`.slice(0, 500), r.mudancas.length)
  for (const x of rl.relinks) log(svc, tenantId, row, true, `relink_doc: ${docIdDaChave(x.chaveAntiga)} -> ${x.docNovo} | ${x.titulo}`.slice(0, 500), 1) // acao 'remap_as' (CHECK do log); o prefixo 'relink_doc:' identifica
  for (const x of rl.ambiguos) log(svc, tenantId, row, false, `relink_doc_ambiguo: ${x.docAntigo} candidatos=${x.candidatos.join(',')} (nao relinkado)`.slice(0, 500), 0)
  return { row: { ...row, cfg: cfgFinal as unknown as PlanoRow['cfg'], plano: r.plano as PlanoRow['plano'], revs: r.revs as unknown as PlanoRow['revs'], atualizado_em: fimEm }, consistente: true, remapeou: true }
}

// ── gate da trava de exclusão ────────────────────────────────────────────────────────────────────
const TTL_EM_USO = 60 // s

/**
 * Ids de DOCUMENTOS referenciados por planos do Adaptativo NÃO arquivados (arquivada=false, exemplo=false) do tenant.
 *  · plano com assinatura (cfg.chavesAS): os `d:<uuid>` da assinatura (aulas do plano, órfãs inclusas em cfg.orfas);
 *  · plano LEGADO (sem assinatura): só referencia por posição → conservador: conta os documentos do AS ATUAL.
 * Cache curto (60 s); leitura paginada (.range + order id), sem .limit>1000.
 */
export async function documentosEmUsoPorPlanos(svc: SupabaseClient, tenantId: string): Promise<Set<string>> {
  const ids = await remember<string[]>(`crono-adapt:docs-em-uso:${tenantId}`, TTL_EM_USO, async () => (await calcularDocsEmUso(svc, tenantId)).docs)
  return new Set(ids)
}

/** Detalhe p/ diagnóstico (contagens): planos considerados, com/sem assinatura e total de documentos distintos. */
export async function diagnosticoDocsEmUso(svc: SupabaseClient, tenantId: string) {
  const r = await calcularDocsEmUso(svc, tenantId)
  return { planos: r.planos, comAssinatura: r.comAssinatura, legados: r.legados, documentos: r.docs.length }
}

async function calcularDocsEmUso(svc: SupabaseClient, tenantId: string): Promise<{ docs: string[]; planos: number; comAssinatura: number; legados: number }> {
  const linhas = await fetchAll<{ id: string; chaves: unknown; orfas: unknown }>(
    () => svc.from(T_PLANO).select('id, chaves:cfg->chavesAS, orfas:cfg->orfas').eq('tenant_id', tenantId).eq('arquivada', false).eq('exemplo', false).order('id', { ascending: true }),
    300, 'docs-em-uso:planos')
  const docs = new Set<string>()
  let comAssinatura = 0, legados = 0
  for (const l of linhas) {
    if (Array.isArray(l.chaves)) {
      comAssinatura++
      for (const k of l.chaves as unknown[]) { const d = docIdDaChave(typeof k === 'string' ? k : null); if (d) docs.add(d) }
      if (l.orfas && typeof l.orfas === 'object') for (const k of Object.keys(l.orfas as object)) { const d = docIdDaChave(k); if (d) docs.add(d) }
    } else legados++
  }
  if (legados > 0) { // referência só por posição: o que compõe o AS de hoje
    try { const a = await chavesAtuais(svc, tenantId); if (!a.vazio) for (const k of a.chaves) { const d = docIdDaChave(k); if (d) docs.add(d) } } catch { /* sem AS: só o que a assinatura cobre */ }
  }
  return { docs: [...docs], planos: linhas.length, comAssinatura, legados }
}
