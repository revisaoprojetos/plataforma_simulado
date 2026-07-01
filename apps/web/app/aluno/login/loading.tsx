import { resolveTemaDark } from '@/lib/hud/resolve-dark'
import { ProvaLoading } from '@/components/prova/prova-intro'
import { getTenantTheme } from '@/lib/tenant-theme'
import { hudCssVars } from '@/lib/caderno-designer/hud'
import { HUD_CORES_PADRAO } from '@/lib/caderno-designer/types'

// Mostrado enquanto a página de login do simulado é preparada.
// Segue o tema (claro/escuro) pelo cookie, para não piscar branco no escuro.
export default async function Loading() {
  const { tema } = await getTenantTheme()
  const ti = (tema ?? {}) as Record<string, string>
  const dark = await resolveTemaDark()
  return (
    <div style={hudCssVars(HUD_CORES_PADRAO, dark) as React.CSSProperties}>
      <ProvaLoading
        mensagem="Carregando..."
        logoUrl={ti.logo_url ?? null}
        logoBg={ti.logo_png_bg ?? '#ffffff'}
        logoEstilo={ti.logo_estilo ?? 'arredondado'}
      />
    </div>
  )
}
