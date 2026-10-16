import 'server-only'
import type { createAdminClient } from '@/lib/supabase/server'
import { MARATONA, MARATONA_LANCADA } from './config'

type Svc = ReturnType<typeof createAdminClient>

export interface EstadoMaratona {
  /** Mostra o card na Home? (lançada + acesso Curseduca/Guru). */
  visivel: boolean
  /** Já aceitou/iniciou → CTA vira "Continuar". */
  iniciado: boolean
  /** Card recolhido (preferência do aluno, lembrada no servidor). */
  recolhido: boolean
}

/**
 * ACESSO: o card só aparece para quem tem **assinatura Guru ativa** (o produto entra pela Curseduca,
 * então a assinatura `provider='guru'` é o acesso real/pago). `confirmado_curseduca` liga Guru×Curseduca.
 * Regra conservadora: Guru `status='ativo'` e não expirada. (Fase 2: ajustável no admin.)
 */
export async function alunoTemAcessoMaratona(svc: Svc, tenantId: string, estudanteId: string): Promise<boolean> {
  try {
    const { data } = await svc
      .from('simulado_assinaturas')
      .select('status, expira_em')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('provider', 'guru').eq('status', 'ativo')
      .limit(1)
    const a = (data ?? [])[0] as { status?: string; expira_em?: string | null } | undefined
    if (!a) return false
    if (a.expira_em && new Date(a.expira_em).getTime() < Date.now()) return false
    return true
  } catch { return false }
}

/** Estado completo do aluno p/ o card (visível/iniciado/recolhido). */
export async function estadoMaratonaAluno(svc: Svc, tenantId: string, estudanteId: string): Promise<EstadoMaratona> {
  const vazio: EstadoMaratona = { visivel: false, iniciado: false, recolhido: false }
  if (!MARATONA_LANCADA) return vazio
  if (!(await alunoTemAcessoMaratona(svc, tenantId, estudanteId))) return vazio
  let iniciado = false, recolhido = false
  try {
    const { data } = await svc.from('simulado_estudantes').select('perfil_prefs').eq('id', estudanteId).maybeSingle()
    const m = (data as any)?.perfil_prefs?.maratona?.[MARATONA.id]
    if (m && typeof m === 'object') { iniciado = m.iniciado === true; recolhido = m.recolhido === true }
  } catch { /* sem prefs → defaults */ }
  return { visivel: true, iniciado, recolhido }
}

/** Grava iniciado/recolhido no `perfil_prefs.maratona[<id>]` (merge, sem tocar nas outras prefs). */
export async function salvarEstadoMaratona(svc: Svc, estudanteId: string, patch: { iniciado?: boolean; recolhido?: boolean }): Promise<void> {
  const { data } = await svc.from('simulado_estudantes').select('perfil_prefs').eq('id', estudanteId).maybeSingle()
  const prefs = ((data as any)?.perfil_prefs && typeof (data as any).perfil_prefs === 'object') ? { ...(data as any).perfil_prefs } : {}
  const mar = prefs.maratona && typeof prefs.maratona === 'object' ? { ...prefs.maratona } : {}
  const cur = mar[MARATONA.id] && typeof mar[MARATONA.id] === 'object' ? { ...mar[MARATONA.id] } : {}
  if (patch.iniciado != null) cur.iniciado = patch.iniciado
  if (patch.recolhido != null) cur.recolhido = patch.recolhido
  mar[MARATONA.id] = cur
  prefs.maratona = mar
  await svc.from('simulado_estudantes').update({ perfil_prefs: prefs }).eq('id', estudanteId)
}
