/**
 * Formato (layout) da trilha, configurável por tenant em "Aparência". Guardado migration-free em
 * `simulado_tenants.tema.trilha_formato`. Aplica-se às trilhas do sistema (LegProc/Leitura + simulados).
 */
export type TrilhaFormato = 'serpentina' | 'reta' | 'mapa_semanas' | 'lista' | 'livre'

export const TRILHA_FORMATOS: { id: TrilhaFormato; nome: string; desc: string }[] = [
  { id: 'serpentina', nome: 'Serpentina', desc: 'Caminho com curvas (padrão).' },
  { id: 'reta', nome: 'Reta', desc: 'Caminho vertical, sem curvas.' },
  { id: 'mapa_semanas', nome: 'Trilha horizontal', desc: 'Segue na horizontal e curva só ao chegar no fim da linha; medalha como marco.' },
  { id: 'lista', nome: 'Lista compacta', desc: 'Tabela por aula: status, acertos e ação por linha.' },
  { id: 'livre', nome: 'Personalizada', desc: 'Você posiciona cada aula e desenha a curva sobre a imagem de fundo.' },
]

export const DEFAULT_TRILHA_FORMATO: TrilhaFormato = 'serpentina'

/** Valida um formato cru (string) → cai no padrão se inválido. */
export function resolverFormatoRaw(v: unknown): TrilhaFormato {
  return (['serpentina', 'reta', 'mapa_semanas', 'lista', 'livre'] as string[]).includes((v as string) ?? '') ? (v as TrilhaFormato) : DEFAULT_TRILHA_FORMATO
}

export function resolverTrilhaFormato(tema: unknown): TrilhaFormato {
  return resolverFormatoRaw((tema as { trilha_formato?: string } | null)?.trilha_formato)
}
