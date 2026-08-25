'use server'

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
import { fetchAll } from '@/lib/supabase/fetch-all'
import { verificarAcessoCronograma } from '@/lib/cronograma/acesso'
import { indexarLinks } from '@/lib/cronograma/formato-meta'
import { gerarGrade } from '@/lib/cronograma/gerador'
import { mapaTiposMeta } from '@/lib/cronograma/carregar-tipos'
import type { Grade, LinkAula, MetaFonte, OpcoesGeracao } from '@/lib/cronograma/tipos'

export type ResultadoGeracao =
  | { ok: true; grade: Grade; emissaoId: string | null; erroAoSalvar?: string }
  | { ok: false; error: string; semAcesso?: boolean }

/**
 * Monta a grade e registra a emissão.
 *
 * A grade também é calculada no cliente (o motor é puro), mas passar pelo servidor aqui
 * garante que o registro de uso exista mesmo se o navegador for fechado logo depois, e
 * que o resultado venha do catálogo atual — não de um estado velho da aba.
 */
export async function gerarCronograma(
  cronogramaId: string,
  opcoes: OpcoesGeracao,
  formulario: { nome: string; paleta: string },
): Promise<ResultadoGeracao> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'Sua sessão expirou. Entre novamente.' }

  const svc = createAdminClient()
  const acesso = await verificarAcessoCronograma(svc, sessao.tenantId, sessao.estudanteId, cronogramaId)
  if (!acesso.permitido) return { ok: false, error: 'Você não tem acesso a este cronograma.', semAcesso: true }

  const { data: cron } = await svc
    .from('simulado_cronogramas')
    .select('id, slug, nome, total_semanas, dias_curso, dias_nome, semanas_revisao, carga_horaria')
    .eq('id', cronogramaId)
    .eq('tenant_id', sessao.tenantId)
    .eq('deletado', false)
    .maybeSingle()
  if (!cron) return { ok: false, error: 'Cronograma não encontrado.' }

  // fetchAll obrigatório: o maior cronograma real tem 1.142 metas e um select cru
  // devolveria 1.000, truncando em silêncio — a grade chegaria sem as últimas semanas.
  const metas = await fetchAll<MetaFonte>(() =>
    svc
      .from('simulado_cronograma_metas')
      .select('id, semana, dia, tipo, disciplina, aula, conteudo, duracao, ordem, simulado_id, simulado_externo_nome, simulado_externo_url')
      .eq('tenant_id', sessao.tenantId)
      .eq('cronograma_id', cronogramaId)
      .order('semana')
      .order('dia')
      .order('ordem')
      .order('id') as any,
  )

  const links = await carregarLinks(svc, sessao.tenantId)
  const r = gerarGrade(
    {
      ...(cron as any),
      carga_horaria: Number((cron as any).carga_horaria),
      dias_curso: (cron as any).dias_curso ?? [],
      dias_nome: (cron as any).dias_nome ?? [],
      semanas_revisao: (cron as any).semanas_revisao ?? [],
    },
    metas,
    await mapaTiposMeta(sessao.tenantId),
    links,
    opcoes,
  )
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
  {
    const { data, error } = await svc
      .from('simulado_cronograma_emissoes')
      .insert({
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
        formulario: { ...opcoes, ...formulario },
        resumo: r.grade.resumo,
        is_teste: acesso.via === 'testador',
      })
      .select('id')
      .single()
    if (error) {
      console.error('[cronograma] emissão NÃO gravada:', error.message)
      erroAoSalvar = error.message
    } else {
      emissaoId = (data as { id: string } | null)?.id ?? null
    }
  }

  return { ok: true, grade: r.grade, emissaoId, erroAoSalvar }
}

/** Links de aula do tenant, já indexados pela chave (disciplina, aula). */
async function carregarLinks(svc: any, tenantId: string) {
  const [aulas, urls, plataformas] = await Promise.all([
    fetchAll<{ id: string; disciplina: string; aula: string; tema: string | null }>(() =>
      svc.from('simulado_cronograma_links').select('id, disciplina, aula, tema').eq('tenant_id', tenantId).order('id') as any,
    ),
    fetchAll<{ link_id: string; plataforma_id: string; url: string }>(() =>
      svc.from('simulado_cronograma_aula_links').select('link_id, plataforma_id, url').eq('tenant_id', tenantId).order('id') as any,
    ),
    fetchAll<{ id: string; nome: string; slug: string; cor: string | null; ordem: number }>(() =>
      svc.from('simulado_cronograma_plataformas').select('id, nome, slug, cor, ordem').eq('tenant_id', tenantId).eq('ativo', true).order('ordem') as any,
    ),
  ])

  const porId = new Map(plataformas.map((p) => [p.id, p]))
  const urlsPorLink = new Map<string, { plataforma: any; url: string }[]>()
  for (const u of urls) {
    const p = porId.get(u.plataforma_id)
    if (!p) continue
    const lista = urlsPorLink.get(u.link_id)
    if (lista) lista.push({ plataforma: p, url: u.url })
    else urlsPorLink.set(u.link_id, [{ plataforma: p, url: u.url }])
  }

  const lista: LinkAula[] = aulas.map((a) => ({
    disciplina: a.disciplina,
    aula: a.aula,
    tema: a.tema,
    urls: urlsPorLink.get(a.id) ?? [],
  }))
  return indexarLinks(lista)
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
