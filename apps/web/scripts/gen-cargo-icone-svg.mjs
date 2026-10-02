// Gera lib/gamificacao/cargo-icone-svg-map.ts: mapa chave->SVG string dos ícones de cargo (lucide).
// Offline (build-time) p/ não importar react-dom/server em runtime (proibido em RSC no Next 15).
// Rodar: node scripts/gen-cargo-icone-svg.mjs
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as L from 'lucide-react'
import { writeFileSync } from 'node:fs'

// chave (salva no banco) -> nome do componente lucide. Espelha lib/gamificacao/cargo-icones.ts.
const MAP = {
  'graduation-cap': 'GraduationCap', 'book-open': 'BookOpen', 'book-marked': 'BookMarked', briefcase: 'Briefcase',
  scale: 'Scale', gavel: 'Gavel', shield: 'Shield', landmark: 'Landmark', crown: 'Crown', trophy: 'Trophy',
  medal: 'Medal', award: 'Award', star: 'Star', swords: 'Swords', target: 'Target', rocket: 'Rocket',
  brain: 'Brain', 'badge-check': 'BadgeCheck', flame: 'Flame', zap: 'Zap', coffee: 'Coffee', heart: 'Heart',
  gem: 'Gem', diamond: 'Diamond', anchor: 'Anchor', feather: 'Feather', compass: 'Compass', globe: 'Globe',
  lightbulb: 'Lightbulb', key: 'Key', sword: 'Sword', castle: 'Castle', leaf: 'Leaf', sprout: 'Sprout',
  mountain: 'Mountain', sun: 'Sun', moon: 'Moon', snowflake: 'Snowflake', umbrella: 'Umbrella', guitar: 'Guitar',
  music: 'Music', camera: 'Camera', palette: 'Palette', wand: 'Wand2', ghost: 'Ghost', cat: 'Cat', dog: 'Dog',
  bird: 'Bird', rabbit: 'Rabbit', paw: 'PawPrint', dumbbell: 'Dumbbell', hammer: 'Hammer', wrench: 'Wrench',
  atom: 'Atom', flask: 'FlaskConical', bike: 'Bike', sailboat: 'Sailboat', pizza: 'Pizza', cake: 'Cake',
}

const out = {}
for (const [key, comp] of Object.entries(MAP)) {
  const Icon = L[comp]
  if (!Icon) { console.warn('faltando', comp); continue }
  out[key] = renderToStaticMarkup(createElement(Icon, { width: 14, height: 14, stroke: 'currentColor', strokeWidth: 2, fill: 'none' }))
}

const body = `// GERADO por scripts/gen-cargo-icone-svg.mjs — NÃO editar à mão.
// Mapa chave do cargo -> SVG inline (lucide serializado) p/ o jogo do Desafio de Jurisprudência (iframe vanilla).
export const CARGO_ICONE_SVG: Record<string, string> = ${JSON.stringify(out, null, 2)}
`
writeFileSync(new URL('../lib/gamificacao/cargo-icone-svg-map.ts', import.meta.url), body)
console.log('OK —', Object.keys(out).length, 'ícones gerados.')
