'use server'

import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { exportarDadosEstudante, type ExportacaoLgpd } from '@/lib/lgpd/dados'

/** Exporta os dados do próprio aluno (direito de acesso/portabilidade). Instantâneo. */
export async function exportarMeusDados(): Promise<{ ok?: boolean; error?: string; dados?: ExportacaoLgpd }> {
  const s = await getSessaoAluno()
  if (!s) return { error: 'Sessão expirada. Entre novamente.' }
  const svc = createAdminClient()
  const dados = await exportarDadosEstudante(svc, s.estudanteId, s.tenantId)
  if (!dados) return { error: 'Não foi possível reunir seus dados.' }
  return { ok: true, dados }
}

/** Status da solicitação de exclusão do próprio aluno (se houver). Tolerante à ausência da tabela. */
export async function minhaSolicitacaoExclusao(): Promise<{ pendente?: boolean; status?: string | null }> {
  const s = await getSessaoAluno()
  if (!s) return {}
  const svc = createAdminClient()
  try {
    const { data } = await svc.from('simulado_lgpd_solicitacoes')
      .select('status').eq('estudante_id', s.estudanteId).eq('tenant_id', s.tenantId).eq('tipo', 'exclusao')
      .order('criado_em', { ascending: false }).limit(1).maybeSingle()
    if (!data) return {}
    return { pendente: (data as any).status === 'pendente', status: (data as any).status ?? null }
  } catch {
    return {} // tabela ausente (migração não aplicada) → sem pendências
  }
}

/** Registra um pedido de exclusão (anonimização) para o admin do tenant processar. */
export async function solicitarExclusao(motivo?: string): Promise<{ ok?: boolean; error?: string }> {
  const s = await getSessaoAluno()
  if (!s) return { error: 'Sessão expirada. Entre novamente.' }
  const svc = createAdminClient()
  try {
    const { data: ja } = await svc.from('simulado_lgpd_solicitacoes')
      .select('id').eq('estudante_id', s.estudanteId).eq('tenant_id', s.tenantId).eq('tipo', 'exclusao').eq('status', 'pendente').maybeSingle()
    if (ja) return { ok: true } // já há um pedido pendente — não duplica
    const { error } = await svc.from('simulado_lgpd_solicitacoes').insert({
      tenant_id: s.tenantId, estudante_id: s.estudanteId, tipo: 'exclusao', status: 'pendente', canal: 'aluno',
      motivo: (motivo ?? '').trim().slice(0, 500) || null,
    })
    if (error) return { error: 'Não foi possível registrar. Fale com o suporte da plataforma.' }
    return { ok: true }
  } catch {
    return { error: 'Recurso indisponível no momento. Fale com o suporte da plataforma.' }
  }
}
