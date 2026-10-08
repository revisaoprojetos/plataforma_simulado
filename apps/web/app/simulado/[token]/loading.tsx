import { PlatformLoader } from '@/components/brand/platform-loader'

// Tela de carregamento do DESIGNER NOVO (PlatformLoader) — substitui a HUD. Sem `brand`/`style`, resolve
// a marca/estilo do loading pela plataforma (host) via /api/public/appearance.
export default function Loading() {
  return <PlatformLoader message="Carregando…" />
}
