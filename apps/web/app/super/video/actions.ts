'use server'

import { isSuperAdmin, getAuthUser } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { cifrarSegredoVideo, invalidarConfigVideo } from '@/lib/video/config'
import { normalizarPrefixo, type TesteConexaoVideo } from '@/lib/video/config-tipos'
import type { ResultadoSalvarVideo } from './actions-tipos'

// Config GLOBAL do serviço de vídeo (console super-admin). Toda action checa isSuperAdmin() por conta
// própria (a página é gated pelo layout, mas server actions são POSTs independentes). Service role.

async function guard(): Promise<{ ok: true; userId: string | null } | { ok: false; error: string }> {
  if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }
  const u = await getAuthUser()
  return { ok: true, userId: u?.id ?? null }
}

export interface EntradaVideoConfig {
  urlInterna: string
  prefixoPublico: string
  ativo: boolean
  /** vazio = manter o atual */
  chave: string
  adminEmail: string
  /** vazio = manter o atual */
  adminSenha: string
}

export async function salvarVideoConfigAction(e: EntradaVideoConfig): Promise<ResultadoSalvarVideo> {
  const g = await guard()
  if (!g.ok) return g
  const url = (e.urlInterna ?? '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s/]+/i.test(url)) return { ok: false, error: 'URL interna inválida (use http://host:porta).' }
  const prefixo = normalizarPrefixo(e.prefixoPublico)
  if (!/^\/[A-Za-z0-9._\-/]*$/.test(prefixo)) return { ok: false, error: 'Prefixo público inválido.' }

  const upd: Record<string, unknown> = {
    id: true,
    url_interna: url,
    prefixo_publico: prefixo,
    ativo: !!e.ativo,
    admin_email: (e.adminEmail ?? '').trim() || null,
    atualizado_em: new Date().toISOString(),
    atualizado_por: g.userId,
  }
  if (e.chave?.trim()) upd.chave_integracao_enc = cifrarSegredoVideo(e.chave.trim())
  if (e.adminSenha?.trim()) upd.admin_senha_enc = cifrarSegredoVideo(e.adminSenha.trim())

  const { error } = await createAdminClient().from('video_config').upsert(upd, { onConflict: 'id' })
  if (error) {
    return { ok: false, error: /video_config|relation|does not exist/i.test(error.message) ? 'Tabela video_config inexistente: aplique a migration 20261110020000.' : 'Falha ao salvar.' }
  }
  invalidarConfigVideo()
  return { ok: true }
}

/** GET /health do serviço pela URL interna informada na tela (sem exigir salvar antes). */
export async function testarConexaoVideoAction(urlInterna: string): Promise<TesteConexaoVideo> {
  const g = await guard()
  if (!g.ok) return { ok: false, mensagem: g.error }
  const base = (urlInterna ?? '').trim().replace(/\/+$/, '').replace(/\/v1$/i, '')
  if (!/^https?:\/\/[^\s/]+/i.test(base)) return { ok: false, mensagem: 'URL interna inválida.' }
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 8000)
  try {
    const res = await fetch(`${base}/health`, { cache: 'no-store', signal: ctl.signal, headers: { Accept: 'application/json' } })
    const j = await res.json().catch(() => null) as { db?: string; redis?: string; s3?: string } | null
    return {
      ok: res.ok,
      mensagem: res.ok ? 'Serviço respondeu OK.' : `Serviço respondeu HTTP ${res.status} (degradado).`,
      db: j?.db, redis: j?.redis, s3: j?.s3,
    }
  } catch (err) {
    return { ok: false, mensagem: err instanceof Error && err.name === 'AbortError' ? 'Tempo esgotado (8 s).' : 'Não foi possível conectar ao serviço.' }
  } finally {
    clearTimeout(t)
  }
}
