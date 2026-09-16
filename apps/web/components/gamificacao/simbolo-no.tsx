import { ICONES_TRILHA, type SimboloConfig } from '@/lib/gamificacao/trilha-simbolos'
import { Circle } from 'lucide-react'

/**
 * Renderiza o símbolo de um nó da trilha conforme a config (ícone da lista ou imagem importada),
 * no tamanho definido. `escala` multiplica o tamanho; `cor` colore o ícone (ou tinge a imagem via máscara).
 * Se `cor` for vazio, o ícone herda a cor do contexto (currentColor) e a imagem aparece como está.
 */
export function SimboloNo({ config, escala = 1, cor, className, strokeWidth }: {
  config: SimboloConfig
  escala?: number
  cor?: string | null
  className?: string
  strokeWidth?: number
}) {
  const px = Math.round((config.tamanho ?? 24) * escala)
  if (config.tipo === 'imagem' && config.imagemUrl) {
    // Com cor → tinge a imagem (silhueta) via máscara; sem cor → imagem original.
    if (cor) {
      return <span aria-hidden className={className} style={{ width: px, height: px, background: cor, display: 'inline-block', WebkitMaskImage: `url("${config.imagemUrl}")`, maskImage: `url("${config.imagemUrl}")`, WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center' }} />
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={config.imagemUrl} alt="" className={className} style={{ width: px, height: px, objectFit: 'contain' }} />
  }
  const Icon = ICONES_TRILHA[config.icone] ?? Circle
  return <Icon className={className} style={{ width: px, height: px, color: cor || undefined }} strokeWidth={strokeWidth} />
}
