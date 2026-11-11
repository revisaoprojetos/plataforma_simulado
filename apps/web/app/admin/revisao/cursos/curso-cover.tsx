import { cn } from '@/lib/utils'

// Capa do curso: imagem (capa horizontal) quando existe; senão o card GERADO com a cor principal + faixa na cor de destaque
// (cover.gen do protótipo). As cores vêm do cadastro do curso (dado do usuário) — por isso vão inline; o resto usa tokens.
export function CursoCover({ nome, c1, c2, img, className }: { nome: string; c1: string; c2: string; img?: string | null; className?: string }) {
  if (img) {
    return <div className={cn('aspect-video w-full bg-muted bg-cover bg-center', className)} style={{ backgroundImage: `url('${img}')` }} role="img" aria-label={nome} />
  }
  return (
    <div
      className={cn('relative flex aspect-video w-full flex-col justify-end overflow-hidden p-4', className)}
      style={{ background: `linear-gradient(165deg, ${c1}, color-mix(in srgb, ${c1} 55%, black))` }}
    >
      <i className="absolute left-4 top-4 h-1.5 w-10 rounded-full" style={{ background: c2 }} />
      <b className="text-lg font-extrabold uppercase leading-tight tracking-tight text-white">{nome}</b>
    </div>
  )
}
