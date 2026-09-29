import { cn } from '@/lib/utils'
import { avatarPadraoDe } from '@/lib/aluno/avatar-padrao'

/**
 * Avatar do estudante (reutilizável): mostra a FOTO de perfil (personalização) com a COR atrás.
 * Na falta de foto, cai numa CAPIVARA padrão VARIADA (determinística pelo nome) — nunca mais nas
 * iniciais, então todo aluno tem uma imagem. Passe o tamanho/estilo via `className`; a `cor`
 * sobrescreve o fundo. Passe `seed` (id do aluno) se quiser variar por id em vez do nome.
 */
export function AvatarEstudante({ nome, avatar, cor, className, seed }: { nome: string; avatar?: string | null; cor?: string | null; className?: string; seed?: string | null }) {
  const padrao = !avatar
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full', padrao && !cor && 'bg-muted', className)}
      style={cor ? { background: cor } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatar || avatarPadraoDe(seed ?? nome)}
        alt={nome || ''}
        className={cn('h-full w-full', padrao ? 'object-contain object-center' : 'object-contain object-[center_82%]')}
      />
    </span>
  )
}
