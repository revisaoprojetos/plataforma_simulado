import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'

const SEM_TENANT = '00000000-0000-0000-0000-000000000000'
const nowIso = () => new Date().toISOString()

export type ExportacaoLgpd = {
  gerado_em: string
  titular: {
    id: string
    nome: string | null
    email: string | null
    cpf: string | null
    telefone: string | null
    data_nascimento: string | null
    criado_em: string | null
  }
  matriculas: { plano: string | null; status: string | null; validade: string | null }[]
  simulados: { simulado: string | null; status: string | null; nota: number | null; acertos: number; total: number; iniciado_em: string | null; finalizado_em: string | null }[]
  favoritos: number
  comentarios: number
}

/**
 * Reúne TODOS os dados pessoais do estudante para o direito de ACESSO/PORTABILIDADE (LGPD).
 * Escopado por tenant. Usado tanto pelo self-service do aluno quanto pelo admin.
 */
export async function exportarDadosEstudante(svc: SupabaseClient, estudanteId: string, tenantId: string | null): Promise<ExportacaoLgpd | null> {
  const tid = tenantId ?? SEM_TENANT
  const { data: est } = await svc
    .from('simulado_estudantes')
    .select('id, nome, email, cpf, telefone, data_nascimento, created_at')
    .eq('id', estudanteId).eq('tenant_id', tid).maybeSingle()
  if (!est) return null

  const { data: mats } = await svc.from('simulado_matriculas').select('plano, status, validade').eq('estudante_id', estudanteId).eq('tenant_id', tid)

  const { data: sess } = await svc.from('simulado_sessoes_prova')
    .select('id, simulado_id, status, nota, iniciado_em, finalizado_em')
    .eq('estudante_id', estudanteId).eq('tenant_id', tid).eq('is_teste', false).eq('deletado', false).order('iniciado_em')
  const sessoes = (sess ?? []) as any[]
  const sessIds = sessoes.map((s) => s.id)

  // acertos por sessão + títulos dos simulados
  const acPorSess = new Map<string, number>(), ttPorSess = new Map<string, number>()
  if (sessIds.length) {
    // fetchAllByIn: export LGPD deve ser COMPLETO — titular ativo pode ter >1000 respostas.
    const resp = await fetchAllByIn<{ sessao_id: string; correta: boolean }>(sessIds, (chunk) =>
      svc.from('simulado_respostas_objetivas').select('sessao_id, correta').in('sessao_id', chunk).order('id', { ascending: true }))
    for (const r of resp as any[]) {
      ttPorSess.set(r.sessao_id, (ttPorSess.get(r.sessao_id) ?? 0) + 1)
      if (r.correta) acPorSess.set(r.sessao_id, (acPorSess.get(r.sessao_id) ?? 0) + 1)
    }
  }
  const simTitulo = new Map<string, string>()
  const simIds = [...new Set(sessoes.map((s) => s.simulado_id).filter(Boolean))]
  if (simIds.length) {
    const { data: sims } = await svc.from('simulado_simulados').select('id, titulo').in('id', simIds)
    for (const s of (sims ?? []) as any[]) simTitulo.set(s.id, s.titulo)
  }

  const { count: favoritos } = await svc.from('simulado_favoritos').select('*', { count: 'exact', head: true }).eq('estudante_id', estudanteId).eq('tenant_id', tid)
  const { count: comentarios } = await svc.from('simulado_comentarios_questao').select('*', { count: 'exact', head: true }).eq('autor_id', estudanteId).eq('tenant_id', tid)

  return {
    gerado_em: nowIso(),
    titular: {
      id: (est as any).id,
      nome: (est as any).nome ?? null,
      email: (est as any).email ?? null,
      cpf: (est as any).cpf ?? null,
      telefone: (est as any).telefone ?? null,
      data_nascimento: (est as any).data_nascimento ?? null,
      criado_em: (est as any).created_at ?? null,
    },
    matriculas: (mats ?? []).map((m: any) => ({ plano: m.plano ?? null, status: m.status ?? null, validade: m.validade ?? null })),
    simulados: sessoes.map((s) => ({
      simulado: simTitulo.get(s.simulado_id) ?? null,
      status: s.status ?? null,
      nota: s.nota != null ? Number(s.nota) : null,
      acertos: acPorSess.get(s.id) ?? 0,
      total: ttPorSess.get(s.id) ?? 0,
      iniciado_em: s.iniciado_em ?? null,
      finalizado_em: s.finalizado_em ?? null,
    })),
    favoritos: favoritos ?? 0,
    comentarios: comentarios ?? 0,
  }
}

/**
 * ANONIMIZAÇÃO controlada (direito de exclusão — LGPD art. 18). Substitui os dados
 * pessoais por marcadores; PRESERVA as linhas estatísticas (sessões/respostas) para
 * não corromper notas/ranking da turma, mas desvinculadas de qualquer PII.
 * Idempotente. Retorna false se o estudante não existir no tenant.
 */
export async function anonimizarEstudante(svc: SupabaseClient, estudanteId: string, tenantId: string | null, por?: string | null): Promise<boolean> {
  const tid = tenantId ?? SEM_TENANT
  const { data: est } = await svc.from('simulado_estudantes').select('id').eq('id', estudanteId).eq('tenant_id', tid).maybeSingle()
  if (!est) return false

  const marca = `anon-${estudanteId.slice(0, 8)}`
  const patch: Record<string, unknown> = {
    nome: 'Titular anonimizado',
    email: `${marca}@anonimizado.local`,
    cpf: null,
    telefone: null,
    data_nascimento: null,
    updated_at: nowIso(),
  }
  const { error } = await svc.from('simulado_estudantes').update(patch).eq('id', estudanteId).eq('tenant_id', tid)
  if (error) {
    // Campos tolerantes: se alguma coluna não existir na migração do destino, tenta o núcleo.
    const { error: e2 } = await svc.from('simulado_estudantes').update({ nome: 'Titular anonimizado', email: `${marca}@anonimizado.local`, cpf: null, telefone: null }).eq('id', estudanteId).eq('tenant_id', tid)
    if (e2) return false
  }
  return true
}
