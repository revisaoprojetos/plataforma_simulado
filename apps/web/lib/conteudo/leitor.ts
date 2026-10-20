import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { listarAnotacoes, type Anotacao } from './anotacoes'

// LEITOR do aluno (Fase 8) — monta a leitura a partir dos TRECHOS da versão atual (cada um com seu
// uid, a âncora estável do grifo) + as anotações do aluno. A ancoragem é por (uid + offset no trecho):
// simples e robusta — é exatamente o que a tabela de anotações guarda. Server-only (service role).

const T_DOC = 'simulado_conteudo_documentos'
const T_TR = 'simulado_conteudo_trechos'
const T_LP = 'simulado_conteudo_leitura_progresso'

export interface TrechoLeitura { uid: string; ordem: number; tipo: string; rotulo: string | null; texto: string }
export interface Leitura { documentoId: string; titulo: string; versaoId: string; trechos: TrechoLeitura[]; anotacoes: Anotacao[] }
export interface ItemBiblioteca { id: string; titulo: string; tipo_origem: string; versaoAtualId: string; atualizado_em: string }

/** Documentos PUBLICADOS disponíveis ao aluno (área de teste: tenant inteiro; o gate por produto é fase posterior). */
export async function listarBibliotecaAluno(_alunoId: string): Promise<ItemBiblioteca[]> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return []
  const svc = createAdminClient()
  const rows = await fetchAll<any>(() => svc.from(T_DOC)
    .select('id, titulo, tipo_origem, versao_atual_id, atualizado_em')
    .eq('tenant_id', tenantId).eq('status', 'publicado').eq('deletado', false)
    .not('versao_atual_id', 'is', null)
    .order('atualizado_em', { ascending: false }).order('id', { ascending: true }))
  return (rows ?? []).map((d) => ({ id: d.id, titulo: d.titulo, tipo_origem: d.tipo_origem, versaoAtualId: d.versao_atual_id, atualizado_em: d.atualizado_em }))
}

/** Carrega a leitura (trechos da versão atual + grifos do aluno). null se não publicado. */
export async function carregarLeitura(documentoId: string, alunoId: string): Promise<Leitura | null> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !documentoId) return null
  const svc = createAdminClient()
  const { data: doc } = await svc.from(T_DOC)
    .select('id, titulo, status, versao_atual_id, deletado')
    .eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
  if (!doc || doc.deletado || doc.status !== 'publicado' || !doc.versao_atual_id) return null

  const [trechos, anotacoes] = await Promise.all([
    fetchAll<any>(() => svc.from(T_TR).select('uid, ordem, tipo, rotulo, texto').eq('tenant_id', tenantId).eq('versao_id', doc.versao_atual_id).order('ordem', { ascending: true })),
    listarAnotacoes(documentoId, alunoId),
  ])
  return {
    documentoId, titulo: doc.titulo, versaoId: doc.versao_atual_id,
    trechos: (trechos ?? []).map((t) => ({ uid: t.uid, ordem: t.ordem, tipo: t.tipo, rotulo: t.rotulo, texto: t.texto })),
    anotacoes,
  }
}

/** Registra/atualiza o progresso de leitura (histórico N15). */
export async function registrarLeituraAluno(documentoId: string, alunoId: string, versaoId: string, origem: 'biblioteca' | 'desafio' = 'biblioteca'): Promise<void> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return
  const svc = createAdminClient()
  await svc.from(T_LP).upsert({
    tenant_id: tenantId, aluno_id: alunoId, documento_id: documentoId, versao_id: versaoId, origem, ultima_leitura_em: new Date().toISOString(),
  }, { onConflict: 'tenant_id,aluno_id,documento_id' })
}
