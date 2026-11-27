import 'server-only'
// Classificação PRÓPRIA dos documentos (`documentos.classificacao_id`) para a herança única (efetiva.ts).
// Tolerante: tabela/coluna ausente (migration 16 pendente) ou catálogo vazio => mapas vazios => comportamento antigo.
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { tabelaTiposAusente } from '@/lib/cronograma/tipos-conteudo-server'
import { carregarCatalogoClassificacao } from './carregar'

export interface ClassificacaoDosDocs {
  /** documento_id → classificacao_id (só os que têm). */
  porDoc: Map<string, string>
  /** classificacao_id → slug (catálogo do tenant). */
  slugPorId: Map<string, string>
}

const VAZIO = (): ClassificacaoDosDocs => ({ porDoc: new Map(), slugPorId: new Map() })

export async function carregarClassificacaoDosDocs(svc: SupabaseClient, tenantId: string): Promise<ClassificacaoDosDocs> {
  try {
    const cat = await carregarCatalogoClassificacao(svc, tenantId)
    if (!cat.length) return VAZIO() // sem catálogo gravado não existe classificacao_id possível
    const linhas = await fetchAll<{ id: string; classificacao_id: string }>(() =>
      svc.from('simulado_conteudo_documentos').select('id, classificacao_id')
        .eq('tenant_id', tenantId).eq('deletado', false).not('classificacao_id', 'is', null).order('id', { ascending: true }) as never)
    return {
      porDoc: new Map(linhas.map((l) => [l.id, l.classificacao_id] as const)),
      slugPorId: new Map(cat.map((c) => [c.id, c.slug] as const)),
    }
  } catch (e) {
    if (tabelaTiposAusente(e as { message?: string; code?: string })) return VAZIO() // coluna ausente: como antes
    console.error('[classificacao] leitura da classificação dos documentos falhou (usando só a pasta):', e)
    return VAZIO()
  }
}
