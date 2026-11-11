'use server'
import type { ResultadoGeracao } from './actions-tipos'

/**
 * Geração do cronograma pelo aluno.
 *
 * O guard é `getSessaoAluno()` — o portal do aluno usa sessão própria (JWT em cookie),
 * separada do Supabase Auth do admin. Não há middleware: cada action repete o guard.
 *
 * O tenant vem da SESSÃO, não de `getCurrentTenantId()`: dentro de iframe (Curseduca) a
 * resolução por host falha, e a sessão é a fonte confiável.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { verificarAcessoCronograma } from '@/lib/cronograma/acesso'
import { montarGradePadrao, CAMPOS_CRONOGRAMA } from '@/lib/cronograma/montar-grade-padrao'
import { colunaAusente, lerVersaoGrade } from '@/lib/cronograma/compat-legado'
import { dataISOValida } from '@/lib/cronograma/integridade'
import type { OpcoesGeracao } from '@/lib/cronograma/tipos'

/**
 * Monta a grade e registra a emissão.
 *
 * A grade também é calculada no cliente (o motor é puro), mas passar pelo servidor aqui
 * garante que o registro de uso exista mesmo se o navegador for fechado logo depois, e
 * que o resultado venha do catálogo atual — não de um estado velho da aba.
 */
// JSON canônico (chaves ordenadas): o jsonb do Postgres reordena as chaves ao devolver.
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : x))

export async function gerarCronograma(
  cronogramaId: string,
  opcoes: OpcoesGeracao,
  formulario: { nome: string; paleta: string; semDatas?: boolean },
  /** false = só monta a grade para PRÉVIA, sem gravar a emissão na conta. */
  salvar = true,
): Promise<ResultadoGeracao> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'Sua sessão expirou. Entre novamente.' }

  // Datas precisam existir no calendário (parseISO lançaria 500 em "2026-02-31").
  if (!dataISOValida(opcoes.inicio)) return { ok: false, error: 'Data de início inválida.' }
  if ((opcoes.recesso?.de && !dataISOValida(opcoes.recesso.de)) || (opcoes.recesso?.ate && !dataISOValida(opcoes.recesso.ate))) {
    return { ok: false, error: 'Datas de recesso inválidas.' }
  }

  const svc = createAdminClient()
  const acesso = await verificarAcessoCronograma(svc, sessao.tenantId, sessao.estudanteId, cronogramaId)
  if (!acesso.permitido) return { ok: false, error: 'Você não tem acesso a este cronograma.', semAcesso: true }

  const { data: cron } = await svc
    .from('simulado_cronogramas')
    .select(CAMPOS_CRONOGRAMA)
    .eq('id', cronogramaId)
    .eq('tenant_id', sessao.tenantId)
    .eq('deletado', false)
    .maybeSingle()
  if (!cron) return { ok: false, error: 'Cronograma não encontrado.' }

  // Versão da grade lida ANTES de montar: se o admin mexer no meio, a emissão nasce marcada como
  // desatualizada (nunca o contrário). null = migration 20261114020000 ainda não aplicada.
  const versaoGrade = salvar ? await lerVersaoGrade(svc, sessao.tenantId, cronogramaId) : null

  // Leitura dos dados do admin (metas, tipos, links, questões) numa fonte única — a mesma da reabertura.
  const r = await montarGradePadrao(svc, sessao.tenantId, cron, opcoes)
  if (!r.ok) return { ok: false, error: r.erro }

  /**
   * Emissão: falhar o registro não pode impedir o aluno de ver a grade — mas também não pode
   * passar em silêncio, que foi o que aconteceu.
   *
   * O bloco era um try/catch lendo só `data`. O cliente do Supabase NÃO lança: devolve
   * { data: null, error }. Então o catch nunca rodava, o `error` nunca era lido, e um CHECK
   * recusando via_acesso='pacote' deixou a tabela em ZERO linhas sem um aviso sequer — bem no
   * recurso que justificava trazer o gerador para a plataforma. Agora o erro é lido, vai para o
   * log do servidor e sobe para a tela.
   */
  let emissaoId: string | null = null
  let erroAoSalvar: string | undefined
  if (salvar) {
    // Duplo clique / reenvio: mesma emissão (aluno + cronograma + mesmo formulário) criada nos últimos 30s → reaproveita.
    const formularioFinal = { ...opcoes, ...formulario }
    const { data: recente } = await svc
      .from('simulado_cronograma_emissoes')
      .select('id, formulario')
      .eq('tenant_id', sessao.tenantId)
      .eq('estudante_id', sessao.estudanteId)
      .eq('cronograma_id', cronogramaId)
      .gte('criado_em', new Date(Date.now() - 30_000).toISOString())
      .order('criado_em', { ascending: false })
      .limit(5)
    const dup = ((recente ?? []) as { id: string; formulario: unknown }[]).find((e) => canon(e.formulario) === canon(formularioFinal))
    if (dup) return { ok: true, grade: r.grade, emissaoId: dup.id, erroAoSalvar: undefined }
    const linhaEmissao = {
      tenant_id: sessao.tenantId,
      cronograma_id: cronogramaId,
      cronograma_slug: (cron as any).slug,
      cronograma_nome: (cron as any).nome,
      estudante_id: sessao.estudanteId,
      estudante_nome: sessao.nome,
      ator_tipo: 'estudante',
      ator_id: sessao.estudanteId,
      via_acesso: acesso.via,
      titulo: formulario.nome?.trim() || null,
      formulario: formularioFinal,
      resumo: r.grade.resumo,
      is_teste: acesso.via === 'testador',
    }
    // CONGELA o calendário (datas das semanas) + a versão da grade. Coluna ausente => grava sem (comportamento antigo).
    const inserir = (linha: Record<string, unknown>) => svc.from('simulado_cronograma_emissoes').insert(linha).select('id').single()
    let { data, error } = await inserir(versaoGrade != null ? { ...linhaEmissao, versao_grade: versaoGrade, grade_snapshot: r.calendario } : linhaEmissao)
    if (error && versaoGrade != null && colunaAusente(error)) ({ data, error } = await inserir(linhaEmissao))
    if (error) {
      console.error('[cronograma] emissão NÃO gravada:', error.message)
      erroAoSalvar = error.message
    } else {
      emissaoId = (data as { id: string } | null)?.id ?? null
    }
  }

  return { ok: true, grade: r.grade, emissaoId, erroAoSalvar }
}

/**
 * Quais simulados internos citados na grade o aluno pode acessar.
 *
 * A meta de simulado aparece na grade de qualquer forma; sem matrícula, ela vem marcada
 * como sem acesso, com o convite a falar com o suporte — em vez de sumir e dois alunos
 * verem cronogramas diferentes.
 */
export async function acessoAosSimulados(ids: string[]): Promise<Record<string, boolean>> {
  const sessao = await getSessaoAluno()
  if (!sessao || !ids.length) return {}
  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_matriculas')
    .select('simulado_id, liberado, status')
    .eq('tenant_id', sessao.tenantId)
    .eq('estudante_id', sessao.estudanteId)
    .in('simulado_id', ids.slice(0, 200))
  const mapa: Record<string, boolean> = {}
  for (const id of ids) mapa[id] = false
  for (const m of (data ?? []) as any[]) {
    if ((!m.status || m.status === 'ativa') && m.liberado !== false) mapa[m.simulado_id] = true
  }
  return mapa
}
