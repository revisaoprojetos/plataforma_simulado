import 'server-only'

/**
 * Leitura (servidor) das seleções do GERADOR (`simulado_conteudo_selecao_meta`, area='gerador') para o resolvedor de conteúdo
 * das metas. Cache curto por tenant; tolera tabela ausente (migration 16 pendente) => índice vazio => comportamento antigo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { esquecer, remember } from '@/lib/cache/relatorio-cache'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { AREA_GERADOR, indexarSelecoes, type ConjuntoRef, type IndiceSelecoes, type SelecaoGerador } from './selecao-gerador'

export const T_SELECAO = 'simulado_conteudo_selecao_meta'
const TTL_SEG = 60
export const chaveCacheSelecoesGerador = (tenantId: string) => `crono-rev:selgerador:${tenantId}`

type Erro = { message?: string; code?: string }
export const selecaoTabelaAusente = (e: Erro | null | undefined): boolean =>
  !!e && (['42P01', 'PGRST205', '42703', 'PGRST204'].includes(String(e.code)) || /does not exist|could not find the (table|'.*' column)/i.test(e.message ?? ''))

interface Bruto { selecoes: SelecaoGerador[]; conjuntos: ConjuntoRef[] }

async function carregar(svc: SupabaseClient, tenantId: string): Promise<Bruto> {
  let linhas: { meta_chave: string; documento_id: string; parte_id: string | null; rotulo_aluno: string | null; visivel_aluno: boolean | null }[]
  try {
    linhas = await fetchAll(() =>
      svc.from(T_SELECAO).select('meta_chave, documento_id, parte_id, rotulo_aluno, visivel_aluno')
        .eq('tenant_id', tenantId).eq('area', AREA_GERADOR).order('id', { ascending: true }) as never)
  } catch (e) {
    if (selecaoTabelaAusente(e as Erro)) return { selecoes: [], conjuntos: [] }
    throw e
  }
  if (!linhas.length) return { selecoes: [], conjuntos: [] }
  const conj = await fetchAll<{ id: string; disciplina: string; ordem: number | null }>(() =>
    svc.from('simulado_cronograma_conjuntos').select('id, disciplina, ordem').eq('tenant_id', tenantId).eq('deletado', false).order('id', { ascending: true }) as never)
  return {
    selecoes: linhas.map((l) => ({ metaChave: l.meta_chave, documentoId: l.documento_id, parteId: l.parte_id, rotuloAluno: l.rotulo_aluno, visivelAluno: l.visivel_aluno !== false })),
    conjuntos: conj.map((c) => ({ id: c.id, disciplina: c.disciplina, ordem: c.ordem ?? 0 })),
  }
}

/** Índice (disciplina|aula|tipo → seleção) do tenant. Nunca lança: qualquer falha = sem seleção (resolvedor de antes). */
export async function lerIndiceSelecoesGerador(svc: SupabaseClient, tenantId: string): Promise<IndiceSelecoes> {
  try {
    const b = await remember<Bruto>(chaveCacheSelecoesGerador(tenantId), TTL_SEG, () => carregar(svc, tenantId))
    return indexarSelecoes(b.selecoes, b.conjuntos)
  } catch {
    return new Map()
  }
}

export async function esquecerSelecoesGerador(tenantId: string): Promise<void> {
  await esquecer(chaveCacheSelecoesGerador(tenantId)).catch(() => {})
}
