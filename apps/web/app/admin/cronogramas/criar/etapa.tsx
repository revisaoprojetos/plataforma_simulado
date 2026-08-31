'use client'

/**
 * Casca comum das etapas: título + descrição + conteúdo.
 *
 * Largura CHEIA (como o resto do admin e o stepper acima): centrar num `max-w-*` deixava duas
 * faixas vazias nas laterais numa tela larga — o conteúdo ficava mais estreito que o próprio
 * stepper. Cada etapa cuida da sua densidade interna (grades, colunas) para usar o espaço.
 */
export function Etapa({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{titulo}</h1>
        {descricao && <p className="max-w-3xl text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {children}
    </div>
  )
}
