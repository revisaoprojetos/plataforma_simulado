'use server'

/**
 * Relatórios do cronograma — emissões e andamento.
 *
 * Tudo vem de RPC agregada. Emissões e checks crescem por ALUNO, e a plataforma tem ~14 mil:
 * contar na aplicação esbarraria no teto de 1.000 linhas do PostgREST, que é a armadilha que
 * este módulo já pagou duas vezes (contagem de metas do catálogo e tela de pacotes).
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'

// Mesmo formato das outras telas do módulo — quem vê o catálogo vê os relatórios.
async function guard() {
  if (!(await checkPermission('cronogramas:view'))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId }
}

export type Geral = {
  emissoes: number
  alunos: number
  cronogramas_usados: number
  concluidas: number
  planejadas: number
  emissoes_7d: number
  emissoes_30d: number
  alunos_30d: number
}

export type LinhaAluno = {
  estudante_id: string
  nome: string
  email: string | null
  emissoes: number
  ultima: string
  concluidas: number
  planejadas: number
  total_linhas: number
}

export type LinhaCronograma = {
  cronograma_id: string
  nome: string
  carga_horaria: number | null
  emissoes: number
  alunos: number
  concluidas: number
  planejadas: number
}

export type LinhaDia = { dia: string; emissoes: number; concluidas: number }

export type DadosRelatorio = {
  geral: Geral
  alunos: LinhaAluno[]
  cronogramas: LinhaCronograma[]
  dias: LinhaDia[]
}

const ZERO: Geral = {
  emissoes: 0, alunos: 0, cronogramas_usados: 0, concluidas: 0,
  planejadas: 0, emissoes_7d: 0, emissoes_30d: 0, alunos_30d: 0,
}

/** Converte os bigint que o PostgREST devolve como number|string. */
function n(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0)
}

export async function carregarRelatorio(dias = 30): Promise<{ ok: boolean; dados?: DadosRelatorio; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const [geral, alunos, cronogramas, serie] = await Promise.all([
    svc.rpc('simulado_cronograma_relatorio_geral', { p_tenant: g.tenantId }),
    svc.rpc('simulado_cronograma_relatorio_alunos', { p_tenant: g.tenantId, p_limite: 50, p_offset: 0 }),
    svc.rpc('simulado_cronograma_relatorio_por_cronograma', { p_tenant: g.tenantId }),
    svc.rpc('simulado_cronograma_relatorio_por_dia', { p_tenant: g.tenantId, p_dias: dias }),
  ])

  const erro = geral.error ?? alunos.error ?? cronogramas.error ?? serie.error
  if (erro) return { ok: false, error: erro.message }

  const bruto = (geral.data ?? [])[0] as Record<string, unknown> | undefined
  return {
    ok: true,
    dados: {
      geral: bruto
        ? {
            emissoes: n(bruto.emissoes),
            alunos: n(bruto.alunos),
            cronogramas_usados: n(bruto.cronogramas_usados),
            concluidas: n(bruto.concluidas),
            planejadas: n(bruto.planejadas),
            emissoes_7d: n(bruto.emissoes_7d),
            emissoes_30d: n(bruto.emissoes_30d),
            alunos_30d: n(bruto.alunos_30d),
          }
        : ZERO,
      alunos: ((alunos.data ?? []) as Record<string, unknown>[]).map((a) => ({
        estudante_id: String(a.estudante_id),
        nome: String(a.nome ?? ''),
        email: (a.email as string | null) ?? null,
        emissoes: n(a.emissoes),
        ultima: String(a.ultima),
        concluidas: n(a.concluidas),
        planejadas: n(a.planejadas),
        total_linhas: n(a.total_linhas),
      })),
      cronogramas: ((cronogramas.data ?? []) as Record<string, unknown>[]).map((c) => ({
        cronograma_id: String(c.cronograma_id),
        nome: String(c.nome ?? ''),
        carga_horaria: c.carga_horaria == null ? null : n(c.carga_horaria),
        emissoes: n(c.emissoes),
        alunos: n(c.alunos),
        concluidas: n(c.concluidas),
        planejadas: n(c.planejadas),
      })),
      dias: ((serie.data ?? []) as Record<string, unknown>[]).map((d) => ({
        dia: String(d.dia),
        emissoes: n(d.emissoes),
        concluidas: n(d.concluidas),
      })),
    },
  }
}

/** Página seguinte / busca na lista de alunos — a tela nunca traz os 14 mil de uma vez. */
export async function buscarAlunosRelatorio(
  busca: string,
  pagina: number,
  porPagina = 50,
): Promise<{ ok: boolean; itens?: LinhaAluno[]; total?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const { data, error } = await svc.rpc('simulado_cronograma_relatorio_alunos', {
    p_tenant: g.tenantId,
    p_busca: busca.trim() || null,
    p_limite: porPagina,
    p_offset: Math.max(0, pagina) * porPagina,
  })
  if (error) return { ok: false, error: error.message }

  const linhas = ((data ?? []) as Record<string, unknown>[]).map((a) => ({
    estudante_id: String(a.estudante_id),
    nome: String(a.nome ?? ''),
    email: (a.email as string | null) ?? null,
    emissoes: n(a.emissoes),
    ultima: String(a.ultima),
    concluidas: n(a.concluidas),
    planejadas: n(a.planejadas),
    total_linhas: n(a.total_linhas),
  }))
  return { ok: true, itens: linhas, total: linhas[0]?.total_linhas ?? 0 }
}
