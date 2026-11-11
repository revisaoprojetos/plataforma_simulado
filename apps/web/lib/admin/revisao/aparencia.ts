import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { BLOCOS_HOME_PADRAO, MENU_ALUNO, type AparenciaDados } from './aparencia-tipos'

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Lê a aparência atual do tenant (de `simulado_tenants.tema`). A página só LÊ o resultado. */
export async function carregarAparencia(tenantId: string): Promise<AparenciaDados> {
  const vazio: AparenciaDados = { logoUrl: null, faviconUrl: null, loginImagemUrl: null, corPrimaria: null, corAccent: null, fonte: null, nomeSite: null, subtituloSite: null, ocultos: [], blocos: BLOCOS_HOME_PADRAO.map((b) => b.id) }
  try {
    const { data } = await createAdminClient().from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
    const t = ((data as { tema?: Record<string, any> } | null)?.tema ?? {}) as Record<string, any>
    const validos = new Set(MENU_ALUNO.map((m) => m.href))
    const ocultos = Array.isArray(t.menu_aluno?.ocultos) ? (t.menu_aluno.ocultos as unknown[]).filter((h): h is string => typeof h === 'string' && validos.has(h)) : []
    const ids: string[] = BLOCOS_HOME_PADRAO.map((b) => b.id)
    const salvos = Array.isArray(t.home_blocos) ? (t.home_blocos as unknown[]).filter((x): x is string => typeof x === 'string' && ids.includes(x)) : []
    const blocos = [...new Set([...salvos, ...ids])]
    return {
      logoUrl: str(t.logo_url), faviconUrl: str(t.favicon), loginImagemUrl: str(t.login?.fundoImagem),
      corPrimaria: str(t.cor_primaria), corAccent: str(t.cor_accent), fonte: str(t.fonte),
      nomeSite: str(t.nome_site), subtituloSite: str(t.subtitulo_site), ocultos, blocos,
    }
  } catch { return vazio }
}
