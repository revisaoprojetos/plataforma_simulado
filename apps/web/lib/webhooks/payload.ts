import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Bloco `contact` normalizado no MESMO formato da Guru (id/name/email/doc/phone_*),
 * para o payload de saída ficar consistente e completo em TODOS os eventos.
 * Fonte única — usado pelo dispatcher e pelos endpoints que disparam webhooks.
 */
export function contatoEstudante(est: any, fallbackId?: string): Record<string, unknown> {
  return {
    id: est?.id ?? fallbackId ?? null,
    name: est?.nome ?? null,
    email: est?.email ?? null,
    doc: est?.cpf ?? null,                 // CPF (mesmo campo `doc` da Guru)
    phone_number: est?.telefone ?? null,
    phone_local_code: null,                // não separamos DDI/DDD (mantido p/ compat. com o formato Guru)
    plano: est?.classificacao ?? null,     // passaporte | normal — útil p/ filtrar no n8n
  }
}

/** Colunas do estudante necessárias para montar o `contact` completo. */
export const COLS_CONTATO = 'id, nome, email, cpf, telefone, classificacao'

/**
 * Monta o bloco de progressão (contact + simulado + sessao_id) — o dispatcher embrulha
 * no envelope final. Garante `contact` completo (inclui email).
 */
export async function dadosProgressao(
  svc: SupabaseClient,
  sessao: { id: string; simulado_id: string; estudante_id: string },
  extra?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const [{ data: est }, { data: sim }] = await Promise.all([
    svc.from('simulado_estudantes').select(COLS_CONTATO).eq('id', sessao.estudante_id).maybeSingle(),
    svc.from('simulado_simulados').select('id, titulo').eq('id', sessao.simulado_id).maybeSingle(),
  ])
  return {
    contact: contatoEstudante(est, sessao.estudante_id),
    simulado: {
      id: (sim as any)?.id ?? sessao.simulado_id,
      name: (sim as any)?.titulo ?? null,
    },
    sessao_id: sessao.id,
    ...(extra ?? {}),
  }
}
