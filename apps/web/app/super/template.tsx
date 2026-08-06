import { CascataEntrada } from '@/components/cascata-entrada'
import { getTenantTheme } from '@/lib/tenant-theme'

// Re-montado a cada navegação no console super-admin → entrada em cascata (riseIn) card a card,
// na ordem de leitura (linha por linha, esquerda→direita). Mesmo modelo do /admin e do portal.
// A flag `tema.animacao_entrada` (console → Carregamento → Durante a navegação) pode desligar.
export default async function SuperTemplate({ children }: { children: React.ReactNode }) {
  const { tema } = await getTenantTheme()
  const ativa = (tema as { animacao_entrada?: boolean } | null)?.animacao_entrada !== false
  return <CascataEntrada ativa={ativa}>{children}</CascataEntrada>
}
