import { CascataEntrada } from '@/components/cascata-entrada'

// Re-montado a cada navegação no portal do aluno → entrada em cascata (riseIn) card a card, na
// ordem de leitura (linha por linha, esquerda→direita). Delays calculados no JS por índice.
export default function AlunoTemplate({ children }: { children: React.ReactNode }) {
  return <CascataEntrada>{children}</CascataEntrada>
}
