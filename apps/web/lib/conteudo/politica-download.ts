import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'

/**
 * POLÍTICA DE DOWNLOAD do aluno + REGISTRO (simulado_download_log).
 *
 * Duas chaves, nesta ordem (qualquer uma desligada bloqueia, no SERVIDOR):
 *  1) da PLATAFORMA — `simulado_tenants.tema.biblioteca_politica.aluno_pode_baixar` (default: liberado; sem migração);
 *  2) do DOCUMENTO — `simulado_conteudo_documentos.pode_baixar` (default true).
 * Somam-se às permissões por atribuição (grupo/aluno) já avaliadas em `avaliarDocAluno`. Testador global não é barrado.
 * Tolerante: tabela/coluna ausente nunca derruba o download (política → liberado; registro → ignorado).
 */

const CHAVE_TEMA = 'biblioteca_politica'
const kPol = (t: string) => `bib-politica:${t}`

export interface PoliticaDownload {
  alunoPodeBaixar: boolean
  atualizadoEm: string | null
  atualizadoPor: string | null
}

export async function lerPoliticaDownload(svc: SupabaseClient, tenantId: string): Promise<PoliticaDownload> {
  return remember<PoliticaDownload>(kPol(tenantId), 30, async () => {
    try {
      const { data } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
      const raw = (((data as { tema?: Record<string, unknown> } | null)?.tema ?? {})[CHAVE_TEMA] ?? {}) as Record<string, unknown>
      return {
        alunoPodeBaixar: raw.aluno_pode_baixar !== false,
        atualizadoEm: typeof raw.atualizadoEm === 'string' ? raw.atualizadoEm : null,
        atualizadoPor: typeof raw.atualizadoPor === 'string' ? raw.atualizadoPor : null,
      }
    } catch { return { alunoPodeBaixar: true, atualizadoEm: null, atualizadoPor: null } }
  })
}

export async function salvarPoliticaDownload(svc: SupabaseClient, tenantId: string, alunoPodeBaixar: boolean, atorId: string | null): Promise<{ ok: boolean; error?: string }> {
  const { data, error: e1 } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
  if (e1) return { ok: false, error: e1.message }
  const tema = { ...(((data as { tema?: Record<string, unknown> } | null)?.tema) ?? {}) }
  tema[CHAVE_TEMA] = { aluno_pode_baixar: alunoPodeBaixar, atualizadoEm: new Date().toISOString(), atualizadoPor: atorId }
  const { error } = await svc.from('simulado_tenants').update({ tema }).eq('id', tenantId)
  if (error) return { ok: false, error: error.message }
  await esquecer(kPol(tenantId)).catch(() => {})
  return { ok: true }
}

export type MotivoBloqueio = 'politica' | 'documento'

/** Chaves da plataforma e do documento. `null` = liberado; senão o motivo. */
export async function bloqueioDeDownload(svc: SupabaseClient, tenantId: string, documentoId: string): Promise<MotivoBloqueio | null> {
  const pol = await lerPoliticaDownload(svc, tenantId)
  if (!pol.alunoPodeBaixar) return 'politica'
  try {
    const { data, error } = await svc.from('simulado_conteudo_documentos').select('pode_baixar').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
    if (!error && (data as { pode_baixar?: boolean | null } | null)?.pode_baixar === false) return 'documento'
  } catch { /* coluna ausente → liberado */ }
  return null
}

export type OrigemDownload = 'cronograma' | 'biblioteca' | 'produto' | 'midia' | 'outro'
export interface EntradaDownload {
  tenantId: string
  estudanteId: string
  documentoId?: string | null
  titulo?: string | null
  origem: OrigemDownload
  metaId?: string | null
  produtoId?: string | null
  tipoOrigem?: string | null
  resultado: 'baixado' | 'bloqueado'
  motivo?: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const limpar = (v: string | null | undefined, max: number) => (v ? String(v).slice(0, max) : null)

/** Registra (best-effort — nunca atrasa nem derruba o download). */
export async function registrarDownload(svc: SupabaseClient, e: EntradaDownload): Promise<void> {
  try {
    await svc.from('simulado_download_log').insert({
      tenant_id: e.tenantId, estudante_id: e.estudanteId,
      documento_id: e.documentoId && UUID.test(e.documentoId) ? e.documentoId : null,
      titulo: limpar(e.titulo, 300), origem: e.origem, meta_id: limpar(e.metaId, 120),
      produto_id: e.produtoId && UUID.test(e.produtoId) ? e.produtoId : null,
      tipo_origem: limpar(e.tipoOrigem, 20), resultado: e.resultado, motivo: limpar(e.motivo, 40),
    })
  } catch { /* tabela ausente / falha de rede: ignora */ }
}
