import { iconeConquista, animConquista } from '@/lib/gamificacao/icones'

// Ícone de conquista com a animação de hover + partículas especiais:
// - brilho/gema: faíscas piscando ao redor
// - escudo: flechas atingindo o escudo
// Deve ficar dentro de um contêiner `relative` que seja `.group` (o card).
export function ConquistaIconeFx({ icone, className = 'h-5 w-5' }: { icone: string; className?: string }) {
  const Icon = iconeConquista(icone)
  const brilho = icone === 'sparkles' || icone === 'gem'
  const escudo = icone === 'shield'
  return (
    <>
      <Icon className={`${className} ${animConquista(icone)}`} />
      {brilho && (
        <>
          <span className="ico-spark ico-spark-1" aria-hidden />
          <span className="ico-spark ico-spark-2" aria-hidden />
          <span className="ico-spark ico-spark-3" aria-hidden />
          <span className="ico-spark ico-spark-4" aria-hidden />
        </>
      )}
      {escudo && (
        <>
          <span className="ico-arrow ico-arrow-1" aria-hidden />
          <span className="ico-arrow ico-arrow-2" aria-hidden />
        </>
      )}
    </>
  )
}
