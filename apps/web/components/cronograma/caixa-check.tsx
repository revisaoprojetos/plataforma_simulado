'use client'

import { Check } from 'lucide-react'

/**
 * A caixa de marcação do módulo.
 *
 * O `<input type="checkbox">` nativo era o que estava na tela: ele ignora o tema do tenant
 * (o `accent-color` pinta só o preenchimento, não a borda nem o raio), muda de desenho entre
 * navegadores e sistemas, e destoava do resto — cantos quadrados ao lado de campos com canto
 * arredondado, e um cinza que não é nenhum dos cinzas da plataforma.
 *
 * Aqui é um botão com `role="checkbox"`, então continua acessível pelo teclado e pelos
 * leitores de tela, mas a aparência sai inteira dos tokens do tema.
 */
export function CaixaCheck({
  marcada,
  aoTrocar,
  rotulo,
  titulo,
  className = '',
}: {
  marcada: boolean
  aoTrocar: (marcar: boolean) => void
  /** Lido em voz alta — a caixa não tem texto ao lado que sirva de rótulo. */
  rotulo: string
  titulo?: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcada}
      aria-label={rotulo}
      title={titulo}
      onClick={() => aoTrocar(!marcada)}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50 ${
        marcada
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-input bg-[var(--input-bg,transparent)] hover:border-primary/60 hover:bg-primary/5'
      } ${className}`}
    >
      <Check
        className={`h-3.5 w-3.5 transition-opacity ${marcada ? 'opacity-100' : 'opacity-0'}`}
        strokeWidth={3.5}
      />
    </button>
  )
}
