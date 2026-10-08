import { PlatformLoader } from '@/components/brand/platform-loader'

// Tela de carregamento do DESIGNER NOVO (PlatformLoader) — substitui a HUD (ProvaLoading). Sem `brand`/
// `style`, o PlatformLoader resolve a marca/estilo do loading pela plataforma (host) via
// /api/public/appearance. A entrada (login) branded fica em page.tsx (EntradaReal).
export default function Loading() {
  return <PlatformLoader message="Carregando…" />
}
