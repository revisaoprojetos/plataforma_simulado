'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { hospedarBase64 } from '@/lib/storage/hospedar-base64'
import { revalidatePath } from 'next/cache'

export interface ConfigGlobalInput {
  login_layout: string
  login_selecao: boolean
  logo_filtro_login: string
  entrada_nome: string
  entrada_logo_url: string
  entrada_cor: string
  entrada_modo: string
}

// Sanitização (a marca é injetada como cor/URL no login — bloqueia valores perigosos).
const corSegura = (v: string) => (/^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : null)
const logoSegura = (v: string) => (/^(https?:\/\/|data:image\/)/.test(v.trim()) ? v.trim() : null)

/** Salva a config GLOBAL da entrada (linha única id=1). Exclusiva do super-admin global. */
export async function salvarConfigGlobal(input: ConfigGlobalInput): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }

  const svc = createAdminClient()
  // Logo base64 (upload de arquivo) → storage; guarda só a URL (não infla a linha de config).
  const logoSan = input.entrada_logo_url ? logoSegura(input.entrada_logo_url) : null
  const logoFinal = logoSan ? ((await hospedarBase64(logoSan, svc)) || logoSan) : null

  const patch = {
    id: 1,
    login_layout: input.login_layout === 'centralizado' ? 'centralizado' : 'painel',
    login_selecao: !!input.login_selecao,
    logo_filtro_login: ['none', 'branco', 'preto'].includes(input.logo_filtro_login) ? input.logo_filtro_login : 'none',
    entrada_nome: input.entrada_nome?.trim() || null,
    entrada_logo_url: logoFinal,
    entrada_cor: input.entrada_cor ? corSegura(input.entrada_cor) : null,
    entrada_modo: input.entrada_modo === 'dark' ? 'dark' : 'light',
    atualizado_em: new Date().toISOString(),
  }

  const { error } = await svc.from('simulado_config_global').upsert(patch, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_config_global', depois: patch })
  revalidatePath('/login')
  revalidatePath('/admin/entrada')
  return { ok: true }
}
