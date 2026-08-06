import { CascataEntrada } from '@/components/cascata-entrada'

// Re-montado a cada navegação no /admin → dispara a entrada em cascata (riseIn), card a card,
// na ordem de leitura (linha por linha, esquerda→direita). Delays calculados no JS por índice.
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return <CascataEntrada>{children}</CascataEntrada>
}
