import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { mapaCompatTipos } from '@/lib/cronograma/tipos-conteudo-server'
import { carregarClassificacaoDosDocs } from '@/lib/conteudo/classificacao/docs-server'
import { classificacaoEfetivaDoc, tipoHerdadoDaPasta, traducaoMeta } from '@/lib/conteudo/classificacao/efetiva'
import { CATALOGO_HTML, chaveDisciplina, docDaLei } from '@/lib/cronograma/adaptativo/catalogo-html'
import { carregarTrechosVersaoAtual, contarMetasPorParte, invalidarPartesCache, type ParteRow } from './partes-server'
import { normalizarRotulo, resolverPartes, validarPartes } from './partes'
import { partesDasMetas, type AvisoPartes, type FontePartes, type ParteProposta, type TipoMetaPartes } from './partes-das-metas'

// APLICA "partes a partir das metas": propõe (dry-run, padrão) ou grava (dryRun=false) as partes de cada documento replicando o
// recorte das metas (ver partes-das-metas.ts). Lote paginado POR DOCUMENTO (sem Promise.all; .in() em chunks de 80; fetchAll com
// order único). Idempotente: parte ATIVA com o mesmo nome não é recriada; nunca apaga (arquiva); audita; invalida os caches do tenant.

const T_PARTES = 'simulado_conteudo_partes'
const COLS = 'id, tenant_id, documento_id, nome, ordem, trecho_ini_uid, trecho_fim_uid, rotulo_ini, rotulo_fim, arquivada, criado_por, criado_em, atualizado_em'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHUNK = 80
const MSG_AUSENTE = 'Recurso de partes ainda não disponível (migração pendente).'
export const TIPOS_PARTES_METAS: TipoMetaPartes[] = ['legproc', 'pdflash', 'pdfight']
const col = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
const tabelaAusente = (e?: { code?: string; message?: string } | null) => !!e && /42P01|PGRST205|does not exist|schema cache/i.test(`${e.code ?? ''} ${e.message ?? ''}`)

export interface OpcoesPartesDasMetas {
  tipo?: TipoMetaPartes | null
  documentoId?: string | null
  pastaId?: string | null
  /** true (padrão) = só simula. */
  dryRun?: boolean
  offset?: number
  limite?: number
  /** Arquiva partes ativas que se sobrepõem às propostas (só as que nenhuma meta usa). Padrão: false. */
  substituir?: boolean
}

export type StatusParteProposta = 'nova' | 'ja_existe' | 'divergente' | 'conflito' | 'criada' | 'falhou'
export interface ParteDoc {
  nome: string; ordem: number; rotuloIni: string | null; rotuloFim: string | null
  artigos: number; caracteres: number; status: StatusParteProposta; detalhe?: string
}
export interface DocPartesMetas {
  documentoId: string; titulo: string; disciplina: string; tipo: TipoMetaPartes; fonte: FontePartes
  propostas: number; novas: number; jaExistem: number; divergentes: number; conflitos: number
  criadas: number; arquivadas: number
  avisos: AvisoPartes[]
  /** prévia das partes (limitada a 60 para a resposta ficar pequena). */
  partes: ParteDoc[]
}
export interface RespostaPartesDasMetas {
  ok: true; dryRun: boolean; tipo: TipoMetaPartes | null
  totalDocs: number; offset: number; limite: number; proximoOffset: number | null
  docs: DocPartesMetas[]
  resumo: { docs: number; propostas: number; novas: number; jaExistem: number; divergentes: number; conflitos: number; criadas: number; arquivadas: number; semParte: number }
  /** PDFlash/PDFight: não há divisão por meta. */
  semDivisao?: { mensagem: string }
}
export type FalhaPartesDasMetas = { ok: false; error: string; codigo: 'tabela_ausente' | 'invalido' | 'nao_encontrado' | 'erro' }

interface DocBase { id: string; titulo: string; pastaId: string; disc: string; versaoId: string | null; tipo: string | null }

/** Documentos publicados das pastas de disciplina, com o tipo de material EFETIVO (mesma herança do cronograma). */
async function carregarDocs(svc: SupabaseClient, tenantId: string, pastaRaiz: string | null): Promise<DocBase[]> {
  const [{ data: discRows }, pastas] = await Promise.all([
    svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tenantId),
    fetchAll<{ id: string; pai_id: string | null; disciplina_id: string | null; cronograma_tipo_material: string | null }>(() =>
      svc.from('simulado_pastas').select('id, pai_id, disciplina_id, cronograma_tipo_material')
        .eq('tenant_id', tenantId).eq('folder_area', 'conteudo').order('id', { ascending: true }) as never),
  ])
  const discNome = new Map(((discRows ?? []) as { id: string; nome: string }[]).map((d) => [d.id, d.nome]))
  const filhos = new Map<string, string[]>(), pai = new Map<string, string | null>(), slug = new Map<string, string | null>()
  for (const p of pastas) {
    pai.set(p.id, p.pai_id); slug.set(p.id, p.cronograma_tipo_material)
    if (p.pai_id) filhos.set(p.pai_id, [...(filhos.get(p.pai_id) ?? []), p.id])
  }
  const discDaPasta = new Map<string, string>()
  for (const p of pastas) if (p.disciplina_id) {
    const pilha = [p.id]
    while (pilha.length) { const c = pilha.pop()!; if (!discDaPasta.has(c)) { discDaPasta.set(c, p.disciplina_id); (filhos.get(c) ?? []).forEach((f) => pilha.push(f)) } }
  }
  let alvo = [...discDaPasta.keys()]
  if (pastaRaiz) {
    const sub = new Set<string>(), pilha = [pastaRaiz]
    while (pilha.length) { const c = pilha.pop()!; if (sub.has(c)) continue; sub.add(c); (filhos.get(c) ?? []).forEach((f) => pilha.push(f)) }
    alvo = alvo.filter((id) => sub.has(id))
  }
  if (!alvo.length) return []

  const [compat, classDocs] = await Promise.all([mapaCompatTipos(svc, tenantId), carregarClassificacaoDosDocs(svc, tenantId)])
  const traduzir = traducaoMeta({ compat })
  const cache = new Map<string, string | null>()
  const docs = await fetchAllByIn<{ id: string; titulo: string; pasta_id: string; versao_atual_id: string | null }>(alvo, (chunk) =>
    svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id, versao_atual_id').eq('tenant_id', tenantId)
      .eq('status', 'publicado').eq('deletado', false).in('pasta_id', chunk).order('id', { ascending: true }) as never,
  { chunk: CHUNK, rotulo: 'partes-das-metas:docs' })
  const out: DocBase[] = []
  for (const d of docs) {
    const disc = discNome.get(discDaPasta.get(d.pasta_id) ?? '')
    if (!disc) continue
    const tipo = classificacaoEfetivaDoc({
      docClassId: classDocs.porDoc.get(d.id), slugPorId: classDocs.slugPorId, traduzir,
      pastaSlugHerdado: tipoHerdadoDaPasta(d.pasta_id, { pai, slug }, traduzir, cache), fallbackLegado: 'pdfull',
    }).tipo
    out.push({ id: d.id, titulo: d.titulo, pastaId: d.pasta_id, disc, versaoId: d.versao_atual_id, tipo })
  }
  return out
}

/** Metas do modelo 2.8 que apontam para ESTE documento (mesma regra de conteudo-banco › lpDoModelo). null = disciplina fora do modelo. */
function textosDoModelo(doc: DocBase, legprocDocs: DocBase[], memo: Map<string, string | null>): string[] | null {
  const kd = chaveDisciplina(doc.disc)
  if (!CATALOGO_HTML.legprocs.some((x) => chaveDisciplina(x.disc) === kd)) return null
  const docsDisc = legprocDocs.filter((d) => chaveDisciplina(d.disc) === kd).sort((a, b) => col.compare(a.titulo, b.titulo))
  const out: string[] = []
  for (const k of CATALOGO_HTML.ordemLP) {
    const m = CATALOGO_HTML.legprocs[k]
    if (!m || chaveDisciplina(m.disc) !== kd) continue
    const mk = `${kd}|${m.lei}`
    if (!memo.has(mk)) memo.set(mk, docDaLei(m.lei, docsDisc)?.id ?? null)
    if (memo.get(mk) === doc.id) out.push(m.texto)
  }
  return out
}

function vazioResumo() { return { docs: 0, propostas: 0, novas: 0, jaExistem: 0, divergentes: 0, conflitos: 0, criadas: 0, arquivadas: 0, semParte: 0 } }

async function processarDoc(
  svc: SupabaseClient, tenantId: string, atorId: string | null, doc: DocBase, tipo: TipoMetaPartes,
  legprocDocs: DocBase[], memo: Map<string, string | null>, dryRun: boolean, substituir: boolean,
): Promise<DocPartesMetas | FalhaPartesDasMetas> {
  const ctx = await carregarTrechosVersaoAtual(svc as never, tenantId, doc.id)
  const trechos = ctx?.trechos ?? []
  const r = partesDasMetas({ tipo, trechos, textosModelo: tipo === 'legproc' ? textosDoModelo(doc, legprocDocs, memo) : undefined })
  const base: DocPartesMetas = {
    documentoId: doc.id, titulo: doc.titulo, disciplina: doc.disc, tipo, fonte: r.fonte,
    propostas: r.partes.length, novas: 0, jaExistem: 0, divergentes: 0, conflitos: 0, criadas: 0, arquivadas: 0, avisos: r.avisos, partes: [],
  }
  if (!r.partes.length) return base

  const { data, error } = await (svc as any).from(T_PARTES).select(COLS).eq('tenant_id', tenantId).eq('documento_id', doc.id).limit(2000)
  if (error) return tabelaAusente(error) ? { ok: false, error: MSG_AUSENTE, codigo: 'tabela_ausente' } : { ok: false, error: error.message, codigo: 'erro' }
  const existentes = (data ?? []) as ParteRow[]
  const ativas = existentes.filter((p) => !p.arquivada)
  const resolvidas = resolverPartes(trechos, ativas.map((p) => ({ ...p, iniUid: p.trecho_ini_uid, fimUid: p.trecho_fim_uid, rotuloIni: p.rotulo_ini, rotuloFim: p.rotulo_fim })))
  const ativasIdx = resolvidas.map((x) => ({ p: x.parte as unknown as ParteRow, ind: x.resolucao.indices }))
  const porNome = new Map(ativasIdx.map((x) => [normalizarRotulo(x.p.nome), x]))
  const usos = ativasIdx.length ? await contarMetasPorParte(svc as never, tenantId, ativasIdx.map((x) => x.p.id)).catch(() => new Map<string, number>()) : new Map<string, number>()

  const status: Array<{ p: ParteProposta; st: StatusParteProposta; detalhe?: string }> = []
  const aArquivar = new Map<string, ParteRow>()
  for (const p of r.partes) {
    const igual = porNome.get(normalizarRotulo(p.nome))
    if (igual) {
      const mesma = igual.ind && igual.ind[0] === p.indices[0] && igual.ind[1] === p.indices[1]
      status.push({ p, st: mesma ? 'ja_existe' : 'divergente', detalhe: mesma ? undefined : 'Já existe uma parte ativa com este nome e outra faixa — não foi alterada.' })
      continue
    }
    const sobrepoe = ativasIdx.filter((x) => x.ind && x.ind[0] <= p.indices[1] && p.indices[0] <= x.ind[1])
    if (sobrepoe.length) {
      const emUso = sobrepoe.filter((x) => (usos.get(x.p.id) ?? 0) > 0)
      if (substituir && !emUso.length) { sobrepoe.forEach((x) => aArquivar.set(x.p.id, x.p)); status.push({ p, st: 'nova', detalhe: `Substitui ${sobrepoe.map((x) => `“${x.p.nome}”`).join(', ')} (arquivada).` }); continue }
      status.push({ p, st: 'conflito', detalhe: `Sobrepõe a parte ativa ${sobrepoe.map((x) => `“${x.p.nome}”`).join(', ')}${emUso.length ? ' (em uso por metas)' : ''}.` })
      continue
    }
    status.push({ p, st: 'nova' })
  }

  // validação final do que será ATIVO (existentes que ficam + novas) — defesa extra antes de gravar
  const novas = status.filter((s) => s.st === 'nova')
  const ficam = ativasIdx.filter((x) => x.ind && !aArquivar.has(x.p.id)).map((x) => ({ id: x.p.id, nome: x.p.nome, ini: x.ind![0], fim: x.ind![1] }))
  const v = validarPartes([...ficam, ...novas.map((s) => ({ nome: s.p.nome, ini: s.p.indices[0], fim: s.p.indices[1] }))])
  if (!v.ok) for (const s of novas) { s.st = 'conflito'; s.detalhe = v.erros.map((e) => e.mensagem).join(' ') }

  if (!dryRun) {
    const aprovadas = status.filter((s) => s.st === 'nova')
    if (aprovadas.length) {
      if (aArquivar.size) {
        const ids = [...aArquivar.keys()]
        for (let i = 0; i < ids.length; i += CHUNK) {
          const { error: e } = await (svc as any).from(T_PARTES).update({ arquivada: true }).eq('tenant_id', tenantId).in('id', ids.slice(i, i + CHUNK))
          if (e) return { ok: false, error: e.message, codigo: 'erro' }
        }
        base.arquivadas = ids.length
        await registrarAudit({ operacao: 'UPDATE', entidade: T_PARTES, entidadeId: doc.id, tenantId, atorId, antes: { arquivadas: [...aArquivar.values()].map((x) => x.nome) }, depois: { origem: 'partes_das_metas', arquivada: true } }).catch(() => {})
      }
      const maxOrdem = existentes.reduce((m, p) => Math.max(m, p.ordem ?? -1), -1)
      const linhas = aprovadas.map((s, k) => ({
        tenant_id: tenantId, documento_id: doc.id, nome: s.p.nome, ordem: maxOrdem + 1 + k,
        trecho_ini_uid: s.p.iniUid, trecho_fim_uid: s.p.fimUid, rotulo_ini: s.p.rotuloIni, rotulo_fim: s.p.rotuloFim, criado_por: atorId,
      }))
      const { error: eIns } = await (svc as any).from(T_PARTES).insert(linhas)
      if (!eIns) aprovadas.forEach((s) => { s.st = 'criada' })
      else if (tabelaAusente(eIns)) return { ok: false, error: MSG_AUSENTE, codigo: 'tabela_ausente' }
      else {
        // corrida/duplicata (23505): cai para 1 a 1 só neste documento e informa o que não entrou
        for (let k = 0; k < aprovadas.length; k++) {
          const { error: e1 } = await (svc as any).from(T_PARTES).insert(linhas[k])
          if (e1) { aprovadas[k].st = (e1 as { code?: string }).code === '23505' ? 'ja_existe' : 'falhou'; aprovadas[k].detalhe = e1.message } else aprovadas[k].st = 'criada'
        }
      }
      const criadas = aprovadas.filter((s) => s.st === 'criada')
      if (criadas.length) {
        await registrarAudit({
          operacao: 'INSERT', entidade: T_PARTES, entidadeId: doc.id, tenantId, atorId,
          depois: { origem: 'partes_das_metas', tipo, fonte: r.fonte, documento_id: doc.id, criadas: criadas.map((s) => s.p.nome).slice(0, 200), total: criadas.length },
        }).catch(() => {})
      }
    }
  }

  for (const s of status) {
    if (s.st === 'nova') base.novas++
    else if (s.st === 'criada') { base.criadas++; base.novas++ }
    else if (s.st === 'ja_existe') base.jaExistem++
    else if (s.st === 'divergente') base.divergentes++
    else if (s.st === 'conflito' || s.st === 'falhou') base.conflitos++
  }
  if (dryRun && aArquivar.size) base.arquivadas = aArquivar.size
  base.partes = status.slice(0, 60).map((s) => ({
    nome: s.p.nome, ordem: s.p.ordem, rotuloIni: s.p.rotuloIni, rotuloFim: s.p.rotuloFim,
    artigos: s.p.medida.artigos, caracteres: s.p.medida.caracteres, status: s.st, ...(s.detalhe ? { detalhe: s.detalhe } : {}),
  }))
  return base
}

export async function partesDasMetasEmLote(
  tenantId: string, atorId: string | null, o: OpcoesPartesDasMetas,
): Promise<RespostaPartesDasMetas | FalhaPartesDasMetas> {
  const dryRun = o.dryRun !== false
  const offset = Math.max(0, Math.floor(Number(o.offset) || 0))
  const limite = Math.min(25, Math.max(1, Math.floor(Number(o.limite) || 10)))
  if (o.documentoId && !UUID.test(o.documentoId)) return { ok: false, error: 'Documento inválido.', codigo: 'invalido' }
  if (o.pastaId && !UUID.test(o.pastaId)) return { ok: false, error: 'Pasta inválida.', codigo: 'invalido' }
  if (o.tipo && !TIPOS_PARTES_METAS.includes(o.tipo)) return { ok: false, error: 'Tipo inválido (legproc | pdflash | pdfight).', codigo: 'invalido' }

  const svc = createAdminClient() as unknown as SupabaseClient
  try {
    const todos = await carregarDocs(svc, tenantId, o.pastaId ?? null)
    const legprocDocs = todos.filter((d) => d.tipo === 'legproc')
    let alvo = todos.filter((d) => TIPOS_PARTES_METAS.includes(d.tipo as TipoMetaPartes))
    if (o.documentoId) alvo = alvo.filter((d) => d.id === o.documentoId)
    if (o.tipo) alvo = alvo.filter((d) => d.tipo === o.tipo)
    if (o.documentoId && !alvo.length) return { ok: false, error: 'Documento não encontrado ou não é LegProc/PDFlash/PDFight.', codigo: 'nao_encontrado' }
    alvo.sort((a, b) => a.id.localeCompare(b.id)) // ordem única → paginação estável

    const resumo = vazioResumo()
    const semDivisaoTipos = new Set(alvo.map((d) => d.tipo))
    // PDFlash/PDFight puros: sem divisão por meta → nada a processar (evita ler trechos à toa)
    const pagina = alvo.slice(offset, offset + limite)
    const docs: DocPartesMetas[] = []
    for (const d of pagina) {
      const tipo = d.tipo as TipoMetaPartes
      if (tipo !== 'legproc') { resumo.docs++; resumo.semParte++; continue }
      const r = await processarDoc(svc, tenantId, atorId, d, tipo, legprocDocs, new Map(), dryRun, o.substituir === true)
      if ('ok' in r) return r
      docs.push(r)
      resumo.docs++; resumo.propostas += r.propostas; resumo.novas += r.novas; resumo.jaExistem += r.jaExistem
      resumo.divergentes += r.divergentes; resumo.conflitos += r.conflitos; resumo.criadas += r.criadas; resumo.arquivadas += r.arquivadas
      if (!r.propostas) resumo.semParte++
    }
    if (!dryRun && (resumo.criadas || resumo.arquivadas)) await invalidarPartesCache(tenantId)
    const proximo = offset + limite < alvo.length ? offset + limite : null
    const soSemDivisao = semDivisaoTipos.size > 0 && [...semDivisaoTipos].every((t) => t !== 'legproc')
    return {
      ok: true, dryRun, tipo: o.tipo ?? null, totalDocs: alvo.length, offset, limite, proximoOffset: proximo, docs, resumo,
      ...(semDivisaoTipos.has('pdflash') || semDivisaoTipos.has('pdfight') ? {
        semDivisao: { mensagem: `${soSemDivisao ? 'PDFlash/PDFight' : 'Os documentos PDFlash/PDFight deste conjunto'}: as metas usam o documento inteiro (1 meta por aula) — não há faixa por meta para criar partes.` },
      } : {}),
    }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (tabelaAusente(err)) return { ok: false, error: MSG_AUSENTE, codigo: 'tabela_ausente' }
    console.error('[partes-das-metas] falhou:', e)
    return { ok: false, error: err.message || 'Falha ao processar as partes das metas.', codigo: 'erro' }
  }
}
