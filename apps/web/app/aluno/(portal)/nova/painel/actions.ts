'use server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { patchMetaAdaptativo } from '@/lib/cronograma/adaptativo/dados'
import { atualizarPainelSnapshot } from '@/lib/painel/snapshot'

// FASE 2 (IA): concluir/desfazer uma meta do dia no painel agora grava no CRONOGRAMA ADAPTATIVO
// FIXADO (patchMetaAdaptativo → estado 'done' | null no plano em foco), não mais em EMISSÕES.
// Após gravar, o WRITE-BEHIND recomputa o snapshot do Painel na hora (próxima leitura já vem pronta).
// Ver docs/ARQUITETURA-BACKEND-FIRST.md (§6 Invalidação).
export async function concluirMetaPainel(
  metaId: string, marcar: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'nao_autenticado' }
  const svc = createAdminClient()
  const r = await patchMetaAdaptativo(svc, sessao.tenantId, sessao.estudanteId, metaId, { estado: marcar ? 'done' : null })
  if (r.ok) {
    try { await atualizarPainelSnapshot(svc, sessao.tenantId, sessao.estudanteId) } catch { /* write-behind best-effort */ }
  }
  return r
}
