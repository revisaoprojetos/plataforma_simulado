import { CascataEntrada } from '@/components/cascata-entrada'
import { getTenantTheme } from '@/lib/tenant-theme'

// Re-montado a cada navegação → entrada em cascata (riseIn) card a card, na ordem de leitura.
// SEM loading.tsx no portal, o conteúdo já chega PRONTO (a página anterior fica na tela até então),
// então a cascata roda com o conteúdo presente — o reveal é em ~1 frame (sem tela branca).
// A flag `tema.animacao_entrada` (console → Carregamento → Durante a navegação) pode desligar.
export default async function AlunoTemplate({ children }: { children: React.ReactNode }) {
  const { tema } = await getTenantTheme()
  const ativa = (tema as { animacao_entrada?: boolean } | null)?.animacao_entrada !== false
  return <CascataEntrada ativa={ativa}>{children}</CascataEntrada>
}
