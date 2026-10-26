import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { emitirEvento } from './outbox'

// Camada de dados do DRIVE de conteúdos (Fase 1): documento-mãe + versões imutáveis. Padrão do repo:
// service role (createAdminClient) + filtro por tenant_id na app (RLS ligado sem políticas). As
// decisões de PRODUTO (coexistência/migração, legal, vigência) são da Fase D — aqui é só a base.

// Fase 1: além de docx/pdf/html, aceita mídia/office (pptx/xlsx/video/audio) — só ingestão (guardar o
// original + registrar o tipo). ATENÇÃO: a coluna `tipo_origem` tem CHECK que precisa ser ampliado (ver
// relatório/migração aditiva); sem isso o INSERT desses tipos é rejeitado pelo Postgres.
export type TipoOrigem = 'docx' | 'pdf' | 'html' | 'pptx' | 'xlsx' | 'video' | 'audio'
export type StatusDoc = 'rascunho' | 'publicado' | 'arquivado'
export type StatusConversao = 'pendente' | 'processando' | 'ok' | 'revisao_necessaria' | 'erro'
export type CategoriaConteudo = 'conteudo' | 'modelo_caderno'

export interface Documento {
  id: string; titulo: string; tipo_origem: TipoOrigem; status: StatusDoc; categoria: CategoriaConteudo
  pasta_id: string | null; versao_atual_id: string | null
  fonte: string | null; licenca: string | null
  criado_em: string; atualizado_em: string
}
export interface Versao {
  id: string; documento_id: string; numero: number; arquivo_key: string; hash_arquivo: string
  origem: 'upload' | 'edicao_editor' | 'restauracao'; status_conversao: StatusConversao
  vigencia_inicio: string | null; vigencia_fim: string | null; criada_em: string
}

const T_DOC = 'simulado_conteudo_documentos'
const T_VER = 'simulado_conteudo_versoes'

/** Lista documentos do tenant (opcional: por pasta e/ou status). Não traz deletados. */
export async function listarDocumentos(opts: { pastaId?: string | null; status?: StatusDoc; categoria?: CategoriaConteudo } = {}): Promise<Documento[]> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return []
  const svc = createAdminClient()
  const rows = await fetchAll<any>(() => {
    let q = svc.from(T_DOC)
      .select('id, titulo, tipo_origem, status, categoria, pasta_id, versao_atual_id, fonte, licenca, criado_em, atualizado_em')
      .eq('tenant_id', tenantId).eq('deletado', false)
    if (opts.pastaId !== undefined) q = opts.pastaId === null ? q.is('pasta_id', null) : q.eq('pasta_id', opts.pastaId)
    if (opts.status) q = q.eq('status', opts.status)
    if (opts.categoria) q = q.eq('categoria', opts.categoria)
    return q.order('atualizado_em', { ascending: false }).order('id', { ascending: true })
  })
  return (rows ?? []) as Documento[]
}

/** Um documento (do tenant). */
export async function obterDocumento(id: string): Promise<Documento | null> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !id) return null
  const svc = createAdminClient()
  const { data } = await svc.from(T_DOC)
    .select('id, titulo, tipo_origem, status, categoria, pasta_id, versao_atual_id, fonte, licenca, criado_em, atualizado_em')
    .eq('tenant_id', tenantId).eq('id', id).eq('deletado', false).maybeSingle()
  return (data as Documento) ?? null
}

/** Versões de um documento (mais nova primeiro). */
export async function listarVersoes(documentoId: string): Promise<Versao[]> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !documentoId) return []
  const svc = createAdminClient()
  const rows = await fetchAll<any>(() => svc.from(T_VER)
    .select('id, documento_id, numero, arquivo_key, hash_arquivo, origem, status_conversao, vigencia_inicio, vigencia_fim, criada_em')
    .eq('tenant_id', tenantId).eq('documento_id', documentoId)
    .order('numero', { ascending: false }))
  return (rows ?? []) as Versao[]
}

/** Cria o documento-mãe + a versão 1 (status conversão 'pendente') e emite documento.importado.
 *  P1/D8: fonte/licença obrigatórios (gate legal). O worker de conversão (Fase 2) estrutura em trechos. */
export async function criarDocumento(input: {
  titulo: string; tipoOrigem: TipoOrigem; arquivoKey: string; hashArquivo?: string
  pastaId?: string | null; fonte?: string | null; licenca?: string | null; criadoPor?: string | null; categoria?: CategoriaConteudo
}): Promise<{ documentoId: string; versaoId: string } | { erro: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { erro: 'tenant não resolvido' }
  if (!input.titulo?.trim()) return { erro: 'título obrigatório' }
  // Origem é AUTOMÁTICA (conta que importou) — não é mais campo manual nem gate.
  const svc = createAdminClient()
  try {
    const { data: doc, error: e1 } = await svc.from(T_DOC).insert({
      tenant_id: tenantId, titulo: input.titulo.trim(), tipo_origem: input.tipoOrigem, status: 'rascunho', categoria: input.categoria ?? 'conteudo',
      pasta_id: input.pastaId ?? null, fonte: input.fonte?.trim() || null, licenca: input.licenca?.trim() || null, criado_por: input.criadoPor ?? null,
    }).select('id').single()
    if (e1 || !doc) return { erro: e1?.message || 'falha ao criar documento' }

    const { data: ver, error: e2 } = await svc.from(T_VER).insert({
      tenant_id: tenantId, documento_id: doc.id, numero: 1,
      arquivo_key: input.arquivoKey, hash_arquivo: input.hashArquivo ?? '', origem: 'upload', status_conversao: 'pendente',
    }).select('id').single()
    if (e2 || !ver) return { erro: e2?.message || 'falha ao criar versão' }

    await emitirEvento(svc, tenantId, 'documento.importado', { documento_id: doc.id, versao_id: ver.id })
    return { documentoId: doc.id, versaoId: ver.id }
  } catch (e) {
    return { erro: (e as any)?.message || String(e) }
  }
}

/** Última versão (maior número) do documento — base para reconciliar a próxima. */
export async function ultimaVersao(documentoId: string): Promise<Versao | null> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return null
  const svc = createAdminClient()
  const { data } = await svc.from(T_VER)
    .select('id, documento_id, numero, arquivo_key, hash_arquivo, origem, status_conversao, vigencia_inicio, vigencia_fim, criada_em')
    .eq('tenant_id', tenantId).eq('documento_id', documentoId).order('numero', { ascending: false }).limit(1).maybeSingle()
  return (data as Versao) ?? null
}

/** Cria a próxima versão (numero = max+1). Devolve a nova + a anterior (para reconciliar). */
export async function criarVersao(documentoId: string, input: {
  arquivoKey: string; hashArquivo?: string; origem?: 'upload' | 'edicao_editor' | 'restauracao'
}): Promise<{ versaoId: string; numero: number; anteriorId: string | null } | { erro: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { erro: 'tenant não resolvido' }
  const svc = createAdminClient()
  const anterior = await ultimaVersao(documentoId)
  const numero = (anterior?.numero ?? 0) + 1
  const { data, error } = await svc.from(T_VER).insert({
    tenant_id: tenantId, documento_id: documentoId, numero,
    arquivo_key: input.arquivoKey, hash_arquivo: input.hashArquivo ?? '', origem: input.origem ?? 'upload', status_conversao: 'pendente',
  }).select('id').single()
  if (error || !data) return { erro: error?.message || 'falha ao criar versão' }
  return { versaoId: data.id, numero, anteriorId: anterior?.id ?? null }
}

/** Atualiza a chave do arquivo + hash de uma versão (pós-upload do original). */
export async function definirArquivoVersao(versaoId: string, arquivoKey: string, hashArquivo: string): Promise<void> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return
  const svc = createAdminClient()
  await svc.from(T_VER).update({ arquivo_key: arquivoKey, hash_arquivo: hashArquivo }).eq('tenant_id', tenantId).eq('id', versaoId)
}

/** Define a versão atual do documento (publicar). Imutável: isso não altera versões, só o ponteiro. */
export async function definirVersaoAtual(documentoId: string, versaoId: string): Promise<{ ok: boolean; erro?: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, erro: 'tenant não resolvido' }
  const svc = createAdminClient()
  const { error } = await svc.from(T_DOC)
    .update({ versao_atual_id: versaoId, status: 'publicado', atualizado_em: new Date().toISOString() })
    .eq('tenant_id', tenantId).eq('id', documentoId)
  if (error) return { ok: false, erro: error.message }
  await emitirEvento(svc, tenantId, 'documento.atualizado', { documento_id: documentoId, versao_id: versaoId })
  return { ok: true }
}
