import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Monta o bloco normalizado de progressão do estudante no formato "contact/simulado"
 * (inspirado no payload da Guru) — o dispatcher embrulha isso no envelope final.
 */
export async function dadosProgressao(
  svc: SupabaseClient,
  sessao: { id: string; simulado_id: string; estudante_id: string },
  extra?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const [{ data: est }, { data: sim }] = await Promise.all([
    svc.from('simulado_estudantes').select('id, nome, email, cpf, telefone').eq('id', sessao.estudante_id).maybeSingle(),
    svc.from('simulado_simulados').select('id, titulo').eq('id', sessao.simulado_id).maybeSingle(),
  ])
  return {
    contact: {
      id: est?.id ?? sessao.estudante_id,
      name: est?.nome ?? null,
      email: est?.email ?? null,
      doc: est?.cpf ?? null,
      phone_number: est?.telefone ?? null,
    },
    simulado: {
      id: sim?.id ?? sessao.simulado_id,
      name: sim?.titulo ?? null,
    },
    sessao_id: sessao.id,
    ...(extra ?? {}),
  }
}
