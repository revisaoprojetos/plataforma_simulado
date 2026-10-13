import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'

// Tags (selos) cadastradas PELO TENANT na Biblioteca do Desafio (simulado_biblioteca_itens, tipo='tag').
// É a ÚNICA fonte das tags usadas na conversão de "<nome>" em texto → selo na importação/save. Nada de
// lista fixa no código: se o admin renomear/criar/editar uma tag, a conversão acompanha.

export interface TagBiblioteca { nome: string; slug: string | null; html: string }

/** Normaliza um termo p/ casar nome/slug sem acento, caixa ou variação de espaço/hífen.
 * Ex.: "Reafirmação de  Entendimento" / "reafirmacao-de-entendimento" → "reafirmacao de entendimento". */
export function normalizarTermoTag(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_-]+/g, ' ').trim()
}

/** Carrega as tags da Biblioteca do tenant. Vazio se a tabela não existe (migração ausente). */
export async function carregarTagsBiblioteca(tenantId: string): Promise<TagBiblioteca[]> {
  try {
    const svc = createAdminClient() as any
    return await fetchAll<TagBiblioteca>(() => svc
      .from('simulado_biblioteca_itens')
      .select('nome, slug, html')
      .eq('tenant_id', tenantId).eq('tipo', 'tag').eq('deletado', false).order('id', { ascending: true }))
  } catch { return [] }
}

/** Mapa de resolução: termo normalizado (nome OU slug) → html da tag da Biblioteca. */
export function mapaTagsBiblioteca(tags: TagBiblioteca[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const t of tags) {
    const html = (t.html || '').trim()
    if (!html) continue
    if (t.nome) m[normalizarTermoTag(t.nome)] = html
    if (t.slug) m[normalizarTermoTag(t.slug)] = html
  }
  return m
}
