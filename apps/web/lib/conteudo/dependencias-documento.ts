import 'server-only'
import type { createAdminClient } from '@/lib/supabase/server'
import { sqlQuery } from '@/lib/data/sql'
import {
  dependenciasVazias, somarDependencia, particionarPorVinculos, mensagemLoteParcial, MSG_NAO_VERIFICADO,
  mensagemEmUso, mensagemPastaEmUso, pastasEsvaziadas,
  type Dependencias, type DocRef, type Bloqueado, type TipoDependencia, type AcaoBloqueada,
} from './dependencias-documento-pura'

export * from './dependencias-documento-pura'

// TRAVA CENTRAL: documento com vínculos (grifos de alunos, metas de cronograma, progresso, itens de produto…)
// NUNCA pode ser excluído/enviado à lixeira — as FKs são ON DELETE CASCADE e o purge de 30 dias apagaria tudo
// (incidente de 17/11/2026: delete de documento bagunçou metas e documentos). Todo caminho que remove/soft-deleta
// documento passa por aqui. Falha FECHADA: se não conseguir verificar, recusa.
//
// Leitura: 1 query agregada por bloco (GROUP BY documento) via SQL direto (`sqlQuery`, KB de egress);
// fallback PostgREST com `count head` por documento (só p/ poucos ids). Nada de .in() gigante nem fetchAll de linhas.

type Svc = ReturnType<typeof createAdminClient>
export type Origem = 'conteudo' | 'leitura'

type Bloco = {
  tipo: TipoDependencia; tabela: string; col: string
  /** conta valores distintos desta coluna em vez de linhas (ex.: metas de plano = planos distintos). */
  distinct?: string
  naoDeletado?: boolean
  tipoRef?: string
}

const BLOCOS_CONTEUDO: Bloco[] = [
  { tipo: 'grifos', tabela: 'simulado_conteudo_grifos_pdf', col: 'documento_id' },
  { tipo: 'grifos', tabela: 'simulado_conteudo_anotacoes', col: 'documento_id' },
  { tipo: 'metas', tabela: 'simulado_cronograma_adaptativo_plano_meta', col: 'documento_id', distinct: 'plano_id' },
  { tipo: 'metas', tabela: 'simulado_cronograma_adaptativo_meta_def', col: 'documento_id' },
  { tipo: 'metas', tabela: 'simulado_cronograma_meta_conteudo', col: 'documento_id' },
  { tipo: 'progresso', tabela: 'simulado_conteudo_leitura_progresso', col: 'documento_id' },
  { tipo: 'produto', tabela: 'simulado_produto_modulo_itens', col: 'ref_id', tipoRef: 'documento_biblioteca', naoDeletado: true },
  { tipo: 'questoes', tabela: 'simulado_conteudo_quiz_questoes', col: 'documento_id' },
  { tipo: 'atualizacoes', tabela: 'simulado_conteudo_atualizacoes', col: 'documento_id', naoDeletado: true },
  { tipo: 'atualizacoes', tabela: 'simulado_conteudo_atualizacao_pedidos', col: 'documento_id' },
  { tipo: 'caderno', tabela: 'simulado_aluno_caderno_itens', col: 'documento_id' },
  { tipo: 'vinculos', tabela: 'simulado_conteudo_vinculos', col: 'documento_id' },
  { tipo: 'vinculos', tabela: 'simulado_conteudo_vinculos_leitor', col: 'documento_id' },
  { tipo: 'jurisclub', tabela: 'jurisclub_edicoes', col: 'documento_id', naoDeletado: true },
  { tipo: 'jurisclub', tabela: 'jurisclub_edicoes', col: 'pdf_doc_id', naoDeletado: true },
  { tipo: 'jurisclub', tabela: 'jurisclub_edicoes', col: 'questoes_doc_id', naoDeletado: true },
]

// Documentos de leitura (simulado_documentos): grifos/anotações dos alunos, progresso, quiz, favoritos.
const BLOCOS_LEITURA: Bloco[] = [
  { tipo: 'grifos', tabela: 'simulado_leitura_anotacoes', col: 'documento_id', naoDeletado: true },
  { tipo: 'grifos', tabela: 'simulado_documento_anotacoes_base', col: 'documento_id', naoDeletado: true },
  { tipo: 'progresso', tabela: 'simulado_leitura_progresso', col: 'documento_id' },
  { tipo: 'respostas', tabela: 'simulado_leitura_quiz_tentativas', col: 'documento_id' },
  { tipo: 'respostas', tabela: 'simulado_leitura_respostas', col: 'documento_id' },
  { tipo: 'questoes', tabela: 'simulado_documento_questoes', col: 'documento_id', naoDeletado: true },
  { tipo: 'questoes', tabela: 'simulado_documento_quiz_questoes', col: 'documento_id', naoDeletado: true },
  { tipo: 'favoritos', tabela: 'simulado_lei_favoritos', col: 'documento_id' },
]

const CHUNK = 80
const MAX_FALLBACK_IDS = 40
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Tabela ausente (migração pendente) = nada vinculado ali; qualquer outro erro = falha fechada.
const tabelaAusente = (m?: string) => /42P01|PGRST205|does not exist|schema cache/i.test(m ?? '')

function sqlDoBloco(b: Bloco): string {
  const conta = b.distinct ? `count(distinct ${b.distinct})` : 'count(*)'
  const extra = `${b.naoDeletado ? ' AND deletado = false' : ''}${b.tipoRef ? ` AND tipo_ref = '${b.tipoRef}'` : ''}`
  return `SELECT ${b.col}::text AS id, ${conta}::int AS n FROM ${b.tabela} WHERE tenant_id = $1 AND ${b.col} = ANY($2::uuid[])${extra} GROUP BY 1`
}

async function contarBloco(svc: Svc, tenantId: string, b: Bloco, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const rows = await sqlQuery<{ id: string; n: number }>(sqlDoBloco(b), [tenantId, ids])
  if (rows) { for (const r of rows) out.set(r.id, Number(r.n)); return out }
  // Fallback PostgREST: head count por documento (poucos ids; senão falha fechada).
  if (ids.length > MAX_FALLBACK_IDS) throw new Error(`verificação de vínculos indisponível para ${ids.length} documentos (${b.tabela})`)
  for (let i = 0; i < ids.length; i += 6) {
    await Promise.all(ids.slice(i, i + 6).map(async (id) => {
      let q: any = (svc as any).from(b.tabela).select(b.col, { count: 'exact', head: true }).eq('tenant_id', tenantId).eq(b.col, id)
      if (b.naoDeletado) q = q.eq('deletado', false)
      if (b.tipoRef) q = q.eq('tipo_ref', b.tipoRef)
      const { count, error } = await q
      if (error) { if (tabelaAusente(error.message) || tabelaAusente((error as any).code)) return; throw new Error(`${b.tabela}: ${error.message}`) }
      if (count) out.set(id, count)
    }))
  }
  return out
}

const T_PM = 'simulado_cronograma_adaptativo_plano_meta'
const T_PLANO = 'simulado_cronograma_adaptativo_plano'
const T_DEF = 'simulado_cronograma_adaptativo_meta_def'
// "EM USO" = o documento compõe metas de plano de aluno NÃO arquivado (plano_meta ⋈ plano.arquivada=false)
// ou meta ativa do catálogo (meta_def.ativa). Mesma definição do trigger do banco (documento_em_uso()).
const EM_USO_EXISTS = `(EXISTS (SELECT 1 FROM ${T_PM} pm JOIN ${T_PLANO} p ON p.id = pm.plano_id WHERE pm.documento_id = d.id AND p.arquivada = false)
        OR EXISTS (SELECT 1 FROM ${T_DEF} md WHERE md.documento_id = d.id AND md.ativa))`

/** Documentos EM USO por plano de aluno ativo → nº de planos ativos (0 = só meta ativa do catálogo). */
export async function documentosEmUso(svc: Svc, tenantId: string, ids: string[]): Promise<Map<string, number>> {
  const unicos = [...new Set(ids.filter((x) => UUID.test(x)))]
  const out = new Map<string, number>()
  for (let i = 0; i < unicos.length; i += CHUNK) {
    const lote = unicos.slice(i, i + CHUNK)
    const [a, b] = await Promise.all([
      sqlQuery<{ id: string; n: number }>(
        `SELECT pm.documento_id::text AS id, count(DISTINCT pm.plano_id)::int AS n FROM ${T_PM} pm JOIN ${T_PLANO} p ON p.id = pm.plano_id
          WHERE pm.tenant_id = $1 AND pm.documento_id = ANY($2::uuid[]) AND p.arquivada = false GROUP BY 1`, [tenantId, lote]),
      sqlQuery<{ id: string }>(`SELECT DISTINCT documento_id::text AS id FROM ${T_DEF} WHERE tenant_id = $1 AND ativa = true AND documento_id = ANY($2::uuid[])`, [tenantId, lote]),
    ])
    if (a && b) { for (const r of a) out.set(r.id, Number(r.n)); for (const r of b) if (!out.has(r.id)) out.set(r.id, 0); continue }
    // Fallback PostgREST (poucos ids); senão falha fechada.
    if (lote.length > MAX_FALLBACK_IDS) throw new Error('verificação de "documento em uso" indisponível')
    for (const id of lote) {
      const { data: pms, error: e1 } = await (svc as any).from(T_PM).select('plano_id').eq('tenant_id', tenantId).eq('documento_id', id).limit(2000)
      if (e1) throw new Error(e1.message)
      const planos = [...new Set(((pms ?? []) as { plano_id: string }[]).map((r) => r.plano_id))]
      let ativos = 0
      for (let j = 0; j < planos.length; j += CHUNK) {
        const { count, error } = await (svc as any).from(T_PLANO).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('arquivada', false).in('id', planos.slice(j, j + CHUNK))
        if (error) throw new Error(error.message)
        ativos += count ?? 0
      }
      const { count: cdef, error: e3 } = await (svc as any).from(T_DEF).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('ativa', true).eq('documento_id', id)
      if (e3) throw new Error(e3.message)
      if (ativos > 0 || (cdef ?? 0) > 0) out.set(id, ativos)
    }
  }
  return out
}

/** Documentos EM USO dentro das pastas (e subpastas vivas). Falha fechada se o SQL direto não estiver disponível. */
export async function docsEmUsoNasPastas(tenantId: string, pastaIds: string[]): Promise<{ id: string; titulo: string; pasta_id: string | null }[]> {
  const ids = [...new Set(pastaIds.filter((x) => UUID.test(x)))]
  if (!ids.length) return []
  const rows = await sqlQuery<{ id: string; titulo: string; pasta_id: string | null }>(
    `WITH RECURSIVE sub AS (
       SELECT id FROM simulado_pastas WHERE tenant_id = $1 AND id = ANY($2::uuid[])
       UNION SELECT p.id FROM simulado_pastas p JOIN sub s ON p.pai_id = s.id WHERE p.tenant_id = $1 AND p.deletado = false)
     SELECT d.id::text AS id, d.titulo, d.pasta_id::text AS pasta_id FROM simulado_conteudo_documentos d
      WHERE d.tenant_id = $1 AND d.deletado = false AND d.pasta_id IN (SELECT id FROM sub) AND ${EM_USO_EXISTS} LIMIT 200`,
    [tenantId, ids],
  )
  if (rows === null) throw new Error('verificação de documentos em uso na pasta indisponível')
  return rows
}

/** Recusa de ação sobre PASTA: devolve a mensagem (ou null se a pasta está livre). Falha fechada. */
export async function recusaPastaEmUso(tenantId: string, pastaIds: string[], acao: string, nomePasta?: string): Promise<string | null> {
  try {
    const docs = await docsEmUsoNasPastas(tenantId, pastaIds)
    return docs.length ? mensagemPastaEmUso(nomePasta, docs.length, acao) : null
  } catch (e) {
    console.error('[dependencias-documento] pasta em uso', (e as Error)?.message)
    return MSG_NAO_VERIFICADO
  }
}

/** Recusa de ação (mover/despublicar/categoria) sobre documentos EM USO. Devolve livres + bloqueados (com motivo). */
export async function recusarSeEmUso(
  svc: Svc, tenantId: string, docs: DocRef[], acao: AcaoBloqueada,
): Promise<{ livres: DocRef[]; bloqueados: Bloqueado[] }> {
  let uso = new Map<string, number>(); let falhou = false
  try { uso = await documentosEmUso(svc, tenantId, docs.map((d) => d.id)) } catch (e) { falhou = true; console.error('[dependencias-documento] em uso', (e as Error)?.message) }
  const livres: DocRef[] = []; const bloqueados: Bloqueado[] = []
  for (const d of docs) {
    if (falhou) bloqueados.push({ id: d.id, titulo: d.titulo, motivo: MSG_NAO_VERIFICADO, porTipo: {}, total: 0 })
    else if (uso.has(d.id)) bloqueados.push({ id: d.id, titulo: d.titulo, motivo: mensagemEmUso(acao, d.titulo, uso.get(d.id)), porTipo: {}, total: 0 })
    else livres.push(d)
  }
  return { livres, bloqueados }
}

/**
 * AUDITORIA: quando a ação deixa uma PASTA vazia (último documento saiu por mover/excluir/lote), registra
 * pasta, quantidade, ids e estado antes/depois + ator. Best-effort (nunca derruba a ação).
 */
export async function registrarPastasEsvaziadas(
  svc: Svc, args: { tenantId: string; atorId: string | null; acao: string; saindo: { id: string; pasta_id: string | null; titulo?: string }[]; destinoId?: string | null },
): Promise<void> {
  try {
    const origem = [...new Set(args.saindo.map((d) => d.pasta_id).filter((x): x is string => !!x))]
    if (!origem.length) return
    const vivos = new Map<string, number>()
    for (const pid of origem) {
      const { count } = await (svc as any).from('simulado_conteudo_documentos').select('id', { count: 'exact', head: true }).eq('tenant_id', args.tenantId).eq('pasta_id', pid).eq('deletado', false)
      vivos.set(pid, count ?? 0)
    }
    const vazias = pastasEsvaziadas(args.saindo, vivos)
    for (const [pid, docIds] of vazias) {
      const { registrarAudit } = await import('@/lib/audit')
      await registrarAudit({
        operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: pid, tenantId: args.tenantId, atorId: args.atorId,
        antes: { documentos: docIds.length, ids: docIds.slice(0, 200) },
        depois: { pasta_esvaziada: true, documentos: 0, acao: args.acao, destino_pasta_id: args.destinoId ?? null, quantidade_removida: docIds.length },
      }).catch(() => {})
    }
  } catch (e) { console.error('[dependencias-documento] auditoria pasta esvaziada', (e as Error)?.message) }
}

/**
 * Vínculos de cada documento (somente leitura). Devolve um Map com TODOS os ids informados
 * (sem vínculo = `{ total: 0, porTipo: {} }`). Lança erro se não conseguir verificar (use
 * `bloquearSeTemVinculos`, que já falha fechado).
 */
export async function dependenciasDocumentos(
  svc: Svc, tenantId: string, ids: string[], opts?: { origem?: Origem },
): Promise<Map<string, Dependencias>> {
  const unicos = [...new Set(ids.filter((x) => typeof x === 'string' && UUID.test(x)))]
  const res = new Map<string, Dependencias>(unicos.map((id) => [id, dependenciasVazias()]))
  if (!unicos.length) return res
  const blocos = opts?.origem === 'leitura' ? BLOCOS_LEITURA : BLOCOS_CONTEUDO
  for (let i = 0; i < unicos.length; i += CHUNK) {
    const lote = unicos.slice(i, i + CHUNK)
    const partes = await Promise.all(blocos.map(async (b) => [b, await contarBloco(svc, tenantId, b, lote)] as const))
    for (const [b, m] of partes) for (const [id, n] of m) { const d = res.get(id); if (d) somarDependencia(d, b.tipo, n) }
    if (opts?.origem !== 'leitura') {
      const uso = await documentosEmUso(svc, tenantId, lote)
      for (const [id, n] of uso) { const d = res.get(id); if (d) { d.emUso = true; d.planosAtivos = n } }
    }
  }
  return res
}

export type ResultadoBloqueio = { livres: DocRef[]; bloqueados: Bloqueado[]; mensagemLote: string }

/**
 * Separa documentos livres dos bloqueados por vínculos. Falha FECHADA: erro de verificação → todos bloqueados.
 * Os chamadores só podem excluir/soft-deletar `livres`.
 */
export async function bloquearSeTemVinculos(
  svc: Svc, tenantId: string, docs: DocRef[], opts?: { origem?: Origem },
): Promise<ResultadoBloqueio> {
  let deps = new Map<string, Dependencias>()
  try { deps = await dependenciasDocumentos(svc, tenantId, docs.map((d) => d.id), opts) }
  catch (e) { console.error('[dependencias-documento] verificação falhou', (e as Error)?.message) }
  const { livres, bloqueados } = particionarPorVinculos(docs, deps)
  return { livres, bloqueados, mensagemLote: mensagemLoteParcial(docs.length, bloqueados.length) }
}

/** Atalho p/ ação de UM documento: devolve a mensagem de recusa ou null se está livre. */
export async function recusaDocumentoUnico(
  svc: Svc, tenantId: string, doc: DocRef, opts?: { origem?: Origem },
): Promise<string | null> {
  const r = await bloquearSeTemVinculos(svc, tenantId, [doc], opts)
  return r.bloqueados[0]?.motivo ?? null
}
