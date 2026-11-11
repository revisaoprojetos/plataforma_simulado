import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { criarNovidade } from '@/lib/novidades/novidades'

/**
 * Coloca no ar as edições do JurisClub AGENDADAS cujo `publicar_em` já chegou (rascunho→agendado→publicado).
 * Idempotente: o UPDATE condicional (status='agendado') garante que só quem vira publicado dispara o aviso.
 * Chamada pelo cron /api/cron/jurisclub-publicar (worker, 300s).
 */
export async function publicarEdicoesAgendadas(): Promise<{ publicadas: number; candidatas: number }> {
  const svc = createAdminClient()
  const agora = new Date().toISOString()
  const { data } = await svc.from('jurisclub_edicoes').select('id, tenant_id, titulo, pasta, avisar_alunos, destaque_inicio')
    .eq('status', 'agendado').eq('deletado', false).lte('publicar_em', agora).order('publicar_em').order('id').limit(200)
  const cands = (data ?? []) as any[]
  let publicadas = 0
  for (const e of cands) {
    const { data: up } = await svc.from('jurisclub_edicoes').update({ status: 'publicado', publicado_em: agora, publicar_em: null, falta: null, atualizado_em: agora })
      .eq('id', e.id).eq('tenant_id', e.tenant_id).eq('status', 'agendado').select('id')
    if (!up?.length) continue
    publicadas++
    if (e.avisar_alunos) {
      await criarNovidade(svc, { tenantId: e.tenant_id, categoria: 'jurisclub', titulo: `${e.pasta === '1a7d' ? 'Novo dia no ar' : 'Nova edição do JurisClub'}: ${e.titulo}`, destaque: !!e.destaque_inicio, ctaLabel: 'Ler agora' }).catch(() => null)
    }
  }
  return { publicadas, candidatas: cands.length }
}
