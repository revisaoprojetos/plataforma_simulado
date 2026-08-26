import type { SupabaseClient } from '@supabase/supabase-js'

// Engine de "este objeto está referenciado no banco?". Base para: badge órfão/usado no
// navegador, guarda de exclusão e classificação do organizador. Porta a lógica de
// scripts/limpar-orfaos-storage.mjs + backfill-simulado-arquivos.mjs, mas em memória.
//
// Estratégia:
//  - Buckets PÚBLICOS (imagens/pdfs): um objeto é "usado" se o BASENAME aparecer no blob
//    de referências (URLs salvas em colunas/jsonb). Conservador: colisão de basename só
//    causa FALSO-POSITIVO (nunca apaga algo que parece usado) — aceitável.
//  - DISCURSIVAS (privado, nome = uuid aleatório): NÃO dá pra confiar em basename. Usa-se
//    a FK (simulado_resposta_arquivos/anotacoes/documentos → simulado_arquivos.id) e o
//    campo `arquivos`. Sem id de catálogo → trata como REFERENCIADO (não apaga na dúvida).

/** Tenant "casa" (Revisão) — fallback quando não dá pra resolver o dono. */
export const MAIN_TENANT = '02195fa6-3db8-49d0-8c07-d21328a26a13'

export interface MapaReferencias {
  blobGlobal: string
  blobPorTenant: Map<string, string>
  discursivasBlob: string
  fkArquivoIds: Set<string>
  donoDoBasename: (basename: string) => string
}

/** Paginação genérica (teto 1000 do PostgREST) com filtro opcional de colunas. */
async function paginar(svc: SupabaseClient, tabela: string, colunas: string): Promise<any[]> {
  const all: any[] = []
  let off = 0
  try {
    while (true) {
      const { data, error } = await svc.from(tabela).select(colunas).range(off, off + 999)
      if (error || !Array.isArray(data) || data.length === 0) break
      all.push(...data)
      if (data.length < 1000) break
      off += 1000
    }
  } catch {
    /* tabela ausente → best-effort */
  }
  return all
}

/** Acumula um conjunto de linhas no blob global e no blob por-tenant. */
function acumular(rows: any[], campoTenant: string, blobPorTenant: Map<string, string>): string {
  let global = ''
  for (const r of rows) {
    const t = (r?.[campoTenant] as string) || ''
    const s = JSON.stringify(r)
    global += s
    if (t) blobPorTenant.set(t, (blobPorTenant.get(t) ?? '') + s)
  }
  return global
}

export async function construirMapaReferencias(svc: SupabaseClient): Promise<MapaReferencias> {
  const blobPorTenant = new Map<string, string>()
  let blobGlobal = ''

  // Colunas (texto + jsonb) que guardam URLs de storage, por tabela.
  blobGlobal += acumular(await paginar(svc, 'simulado_questoes', 'tenant_id,imagem_url,enunciado,comentario_professor'), 'tenant_id', blobPorTenant)
  blobGlobal += acumular(await paginar(svc, 'simulado_cadernos_designer', 'tenant_id,capa_url,config'), 'tenant_id', blobPorTenant)
  blobGlobal += acumular(await paginar(svc, 'simulado_pastas', 'tenant_id,capa_url,capa_card_url,caderno_entrega'), 'tenant_id', blobPorTenant)
  blobGlobal += acumular(await paginar(svc, 'simulado_banners', 'tenant_id,imagem_url'), 'tenant_id', blobPorTenant)
  blobGlobal += acumular(await paginar(svc, 'simulado_pdf_jobs', 'tenant_id,arquivo_path,arquivo_url'), 'tenant_id', blobPorTenant)
  // tenants.tema usa `id` como tenant (não tenant_id).
  blobGlobal += acumular(await paginar(svc, 'simulado_tenants', 'id,tema'), 'id', blobPorTenant)

  // Discursivas: campo `arquivos` (paths/urls) — global (não por basename).
  const discursivasBlob = JSON.stringify(await paginar(svc, 'simulado_respostas_discursivas', 'arquivos'))

  // FK autoritativa: ids de simulado_arquivos referenciados.
  const fkArquivoIds = new Set<string>()
  for (const tab of ['simulado_resposta_arquivos', 'simulado_anotacoes_discursivas', 'simulado_documentos']) {
    for (const r of await paginar(svc, tab, 'arquivo_id')) {
      if (r?.arquivo_id) fkArquivoIds.add(r.arquivo_id as string)
    }
  }

  const donoDoBasename = (basename: string): string => {
    for (const [t, blob] of blobPorTenant) if (blob.includes(basename)) return t
    return MAIN_TENANT
  }

  return { blobGlobal, blobPorTenant, discursivasBlob, fkArquivoIds, donoDoBasename }
}

/** Objeto está referenciado no banco? (conservador — na dúvida, true). */
export function estaReferenciado(
  mapa: MapaReferencias,
  obj: { bucket: string; path: string; catalogId?: string | null },
): boolean {
  const basename = obj.path.split('/').pop() ?? obj.path
  if (obj.bucket === 'discursivas') {
    if (obj.catalogId && mapa.fkArquivoIds.has(obj.catalogId)) return true
    if (mapa.discursivasBlob.includes(basename) || mapa.discursivasBlob.includes(obj.path)) return true
    // Sem id de catálogo (não reconciliado) → não dá pra provar que é órfão → conservador.
    return !obj.catalogId
  }
  return mapa.blobGlobal.includes(basename)
}
