import 'server-only'
import type { createAdminClient } from '@/lib/supabase/server'
import { sqlQuery } from '@/lib/data/sql'
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

// ─── NÚMERO DO CORREDOR ───────────────────────────────────────────────────────
// Cada aluno recebe um número de corrida (0001, 0002…) por maratona, na ORDEM DE CHEGADA ao 1º
// encerramento. Guardado migration-free na própria pasta: `desafio_jogo.config.corredores` (mapa
// estudanteId→número) + `config.proxNumero`. A atribuição é ATÔMICA (SELECT … FOR UPDATE), então dois
// alunos que entram no mesmo instante NUNCA pegam o mesmo número (o banco serializa). Fixo pra sempre.

/** Lê o número de corredor já atribuído ao aluno nesta maratona (null = ainda não corre). */
export async function lerNumeroCorredor(svc: Svc, tenantId: string, pastaId: string, estudanteId: string): Promise<number | null> {
  try {
    const { data } = await svc.from('simulado_pastas').select('desafio_jogo').eq('id', pastaId).eq('tenant_id', tenantId).maybeSingle()
    const v = Number((data as any)?.desafio_jogo?.config?.corredores?.[estudanteId])
    return Number.isFinite(v) && v > 0 ? v : null
  } catch { return null }
}

/**
 * Garante (idempotente) o número de corredor do aluno. Chamar ao detectar o 1º simulado encerrado.
 * Atômico via `SELECT … FOR UPDATE` na linha da pasta → sem duplicar no pico. Sem DATABASE_URL, cai num
 * fallback best-effort (read-modify-write via supabase-js). Retorna o número definitivo (ou null em erro).
 */
export async function garantirNumeroCorredor(svc: Svc, tenantId: string, pastaId: string, estudanteId: string): Promise<number | null> {
  // 1) caminho ATÔMICO (preferido): uma única statement. O FOR UPDATE no CTE `locked` tranca a linha; a 2ª
  //    chamada concorrente espera e, ao destravar, relê o proxNumero já incrementado. `||` preserva as demais
  //    chaves de config (etapas/lancada/…) e dos corredores já atribuídos.
  const sql = `
    WITH locked AS (
      SELECT id,
             coalesce((desafio_jogo->'config'->'corredores'->>$2)::int, 0) AS ja,
             coalesce((desafio_jogo->'config'->>'proxNumero')::int, 1)     AS prox,
             desafio_jogo AS dj
      FROM simulado_pastas
      WHERE id = $1 AND tenant_id = $3
      FOR UPDATE
    ),
    upd AS (
      UPDATE simulado_pastas p
      SET desafio_jogo = coalesce(l.dj, '{}'::jsonb) || jsonb_build_object(
            'config',
            coalesce(l.dj->'config', '{}'::jsonb) || jsonb_build_object(
              'corredores', coalesce(l.dj->'config'->'corredores', '{}'::jsonb) || jsonb_build_object($2::text, l.prox),
              'proxNumero', l.prox + 1
            )
          )
      FROM locked l
      WHERE p.id = l.id AND l.ja = 0
      RETURNING l.prox AS numero
    )
    SELECT coalesce((SELECT numero FROM upd), (SELECT ja FROM locked)) AS numero
  `
  try {
    const rows = await sqlQuery<{ numero: number | null }>(sql, [pastaId, estudanteId, tenantId])
    if (rows) {
      const n = Number(rows[0]?.numero)
      return Number.isFinite(n) && n > 0 ? n : null
    }
  } catch { /* cai no fallback */ }

  // 2) FALLBACK best-effort (sem DATABASE_URL): read-modify-write. Risco de corrida só no mesmo instante
  //    exato E sem pooler — aceitável como degradação; o normal é o caminho atômico acima.
  try {
    const { data } = await svc.from('simulado_pastas').select('desafio_jogo').eq('id', pastaId).eq('tenant_id', tenantId).maybeSingle()
    const dj = ((data as any)?.desafio_jogo && typeof (data as any).desafio_jogo === 'object') ? { ...(data as any).desafio_jogo } : {}
    const cfg = (dj.config && typeof dj.config === 'object') ? { ...dj.config } : {}
    const cor = (cfg.corredores && typeof cfg.corredores === 'object') ? { ...cfg.corredores } : {}
    const existente = Number(cor[estudanteId])
    if (Number.isFinite(existente) && existente > 0) return existente
    const usados = Object.values(cor).map((v) => Number(v)).filter((v) => Number.isFinite(v)) as number[]
    const prox = Math.max(Number(cfg.proxNumero) || 0, usados.length ? Math.max(...usados) + 1 : 0, 1)
    cor[estudanteId] = prox; cfg.corredores = cor; cfg.proxNumero = prox + 1; dj.config = cfg
    await svc.from('simulado_pastas').update({ desafio_jogo: dj }).eq('id', pastaId).eq('tenant_id', tenantId)
    return prox
  } catch { return null }
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
