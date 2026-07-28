import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Config GLOBAL da entrada (login neutro) — fora do tema por-tenant. Ver a migração
 * 20260728000002_config_global.sql. Tolerante: se a tabela ainda não existe (ou erro),
 * retorna null e o chamador cai no comportamento antigo (fallback). Uma leitura por
 * request (React cache).
 */
export interface ConfigGlobal {
  login_layout: 'painel' | 'centralizado'
  login_selecao: boolean
  logo_filtro_login: string
  entrada_nome: string | null
  entrada_logo_url: string | null
  entrada_cor: string | null
  entrada_modo: 'light' | 'dark'
}

export const getConfigGlobal = cache(async (): Promise<ConfigGlobal | null> => {
  try {
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_config_global').select('*').eq('id', 1).maybeSingle()
    if (!data) return null
    return {
      login_layout: (data.login_layout === 'centralizado' ? 'centralizado' : 'painel'),
      login_selecao: data.login_selecao !== false,
      logo_filtro_login: data.logo_filtro_login ?? 'none',
      entrada_nome: data.entrada_nome ?? null,
      entrada_logo_url: data.entrada_logo_url ?? null,
      entrada_cor: data.entrada_cor ?? null,
      entrada_modo: (data.entrada_modo === 'dark' ? 'dark' : 'light'),
    }
  } catch {
    return null
  }
})
