import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { recursoAusente, marcarSeAusente } from '@/lib/db/recurso-ausente'
import { ehTestadorGlobal } from '@/lib/sistema/testadores-globais'
import { decidirDownloadAluno, modoDownloadsDoTema, patchTemaDownloads, MOTIVO_DOWNLOADS_DESATIVADOS } from './downloads-aluno-pura'

/**
 * POLÍTICA DE DOWNLOAD do aluno + REGISTRO (simulado_download_log).
 *
 * Duas chaves, nesta ordem (qualquer uma desligada bloqueia, no SERVIDOR):
 *  1) da PLATAFORMA — `simulado_tenants.tema.downloads_aluno` ('permitido'|'bloqueado'; AUSENTE = BLOQUEADO; sem migração;
 *     aceita a chave antiga `biblioteca_politica.aluno_pode_baixar === true` — ver downloads-aluno-pura.ts);
 *  2) do DOCUMENTO — `simulado_conteudo_documentos.pode_baixar` (default true).
 * Somam-se às permissões por atribuição (grupo/aluno) já avaliadas em `avaliarDocAluno`. Testador global não é barrado.
 * Falha fechada: erro ao ler a política = bloqueado. Registro (simulado_download_log) é best-effort (ignorado se falhar).
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
      const tema = (data as { tema?: Record<string, unknown> } | null)?.tema ?? {}
      const raw = (tema[CHAVE_TEMA] ?? {}) as Record<string, unknown>
      return {
        alunoPodeBaixar: modoDownloadsDoTema(tema) === 'permitido',
        atualizadoEm: typeof raw.atualizadoEm === 'string' ? raw.atualizadoEm : null,
        atualizadoPor: typeof raw.atualizadoPor === 'string' ? raw.atualizadoPor : null,
      }
    } catch { return { alunoPodeBaixar: false, atualizadoEm: null, atualizadoPor: null } }
  })
}

export async function salvarPoliticaDownload(svc: SupabaseClient, tenantId: string, alunoPodeBaixar: boolean, atorId: string | null): Promise<{ ok: boolean; error?: string }> {
  const { data, error: e1 } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
  if (e1) return { ok: false, error: e1.message }
  const tema = { ...(((data as { tema?: Record<string, unknown> } | null)?.tema) ?? {}) }
  tema[CHAVE_TEMA] = { aluno_pode_baixar: alunoPodeBaixar, atualizadoEm: new Date().toISOString(), atualizadoPor: atorId }
  Object.assign(tema, patchTemaDownloads(alunoPodeBaixar)) // interruptor central (mesma chave que o admin "Avançado" grava)
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

/**
 * GUARDA CENTRAL das rotas de download do ALUNO (material/caderno/PDF do cronograma): `null` = pode; senão o motivo.
 * Testador global passa. Registra o bloqueio em simulado_download_log (motivo 'downloads_desativados') quando `registrar` é passado.
 * Admin NÃO passa por aqui (rotas /api/admin/** e download-admin* não usam esta guarda).
 */
export async function bloqueioDownloadsAluno(
  svc: SupabaseClient, tenantId: string, estudanteId: string | null,
  registrar?: Omit<EntradaDownload, 'tenantId' | 'estudanteId' | 'resultado' | 'motivo'>,
): Promise<typeof MOTIVO_DOWNLOADS_DESATIVADOS | null> {
  const pol = await lerPoliticaDownload(svc, tenantId)
  const testador = pol.alunoPodeBaixar || !estudanteId ? false : await ehTestadorGlobal({ tenantId, estudanteId }).catch(() => false)
  const d = decidirDownloadAluno(pol.alunoPodeBaixar ? 'permitido' : 'bloqueado', testador ? 'testador' : 'aluno')
  if (d.permitido) return null
  if (registrar && estudanteId) await registrarDownload(svc, { ...registrar, tenantId, estudanteId, resultado: 'bloqueado', motivo: MOTIVO_DOWNLOADS_DESATIVADOS })
  return MOTIVO_DOWNLOADS_DESATIVADOS
}

/** Para as PÁGINAS/UIs do aluno: o aluno pode ver botões de baixar? (mesma decisão da guarda; 1 leitura cacheada 30s). */
export async function downloadsAlunoLiberados(svc: SupabaseClient, tenantId: string, estudanteId: string | null): Promise<boolean> {
  return (await bloqueioDownloadsAluno(svc, tenantId, estudanteId)) === null
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
  if (recursoAusente('tab:download_log')) return
  try {
    const { error } = await svc.from('simulado_download_log').insert({
      tenant_id: e.tenantId, estudante_id: e.estudanteId,
      documento_id: e.documentoId && UUID.test(e.documentoId) ? e.documentoId : null,
      titulo: limpar(e.titulo, 300), origem: e.origem, meta_id: limpar(e.metaId, 120),
      produto_id: e.produtoId && UUID.test(e.produtoId) ? e.produtoId : null,
      tipo_origem: limpar(e.tipoOrigem, 20), resultado: e.resultado, motivo: limpar(e.motivo, 40),
    })
    if (error) marcarSeAusente('tab:download_log', error.message)
  } catch { /* tabela ausente / falha de rede: ignora */ }
}
