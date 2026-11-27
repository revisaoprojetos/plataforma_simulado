import 'server-only'
// Loaders servidor da CLASSIFICAÇÃO: catálogo (id + exibição) e regras de uso por área × classificação.
// Cache 30 s por tenant (padrão tipos-conteudo-server.ts); tolera tabela/coluna ausente (migration 16 pendente).
import type { SupabaseClient } from '@supabase/supabase-js'
import { esquecer, remember } from '@/lib/cache/relatorio-cache'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { tabelaTiposAusente } from '@/lib/cronograma/tipos-conteudo-server'
import type { PapelTipo } from '@/lib/cronograma/tipos-conteudo-tipos'
import { lerExibicao, lerRegrasParciais, type ExibicaoClassificacao, type RegrasOverride } from './esquema'

const TTL_SEG = 30
const chaveCat = (t: string) => `conteudo-class:cat:${t}`
const chaveUso = (t: string, area: string) => `conteudo-class:uso:${t}:${area}`
const chavesUsoPorTenant = new Map<string, Set<string>>()

type Erro = { message?: string; code?: string }

export interface ClassificacaoCatalogo {
  id: string
  slug: string
  nome: string
  nomeAluno: string
  cor: string | null
  papel: PapelTipo | null
  ativo: boolean
  sistema: boolean
  /** Defaults se a coluna `exibicao` ainda não existe / está vazia. */
  exibicao: ExibicaoClassificacao
}

interface LinhaCat {
  id: string; slug: string; nome: string; nome_aluno: string | null; cor: string | null
  papel: PapelTipo | null; ativo: boolean | null; sistema: boolean | null; exibicao?: unknown
}

/** Catálogo do tenant com `id` (só linhas do banco; tipos de sistema sem linha não aparecem). [] se a tabela não existe. */
export async function carregarCatalogoClassificacao(svc: SupabaseClient, tenantId: string): Promise<ClassificacaoCatalogo[]> {
  return remember<ClassificacaoCatalogo[]>(chaveCat(tenantId), TTL_SEG, async () => {
    const base = 'id, slug, nome, nome_aluno, cor, papel, ativo, sistema'
    const ler = (sel: string) => fetchAll<LinhaCat>(() =>
      svc.from('simulado_conteudo_tipos').select(sel).eq('tenant_id', tenantId).order('id', { ascending: true }) as never)
    let linhas: LinhaCat[]
    try {
      linhas = await ler(`${base}, exibicao`)
    } catch (e) {
      if (!tabelaTiposAusente(e as Erro)) throw e
      try { linhas = await ler(base) } catch (e2) {
        if (tabelaTiposAusente(e2 as Erro)) return []
        throw e2
      }
    }
    return linhas.map((l) => ({
      id: l.id, slug: l.slug, nome: l.nome, nomeAluno: l.nome_aluno || l.nome, cor: l.cor, papel: l.papel,
      ativo: l.ativo !== false, sistema: !!l.sistema, exibicao: lerExibicao(l.exibicao),
    }))
  })
}

export interface RegrasUsoDaArea {
  classificacaoId: string
  regras: RegrasOverride
  versao: number
}

/** Regras de uso da ÁREA por classificação (Map classificacaoId → regras parciais). Vazio se a tabela não existe. */
export async function carregarRegrasUsoDaArea(svc: SupabaseClient, tenantId: string, area: string): Promise<Map<string, RegrasUsoDaArea>> {
  const chave = chaveUso(tenantId, area)
  let set = chavesUsoPorTenant.get(tenantId)
  if (!set) { set = new Set(); chavesUsoPorTenant.set(tenantId, set) }
  set.add(chave)
  const lista = await remember<RegrasUsoDaArea[]>(chave, TTL_SEG, async () => {
    try {
      const rows = await fetchAll<{ classificacao_id: string; regras: unknown; versao: number | null }>(() =>
        svc.from('simulado_conteudo_regras_uso').select('classificacao_id, regras, versao')
          .eq('tenant_id', tenantId).eq('area', area).order('classificacao_id', { ascending: true }) as never)
      return rows.map((r) => ({ classificacaoId: r.classificacao_id, regras: lerRegrasParciais(r.regras), versao: r.versao ?? 1 }))
    } catch (e) {
      if (tabelaTiposAusente(e as Erro)) return []
      throw e
    }
  })
  return new Map(lista.map((r) => [r.classificacaoId, r] as const))
}

/** Invalida catálogo + regras de uso (áreas já carregadas nesta instância) do tenant. Chamar nos savers. */
export async function esquecerClassificacao(tenantId: string): Promise<void> {
  const chaves = [chaveCat(tenantId), ...(chavesUsoPorTenant.get(tenantId) ?? [])]
  chavesUsoPorTenant.delete(tenantId)
  await Promise.all(chaves.map((c) => esquecer(c)))
}
