import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import * as vc from './client'
import { acessoVigente } from './puro'

/**
 * Acesso a dados do Vídeo próprio (service role real — createAdminClient — com filtro explícito por tenant).
 * Leituras são TOLERANTES: se a migration 20261110010000 ainda não foi aplicada, devolvem null/vazio.
 */

type Svc = ReturnType<typeof createAdminClient>

export interface Empresa { slug: string; ativo: boolean }

export async function carregarEmpresa(tenantId: string, svc: Svc = createAdminClient()): Promise<Empresa | null> {
  try {
    const { data, error } = await svc.from('video_empresas').select('slug, ativo').eq('tenant_id', tenantId).maybeSingle()
    if (error || !data) return null
    return { slug: data.slug as string, ativo: !!data.ativo }
  } catch { return null }
}

export interface AulaRow {
  id: string; tenant_id: string; curso_id: string; titulo: string; pasta_id: string | null; ordem: number
  lesson_id: string; video_id: string | null; status: string; duracao_s: number | null; erro: string | null
  criado_em: string; atualizado_em: string; deletado_em: string | null
}
export const COLS_AULA = 'id, tenant_id, curso_id, titulo, pasta_id, ordem, lesson_id, video_id, status, duracao_s, erro, criado_em, atualizado_em, deletado_em'

export async function carregarAula(tenantId: string, aulaId: string, svc: Svc = createAdminClient()): Promise<AulaRow | null> {
  try {
    const { data } = await svc.from('video_aulas').select(COLS_AULA).eq('id', aulaId).eq('tenant_id', tenantId).is('deletado_em', null).maybeSingle()
    return (data as AulaRow | null) ?? null
  } catch { return null }
}

/** Garante o curso "Acervo" do tenant no serviço (curso+módulo) e a linha em video_cursos. Race-safe (índice único). */
export async function garantirCursoAcervo(tenantId: string, slug: string, svc: Svc = createAdminClient()): Promise<{ id: string; courseId: string; moduleId: string }> {
  const ler = async () => {
    const { data } = await svc.from('video_cursos').select('id, course_id, module_id').eq('tenant_id', tenantId).is('produto_id', null).maybeSingle()
    return data as { id: string; course_id: string; module_id: string | null } | null
  }
  const existente = await ler()
  if (existente?.module_id) return { id: existente.id, courseId: existente.course_id, moduleId: existente.module_id }

  const curso = await vc.criarCurso(slug, 'Acervo de vídeos')
  const modulo = await vc.criarModulo(slug, curso.id, 'Vídeos')
  const { error } = await svc.from('video_cursos').insert({ tenant_id: tenantId, course_id: curso.id, module_id: modulo.id, produto_id: null, titulo: 'Acervo' })
  if (error) {
    // outra requisição criou primeiro (índice único) — usa a vencedora (o curso órfão no serviço é inofensivo).
    const vencedora = await ler()
    if (vencedora?.module_id) return { id: vencedora.id, courseId: vencedora.course_id, moduleId: vencedora.module_id }
    throw new Error(`video_cursos: ${error.message}`)
  }
  const criada = await ler()
  if (!criada?.module_id) throw new Error('video_cursos: linha não encontrada após criar')
  return { id: criada.id, courseId: criada.course_id, moduleId: criada.module_id }
}

/** Próxima aula PRONTA do mesmo curso/pasta (ordem maior). Uma query. */
export async function proximaAulaId(tenantId: string, aula: AulaRow, svc: Svc = createAdminClient()): Promise<string | null> {
  try {
    let q = svc.from('video_aulas').select('id').eq('tenant_id', tenantId).eq('curso_id', aula.curso_id)
      .eq('status', 'pronta').is('deletado_em', null).gt('ordem', aula.ordem)
    q = aula.pasta_id ? q.eq('pasta_id', aula.pasta_id) : q.is('pasta_id', null)
    const { data } = await q.order('ordem', { ascending: true }).order('id', { ascending: true }).limit(1)
    return (data?.[0]?.id as string | undefined) ?? null
  } catch { return null }
}

/** Gate NOSSO (antes de chamar o serviço): o aluno tem matrícula sincronizada e vigente neste curso? */
export async function alunoTemAcessoAoCurso(tenantId: string, estudanteId: string, cursoId: string, svc: Svc = createAdminClient()): Promise<boolean> {
  try {
    const { data } = await svc.from('video_matriculas_sync')
      .select('acao, estado, inicio_em, fim_em')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('curso_id', cursoId)
      .eq('acao', 'enroll').eq('estado', 'sincronizado').limit(50)
    return acessoVigente((data ?? []).map((r: any) => ({ acao: r.acao, estado: r.estado, inicioEm: r.inicio_em, fimEm: r.fim_em })), new Date())
  } catch { return false }
}
