import 'server-only'

/**
 * Loaders LEVES do cronograma PADRÃO (Revisão) para a lista "Meus cronogramas" / "Modelos"
 * (consumidos pelo page.tsx). Só leitura; nada de cálculo de grade.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { cronogramasDoAluno } from './acesso'

export type ModeloResumo = {
  id: string
  titulo: string
  descricao?: string
  /** Horas de estudo por dia. */
  carga?: number
  /** Semanas de conteúdo cadastradas no modelo (sem revisões/recesso do aluno). */
  semanas?: number
  /** Quantidade de metas do modelo (contagem head — não traz linhas). null = não calculado. */
  metas: number | null
}

export type EmissaoResumoLista = {
  id: string
  titulo: string
  criadoEm: string
  atualizadoEm: string
  arquivada: boolean
  fixado: boolean
}

const MAX_CONTAGENS = 40

/**
 * Modelos que o aluno pode usar (acesso resolvido por cronogramasDoAluno: testador/pacote/matrícula/avulso).
 * Módulo desligado no tenant ⇒ []. A contagem de metas é uma consulta `head` por modelo, em paralelo
 * (sem trazer linhas); acima de 40 modelos o excedente fica com metas=null.
 */
export async function listarModelosParaAluno(tenantId: string, estudanteId: string): Promise<ModeloResumo[]> {
  const svc = createAdminClient()
  const { data: cfg } = await svc.from('simulado_cronograma_config').select('ativo').eq('tenant_id', tenantId).maybeSingle()
  if (!(cfg as { ativo?: boolean } | null)?.ativo) return []

  const modelos = await cronogramasDoAluno(svc, tenantId, estudanteId)
  const contagens = await Promise.all(
    modelos.map(async (m, i) => {
      if (i >= MAX_CONTAGENS) return null
      const { count } = await svc
        .from('simulado_cronograma_metas')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('cronograma_id', m.id)
      return count ?? 0
    }),
  )
  return modelos.map((m, i) => ({
    id: m.id,
    titulo: m.nome,
    descricao: m.subtitulo ?? undefined,
    carga: m.carga_horaria,
    semanas: m.total_semanas,
    metas: contagens[i],
  }))
}

/** Emissões salvas do aluno (ativas ou arquivadas), mais recentes primeiro. Paginação no banco. */
export async function listarEmissoesResumo(
  tenantId: string,
  estudanteId: string,
  opcoes: { arquivadas?: boolean; limite?: number } = {},
): Promise<EmissaoResumoLista[]> {
  const svc = createAdminClient()
  const lim = Math.min(Math.max(opcoes.limite ?? 100, 1), 100)
  const consulta = (campos: string) => svc
    .from('simulado_cronograma_emissoes')
    .select(campos)
    .eq('tenant_id', tenantId)
    .eq('estudante_id', estudanteId)
    .eq('arquivada', !!opcoes.arquivadas)
    .order('criado_em', { ascending: false })
    .order('id')
    .range(0, lim - 1)
  // A coluna fixado vem da migração 20261114010000; sem ela, repete a consulta sem a coluna.
  let r = await consulta('id, titulo, cronograma_nome, criado_em, atualizado_em, arquivada, fixado')
  if (r.error) r = await consulta('id, titulo, cronograma_nome, criado_em, atualizado_em, arquivada')
  return ((r.data ?? []) as any[]).map((e) => ({
    id: e.id,
    titulo: e.titulo || e.cronograma_nome,
    criadoEm: e.criado_em,
    atualizadoEm: e.atualizado_em ?? e.criado_em,
    arquivada: !!e.arquivada,
    fixado: !!e.fixado,
  }))
}
