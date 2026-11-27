import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { remember } from '@/lib/cache/relatorio-cache'
import { diagnosticarIndice, type DiagnosticoIndice, type TrechoDiag, type Severidade } from './diagnostico-indice'

// Diagnóstico de índice — camada server. Só LÊ (tipo/rótulo/ordem/uid; NUNCA html/texto). Isolado por tenant
// (service role + .eq('tenant_id')). Cache curto (chave inclui a versão atual → edição/nova versão invalida sozinha)
// e tolerante: falha de Redis/cache cai no cálculo direto.

const T_DOC = 'simulado_conteudo_documentos'
const T_TR = 'simulado_conteudo_trechos'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Só os tipos que o diagnóstico usa (artigo + estruturais) — reduz linhas lidas; demais tipos ficam fora da contagem. */
const TIPOS_LEVES = ['livro', 'parte', 'titulo', 'capitulo', 'secao', 'subsecao', 'artigo']
const TTL_SEG = 120
const POR_PAGINA_MAX = 50
const CONCORRENCIA = 4

type Svc = ReturnType<typeof createAdminClient>

export type DiagnosticoDocumento =
  | { ok: true; documentoId: string; titulo: string; versaoId: string | null; diagnostico: DiagnosticoIndice; parcial: boolean }
  | { ok: false; error: string; codigo: 'invalido' | 'nao_encontrado' | 'erro' }

async function trechosLeves(svc: Svc, versaoId: string): Promise<TrechoDiag[]> {
  const out: TrechoDiag[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await (svc as any).from(T_TR).select('uid, tipo, rotulo')
      .eq('versao_id', versaoId).in('tipo', TIPOS_LEVES)
      .order('ordem', { ascending: true }).range(off, off + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    out.push(...(data as TrechoDiag[]))
    if (data.length < 1000) break
  }
  return out
}

async function diagnosticoDaVersao(svc: Svc, tenantId: string, versaoId: string): Promise<DiagnosticoIndice> {
  const calcular = async () => diagnosticarIndice(await trechosLeves(svc, versaoId))
  try { return await remember(`diag-indice:${tenantId}:${versaoId}`, TTL_SEG, calcular) } catch { return calcular() }
}

export async function diagnosticarDocumento(svc: Svc, tenantId: string, documentoId: string): Promise<DiagnosticoDocumento> {
  if (!UUID.test(documentoId)) return { ok: false, error: 'Documento inválido.', codigo: 'invalido' }
  const { data: doc, error } = await (svc as any).from(T_DOC).select('id, titulo, versao_atual_id, deletado').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
  if (error) return { ok: false, error: error.message, codigo: 'erro' }
  if (!doc || doc.deletado) return { ok: false, error: 'Documento não encontrado ou excluído.', codigo: 'nao_encontrado' }
  const versaoId = doc.versao_atual_id ? String(doc.versao_atual_id) : null
  try {
    const diagnostico = versaoId ? await diagnosticoDaVersao(svc, tenantId, versaoId) : diagnosticarIndice([])
    return { ok: true, documentoId, titulo: String(doc.titulo ?? ''), versaoId, diagnostico, parcial: false }
  } catch (e) {
    return { ok: false, error: (e as Error).message, codigo: 'erro' }
  }
}

export interface LinhaMatriz {
  documentoId: string
  titulo: string
  versaoId: string | null
  severidade: Severidade | null
  totalArtigos: number
  saltos: number
  duplicados: number
  foraDeOrdem: number
  capitulosSemArtigo: number
  artigosSemEstrutura: boolean
  pendencias: number
  /** true = leitura falhou para este documento (não derruba a página). */
  erro?: boolean
}

export type DiagnosticoLote =
  | { ok: true; linhas: LinhaMatriz[]; pagina: number; porPagina: number; total: number; totalPaginas: number; resumo: Record<Severidade, number> }
  | { ok: false; error: string; codigo: 'invalido' | 'erro' }

/**
 * Matriz de diagnóstico paginada no servidor (.range()+count). `pastaId` = documentos DIRETOS da pasta (sem recursão);
 * omitido = todos os documentos do tenant. Cada página lê só tipo/rótulo/uid dos trechos estruturais+artigo
 * (nunca html), com concorrência baixa. `resumo` conta severidades APENAS da página.
 */
export async function diagnosticarLote(
  svc: Svc, tenantId: string, opc: { pastaId?: string | null; pagina?: number; porPagina?: number } = {},
): Promise<DiagnosticoLote> {
  if (opc.pastaId && !UUID.test(opc.pastaId)) return { ok: false, error: 'Pasta inválida.', codigo: 'invalido' }
  const pagina = Math.max(1, Math.floor(opc.pagina ?? 1) || 1)
  const porPagina = Math.min(POR_PAGINA_MAX, Math.max(1, Math.floor(opc.porPagina ?? 20) || 20))
  const ini = (pagina - 1) * porPagina

  let q = (svc as any).from(T_DOC).select('id, titulo, versao_atual_id', { count: 'exact' }).eq('tenant_id', tenantId).eq('deletado', false)
  if (opc.pastaId) q = q.eq('pasta_id', opc.pastaId)
  const { data, error, count } = await q.order('titulo', { ascending: true }).order('id', { ascending: true }).range(ini, ini + porPagina - 1)
  if (error) return { ok: false, error: error.message, codigo: 'erro' }
  const docs = (data ?? []) as { id: string; titulo: string | null; versao_atual_id: string | null }[]

  const linhas: LinhaMatriz[] = new Array(docs.length)
  let prox = 0
  const worker = async () => {
    while (prox < docs.length) {
      const i = prox++
      const d = docs[i]
      const base = { documentoId: d.id, titulo: String(d.titulo ?? ''), versaoId: d.versao_atual_id ? String(d.versao_atual_id) : null }
      try {
        const g = d.versao_atual_id ? await diagnosticoDaVersao(svc, tenantId, String(d.versao_atual_id)) : diagnosticarIndice([])
        linhas[i] = {
          ...base, severidade: g.severidade, totalArtigos: g.totalArtigos, saltos: g.saltos.length, duplicados: g.duplicados.length,
          foraDeOrdem: g.foraDeOrdem.length, capitulosSemArtigo: g.capitulosSemArtigo.length, artigosSemEstrutura: g.artigosSemEstrutura, pendencias: g.pendencias.length,
        }
      } catch {
        linhas[i] = { ...base, severidade: null, totalArtigos: 0, saltos: 0, duplicados: 0, foraDeOrdem: 0, capitulosSemArtigo: 0, artigosSemEstrutura: false, pendencias: 0, erro: true }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, docs.length) }, worker))

  const resumo: Record<Severidade, number> = { ok: 0, revisar: 0, critico: 0 }
  for (const l of linhas) if (l.severidade) resumo[l.severidade]++
  const total = count ?? docs.length
  return { ok: true, linhas, pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)), resumo }
}
