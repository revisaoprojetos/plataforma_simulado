'use server'

/**
 * "Meus cronogramas" — as emissões salvas do aluno.
 *
 * A maior dor do gerador legado era não guardar nada: o aviso em tela dizia que, se o
 * aluno não baixasse o DOCX, perdia o cronograma ao fechar a página. Aqui ele reabre
 * quando quiser, dentro da plataforma.
 *
 * Guardamos o FORMULÁRIO, não a grade montada. A grade tem milhares de linhas e é 100%
 * derivável dele — e, de quebra, se a equipe corrigir uma meta no catálogo, o cronograma
 * do aluno reflete a correção ao reabrir, em vez de ficar congelado num retrato velho.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { verificarAcessoCronograma } from '@/lib/cronograma/acesso'
import { gerarGrade } from '@/lib/cronograma/gerador'
import { mapaTiposMeta } from '@/lib/cronograma/carregar-tipos'
import { indexarLinks } from '@/lib/cronograma/formato-meta'
import type { Grade, LinkAula, MetaFonte, OpcoesGeracao } from '@/lib/cronograma/tipos'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type EmissaoResumo = {
  id: string
  cronograma_id: string
  cronograma_nome: string
  titulo: string | null
  criado_em: string
  arquivada: boolean
  resumo: {
    totalSemanas?: number
    semanasConteudo?: number
    semanasRevisao?: number
    atividades?: number
    conclusao?: string
    subtitulo?: string
  } | null
  formulario: Record<string, unknown> | null
}

const CAMPOS = 'id, cronograma_id, cronograma_nome, titulo, criado_em, arquivada, resumo, formulario'

export type PaginaEmissoes = {
  itens: EmissaoResumo[]
  /** Quantos existem no filtro atual — é o que permite montar a paginação. */
  total: number
  /** Contagens das duas abas, independentes do filtro, para os rótulos não oscilarem. */
  ativas: number
  arquivadas: number
}

/**
 * Uma página das emissões do aluno, com busca no BANCO.
 *
 * Antes a tela pedia as 100 mais recentes e filtrava em memória. Dois problemas: o 101º
 * cronograma não existia para quem o gerou, e a busca só encontrava dentro dessas 100 — quem
 * procurasse por um cronograma antigo receberia "nenhum encontrado" sobre um registro que
 * está no banco. Filtrar e paginar no banco resolve os dois de uma vez.
 *
 * O `count: 'exact'` sai do PostgREST junto com a página, então saber o total não custa uma
 * segunda consulta.
 */
export async function listarMinhasEmissoes(
  opcoes: { busca?: string; pagina?: number; porPagina?: number; arquivadas?: boolean } = {},
): Promise<{ ok: boolean; dados?: PaginaEmissoes; error?: string }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'Sua sessão expirou.' }
  const svc = createAdminClient()

  const porPagina = Math.min(Math.max(opcoes.porPagina ?? 20, 1), 100)
  const pagina = Math.max(opcoes.pagina ?? 0, 0)
  const de = pagina * porPagina
  const busca = (opcoes.busca ?? '').trim()

  const base = () =>
    svc
      .from('simulado_cronograma_emissoes')
      .select(CAMPOS, { count: 'exact' })
      .eq('tenant_id', sessao.tenantId)
      .eq('estudante_id', sessao.estudanteId)

  let q = base().eq('arquivada', !!opcoes.arquivadas)
  if (busca) {
    // Procura no rótulo que o aluno deu E no nome do cronograma: ele lembra de um ou do outro.
    const alvo = `%${busca.replace(/[%_]/g, '')}%`
    q = q.or(`titulo.ilike.${alvo},cronograma_nome.ilike.${alvo}`)
  }

  // As contagens das abas vêm sem o filtro de busca (head: só o total, sem trazer linhas):
  // se oscilassem com a digitação, "Arquivados (2)" viraria "(0)" no meio da busca e pareceria
  // que os arquivados sumiram.
  const [pagina1, nAtivas, nArquivadas] = await Promise.all([
    q.order('criado_em', { ascending: false }).range(de, de + porPagina - 1),
    svc
      .from('simulado_cronograma_emissoes')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', sessao.tenantId)
      .eq('estudante_id', sessao.estudanteId)
      .eq('arquivada', false),
    svc
      .from('simulado_cronograma_emissoes')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', sessao.tenantId)
      .eq('estudante_id', sessao.estudanteId)
      .eq('arquivada', true),
  ])

  if (pagina1.error) return { ok: false, error: pagina1.error.message }
  return {
    ok: true,
    dados: {
      itens: (pagina1.data ?? []) as unknown as EmissaoResumo[],
      total: pagina1.count ?? 0,
      ativas: nAtivas.count ?? 0,
      arquivadas: nArquivadas.count ?? 0,
    },
  }
}

export type EmissaoAberta = {
  emissao: EmissaoResumo
  grade: Grade
  /** O cronograma saiu do ar (despublicado ou excluído) desde a emissão. */
  indisponivel: boolean
}

/**
 * Reabre uma emissão: recalcula a grade a partir do formulário salvo.
 *
 * Se o cronograma tiver sido despublicado ou o acesso revogado, o histórico continua
 * visível mas marcado como indisponível — o aluno não perde o registro do que fez, que é
 * o mesmo princípio do detalhe de simulado concluído.
 */
export async function abrirEmissao(emissaoId: string): Promise<{ ok: boolean; dados?: EmissaoAberta; error?: string }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'Sua sessão expirou.' }
  if (!UUID_RE.test(emissaoId)) return { ok: false, error: 'Cronograma não encontrado.' }
  const svc = createAdminClient()

  const { data: emissao } = await svc
    .from('simulado_cronograma_emissoes')
    .select('id, cronograma_id, cronograma_nome, titulo, criado_em, arquivada, resumo, formulario')
    .eq('id', emissaoId)
    .eq('tenant_id', sessao.tenantId)
    .eq('estudante_id', sessao.estudanteId) // só as próprias
    .maybeSingle()
  if (!emissao) return { ok: false, error: 'Cronograma não encontrado.' }

  const acesso = await verificarAcessoCronograma(svc, sessao.tenantId, sessao.estudanteId, (emissao as any).cronograma_id)

  const { data: cron } = await svc
    .from('simulado_cronogramas')
    .select('id, slug, nome, total_semanas, dias_curso, dias_nome, semanas_revisao, carga_horaria')
    .eq('id', (emissao as any).cronograma_id)
    .eq('tenant_id', sessao.tenantId)
    .eq('deletado', false)
    .maybeSingle()

  if (!cron || !acesso.permitido) {
    return { ok: true, dados: { emissao: emissao as EmissaoResumo, grade: gradeVazia(), indisponivel: true } }
  }

  const metas = await fetchAll<MetaFonte>(() =>
    svc
      .from('simulado_cronograma_metas')
      .select('id, semana, dia, tipo, disciplina, aula, conteudo, duracao, ordem, simulado_id, simulado_externo_nome, simulado_externo_url')
      .eq('tenant_id', sessao.tenantId)
      .eq('cronograma_id', (emissao as any).cronograma_id)
      .order('semana')
      .order('dia')
      .order('ordem')
      .order('id') as any,
  )

  const f = ((emissao as any).formulario ?? {}) as Record<string, any>
  const opcoes: OpcoesGeracao = {
    inicio: f.inicio,
    revisao: f.revisao ?? { ativo: false, cada: 12 },
    recesso: f.recesso ?? { modo: 'nenhum' },
  }

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
    await carregarLinks(svc, sessao.tenantId),
    opcoes,
  )
  if (!r.ok) return { ok: false, error: r.erro }

  return { ok: true, dados: { emissao: emissao as EmissaoResumo, grade: r.grade, indisponivel: false } }
}

export async function renomearEmissao(emissaoId: string, titulo: string): Promise<{ ok: boolean; error?: string }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'Sua sessão expirou.' }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cronograma_emissoes')
    .update({ titulo: titulo.trim() || null, atualizado_em: new Date().toISOString() })
    .eq('id', emissaoId)
    .eq('tenant_id', sessao.tenantId)
    .eq('estudante_id', sessao.estudanteId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/aluno/cronograma')
  return { ok: true }
}

/** Arquivar tira da lista principal sem apagar — o registro de uso é preservado. */
export async function arquivarEmissao(emissaoId: string, arquivada: boolean): Promise<{ ok: boolean; error?: string }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'Sua sessão expirou.' }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cronograma_emissoes')
    .update({ arquivada, atualizado_em: new Date().toISOString() })
    .eq('id', emissaoId)
    .eq('tenant_id', sessao.tenantId)
    .eq('estudante_id', sessao.estudanteId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/aluno/cronograma')
  return { ok: true }
}

function gradeVazia(): Grade {
  return {
    semanas: [],
    resumo: {
      totalSemanas: 0,
      semanasConteudo: 0,
      semanasRevisao: 0,
      semanasRecesso: 0,
      diasPorSemana: 0,
      atividades: 0,
      conclusao: '',
      subtitulo: '',
    },
    avisos: [],
  }
}

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
