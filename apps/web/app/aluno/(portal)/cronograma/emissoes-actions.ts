'use server'
import type { EmissaoResumo, PaginaEmissoes, EmissaoAberta } from './emissoes-actions-tipos'

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
import { emissaoEhFixada, promoverProximoFixado } from '@/lib/cronograma/fixar'
import { montarEmissao } from '@/lib/cronograma/montar-emissao'
import { regenerarEmissaoDoAluno } from '@/lib/cronograma/regenerar-emissao'
import { lerProgressoReencaixado } from '@/lib/cronograma/progresso-emissao'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CAMPOS = 'id, cronograma_id, cronograma_nome, titulo, criado_em, arquivada, resumo, formulario'

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

/**
 * Reabre uma emissão: recalcula a grade a partir do formulário salvo (miolo em lib/cronograma/montar-emissao.ts,
 * compartilhado com a rota do iframe — que já tem a sessão e não precisa reabrir tudo via server action).
 *
 * Se o cronograma tiver sido despublicado ou o acesso revogado, o histórico continua
 * visível mas marcado como indisponível — o aluno não perde o registro do que fez, que é
 * o mesmo princípio do detalhe de simulado concluído.
 */
export async function abrirEmissao(emissaoId: string): Promise<{ ok: boolean; dados?: EmissaoAberta; error?: string }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'Sua sessão expirou.' }
  return montarEmissao(emissaoId, sessao.tenantId, sessao.estudanteId)
}

/**
 * Caminho do RENDER: o Gotenberg busca a página de impressão sem cookie nenhum, com um token
 * HMAC de vida curta que o web assinou. Quem chama já verificou a assinatura — aqui só o
 * tenant e o id do token entram, e nunca um id vindo cru da URL.
 */
export async function abrirEmissaoParaRender(
  emissaoId: string,
  tenantId: string,
): Promise<{ ok: boolean; dados?: EmissaoAberta; error?: string }> {
  return montarEmissao(emissaoId, tenantId)
}

/** Metas concluídas de uma emissão, para o render por token (sem sessão do aluno). */
export async function checksParaRender(emissaoId: string, tenantId: string): Promise<Record<string, string>> {
  const svc = createAdminClient()
  const { data: em } = await svc.from('simulado_cronograma_emissoes').select('cronograma_id').eq('id', emissaoId).eq('tenant_id', tenantId).maybeSingle()
  const cronogramaId = (em as { cronograma_id?: string } | null)?.cronograma_id
  if (!cronogramaId) return {}
  // Reencaixa por chave estável (metas recriadas) — mesma leitura de listarChecks.
  const linhas = await lerProgressoReencaixado<{ marcada_em: string }>(svc, tenantId, cronogramaId, emissaoId, 'simulado_cronograma_meta_checks', 'marcada_em')
  const mapa: Record<string, string> = {}
  for (const l of linhas) mapa[l.meta_id] = l.marcada_em
  return mapa
}

/**
 * Gera de novo uma emissão marcada como `desatualizada`: cria uma NOVA emissão a partir do mesmo
 * formulário (grade e calendário frescos) e migra checks/notas — pela meta_id quando ela ainda
 * existe, ou pela chave estável (`chave_meta`) quando a meta foi recriada. A emissão antiga é
 * mantida intacta (o aluno pode arquivá-la). Nada é alterado em silêncio: só roda por ação explícita.
 */
export async function regenerarEmissao(emissaoId: string): Promise<{ ok: boolean; emissaoId?: string; reaproveitada?: boolean; migradas?: { checks: number; notas: number }; error?: string }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'Sua sessão expirou.' }
  const r = await regenerarEmissaoDoAluno(sessao, emissaoId)
  if (r.ok) revalidatePath('/aluno/cronograma')
  return r
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
  // Arquivar a emissão FIXADA tira o foco dela e promove a mais recente restante (qualquer tipo).
  const eraFixada = arquivada && UUID_RE.test(emissaoId) ? await emissaoEhFixada(svc, sessao.tenantId, emissaoId) : false
  const { error } = await svc
    .from('simulado_cronograma_emissoes')
    .update({ arquivada, ...(eraFixada ? { fixado: false } : {}), atualizado_em: new Date().toISOString() })
    .eq('id', emissaoId)
    .eq('tenant_id', sessao.tenantId)
    .eq('estudante_id', sessao.estudanteId)
  if (error) return { ok: false, error: error.message }
  if (eraFixada) await promoverProximoFixado(svc, sessao.tenantId, sessao.estudanteId)
  revalidatePath('/aluno/cronograma')
  return { ok: true }
}

/** APAGA de vez a emissão (marcações e notas caem por ON DELETE CASCADE). Sem volta. Se era a fixada, promove outro plano. */
export async function apagarEmissao(emissaoId: string): Promise<{ ok: boolean; error?: string; eraFixada?: boolean }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'Sua sessão expirou.' }
  if (!UUID_RE.test(emissaoId)) return { ok: false, error: 'Cronograma inválido.' }
  const svc = createAdminClient()
  const eraFixada = await emissaoEhFixada(svc, sessao.tenantId, emissaoId)
  const { data, error } = await svc
    .from('simulado_cronograma_emissoes')
    .delete()
    .eq('id', emissaoId)
    .eq('tenant_id', sessao.tenantId)
    .eq('estudante_id', sessao.estudanteId)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: 'Cronograma não encontrado.' }
  if (eraFixada) await promoverProximoFixado(svc, sessao.tenantId, sessao.estudanteId)
  revalidatePath('/aluno/cronograma')
  return { ok: true, eraFixada }
}
