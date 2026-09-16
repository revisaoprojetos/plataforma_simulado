/**
 * Formato (layout) da trilha, configurável por tenant em "Aparência". Guardado migration-free em
 * `simulado_tenants.tema.trilha_formato`. Aplica-se às trilhas do sistema (LegProc/Leitura + simulados).
 */
export type TrilhaFormato = 'serpentina' | 'reta' | 'mapa_semanas' | 'lista'

export const TRILHA_FORMATOS: { id: TrilhaFormato; nome: string; desc: string }[] = [
  { id: 'serpentina', nome: 'Serpentina', desc: 'Caminho com curvas (padrão).' },
  { id: 'reta', nome: 'Reta', desc: 'Caminho vertical, sem curvas.' },
  { id: 'mapa_semanas', nome: 'Trilha horizontal', desc: 'Segue na horizontal e curva só ao chegar no fim da linha; medalha como marco.' },
  { id: 'lista', nome: 'Lista compacta', desc: 'Tabela por aula: status, acertos e ação por linha.' },
]

export const DEFAULT_TRILHA_FORMATO: TrilhaFormato = 'serpentina'

export function resolverTrilhaFormato(tema: unknown): TrilhaFormato {
  const v = (tema as { trilha_formato?: string } | null)?.trilha_formato
  return (['serpentina', 'reta', 'mapa_semanas', 'lista'] as string[]).includes(v ?? '') ? (v as TrilhaFormato) : DEFAULT_TRILHA_FORMATO
}
