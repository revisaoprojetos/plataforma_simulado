import 'server-only'
import { lerPaletaNova, hashPaleta } from './paleta-nova'

/**
 * href do css da paleta nova p/ ESTE visitante, ou null (= tema legado, sem nenhuma mudança).
 *  - desligada → null p/ todos;  - workspace → só quem está no Workspace;  - todos → todos.
 * O css em si é servido por /api/public/paleta (cache imutável por hash; o tenant sai do host).
 */
export function paletaHref(tema: unknown, viewerNoWorkspace: boolean): string | null {
  try {
    const p = lerPaletaNova(tema)
    if (p.modo === 'desligada') return null
    if (p.modo === 'workspace' && !viewerNoWorkspace) return null
    return `/api/public/paleta?v=${hashPaleta(p)}`
  } catch { return null }
}
