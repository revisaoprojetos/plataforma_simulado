import { cn } from '@/lib/utils'

function iniciais(nome: string) {
  return (nome || '').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '?'
}

/**
 * Avatar do estudante (reutilizável): mostra a FOTO de perfil (personalização) com a COR atrás;
 * na falta de foto, cai nas iniciais do nome. Passe o tamanho/estilo padrão via `className` — a
 * `cor` sobrescreve o fundo quando definida.
 */
export function AvatarEstudante({ nome, avatar, cor, className }: { nome: string; avatar?: string | null; cor?: string | null; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold uppercase', className)} style={cor ? { background: cor } : undefined}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="h-full w-full object-contain object-[center_82%]" />
      ) : iniciais(nome)}
    </span>
  )
}
