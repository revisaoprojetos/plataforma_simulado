import { CascataEntrada } from '@/components/cascata-entrada'
import { getTenantTheme } from '@/lib/tenant-theme'

// Re-montado a cada navegação no /admin → dispara a entrada em cascata (riseIn), card a card,
// na ordem de leitura (linha por linha, esquerda→direita). Delays calculados no JS por índice.
// A flag `tema.animacao_entrada` (console → Carregamento → Durante a navegação) pode desligar.
export default async function AdminTemplate({ children }: { children: React.ReactNode }) {
  const { tema } = await getTenantTheme()
  const ativa = (tema as { animacao_entrada?: boolean } | null)?.animacao_entrada !== false
  return <CascataEntrada ativa={ativa}>{children}</CascataEntrada>
}
