import { resolveTemaDark } from '@/lib/hud/resolve-dark'
import { ProvaLoading } from '@/components/prova/prova-intro'
import { hudCssVars } from '@/lib/caderno-designer/hud'
import { HUD_CORES_PADRAO } from '@/lib/caderno-designer/types'

// Loader NEUTRO (sem logo de marca). É mostrado ANTES de resolver o tenant DO TOKEN, então não dá
// para saber a marca aqui. Antes pegava o tenant pelo HOST (getTenantTheme) → em localhost/sem
// subdomínio exibia a logo errada (ex. "R" do Revisão num simulado do VND). O visual branded aparece
// na própria página (EntradaReal). Segue só o tema claro/escuro p/ não piscar branco no escuro.
export default async function Loading() {
  const dark = await resolveTemaDark()
  return (
    <div style={hudCssVars(HUD_CORES_PADRAO, dark) as React.CSSProperties}>
      <ProvaLoading mensagem="Carregando..." logoUrl={null} />
    </div>
  )
}
