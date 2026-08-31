import { FONT_SCALE_MIN, FONT_SCALE_MAX } from '@/lib/font-scale'

/**
 * Aplica a escala de fonte salva ANTES do 1º paint (sem flash), lendo o localStorage pelo escopo do
 * usuário. É um Server Component (sem 'use client') que emite um <script> inline — o mesmo padrão do
 * anti-flash de tema. O `scope` DEVE casar com o passado ao <FontScaleControl> da mesma área.
 */
export function FontScaleInit({ scope }: { scope: string }) {
  const js =
    `try{var s=localStorage.getItem('plt.fontscale.'+${JSON.stringify(scope)});` +
    `if(s){var n=parseFloat(s);if(n>=${FONT_SCALE_MIN}&&n<=${FONT_SCALE_MAX})` +
    `document.documentElement.style.setProperty('--font-scale',String(n));}}catch(e){}`
  return <script dangerouslySetInnerHTML={{ __html: js }} />
}
