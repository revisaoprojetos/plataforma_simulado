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
 * ACESSO: segue o que o admin configurou na aba **Acessos** do desafio (ModuloAcesso) — individual
 * (`simulado_pasta_estudantes`) OU grupo (`simulado_pasta_grupos` + `simulado_grupo_membros`). SEM atribuição
 * nenhuma = liberado para todos. (Mesmo modelo do desafio de Jurisprudência — `pastaAcessivel`.) Antes isso
 * era gateado por assinatura Guru, o que ignorava os grupos adicionados e só liberava quem tinha Guru.
 */
export async function alunoTemAcessoMaratona(svc: Svc, tenantId: string, estudanteId: string): Promise<boolean> {
  try {
    const { data: ps } = await svc.from('simulado_pastas').select('id')
      .eq('tenant_id', tenantId).eq('folder_area', 'maratona').order('created_at', { ascending: true }).limit(1)
    const pastaId = (ps ?? [])[0]?.id as string | undefined
    if (!pastaId) return false
    const [{ data: pe }, { data: pg }] = await Promise.all([
      svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', pastaId),
      svc.from('simulado_pasta_grupos').select('grupo_id').eq('pasta_id', pastaId),
    ])
    const estuds = new Set((pe ?? []).map((r: any) => r.estudante_id as string))
    const grupos = (pg ?? []).map((r: any) => r.grupo_id as string)
    if (!estuds.size && !grupos.length) return true // sem atribuição = todos
    if (estuds.has(estudanteId)) return true
    if (grupos.length) {
      const { data: gm } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estudanteId).in('grupo_id', grupos)
      if ((gm ?? []).length) return true
    }
    return false
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
