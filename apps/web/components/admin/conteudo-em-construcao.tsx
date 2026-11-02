import { Construction } from 'lucide-react'

/**
 * Placeholder "Em construção" das telas do Estúdio de Conteúdo (área construída por fora em
 * /admin/conteudos/*). Largura cheia (sem max-w central), tokens de cor (dark/light), sem Sparkles.
 * Os builders substituem cada page.tsx pela tela real; este componente some quando isso acontece.
 */
export function ConteudoEmConstrucao({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="w-full space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {descricao && <p className="text-sm text-muted-foreground">{descricao}</p>}
      </div>
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-muted/30 p-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Construction className="h-7 w-7" />
        </span>
        <h2 className="text-lg font-semibold">Em construção</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Esta área do Estúdio de Conteúdo está sendo preparada. Em breve você poderá gerenciá-la por aqui.
        </p>
      </div>
    </div>
  )
}
