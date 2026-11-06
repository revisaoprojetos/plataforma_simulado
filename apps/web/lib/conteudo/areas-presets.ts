// Estilos PRÉ-MONTADOS dos blocos expansíveis (plugin Expansor): o cartão roxo padrão e as caixas coloridas do
// LegProc (Entendimento STF/STJ, Atenção/NÃO ESQUEÇA, Já cobrado em prova, Destaque…). Sem 'server-only': usado pelo
// servidor (renderização), pela tela do admin (prévia/seleção) e espelhado no plugin do editor (public/oo-plugin-expansor).
export type EstiloExp = {
  cor: string; borda: string; fundo: string; raio: number; tamanho: number
  icone: 'seta' | 'mais'; iniciaAberta: boolean
  /** 'cartao' = cartão branco, título roxo e seta · 'caixa' = caixa colorida: título em negrito + prévia do texto (só fechada). */
  variante: 'cartao' | 'caixa'
}

/** Borda derivada do fundo (mesma regra das caixas do LegProc: fundo misturado a #555 a 62%). */
function bordaDe(fundo: string): string {
  const mix = (a: number, b: number) => Math.round(a * 0.62 + b * 0.38)
  const c = [1, 3, 5].map((i) => parseInt(fundo.slice(i, i + 2), 16))
  return '#' + c.map((v) => mix(v, 0x55).toString(16).padStart(2, '0')).join('').toUpperCase()
}
const caixa = (fundo: string): EstiloExp => ({ cor: '#111111', borda: bordaDe(fundo), fundo, raio: 8, tamanho: 14, icone: 'seta', iniciaAberta: false, variante: 'caixa' })

export type PresetExp = { id: string; nome: string; estilo: EstiloExp }

export const ESTILO_EXP_PADRAO: EstiloExp = { cor: '#6B2FA0', borda: '#DDD6F3', fundo: '#FFFFFF', raio: 12, tamanho: 15, icone: 'seta', iniciaAberta: false, variante: 'cartao' }

export const PRESETS_EXP: PresetExp[] = [
  { id: 'padrao', nome: 'Padrão (cartão roxo)', estilo: ESTILO_EXP_PADRAO },
  { id: 'stf', nome: 'Entendimento do STF', estilo: caixa('#BDD6EE') },
  { id: 'stj', nome: 'Entendimento do STJ', estilo: caixa('#FFF2CC') },
  { id: 'atencao', nome: 'Atenção / NÃO ESQUEÇA', estilo: caixa('#FDE9D9') },
  { id: 'cobrado', nome: 'Já cobrado em prova', estilo: caixa('#EFEAFC') },
  { id: 'destaque', nome: 'Destaque', estilo: caixa('#EEF1F4') },
  { id: 'cinza', nome: 'Cinza (impedimento)', estilo: caixa('#D9D9D9') },
  { id: 'verde', nome: 'Verde', estilo: caixa('#E2F0D9') },
]
export const IDS_PRESET_EXP = PRESETS_EXP.map((p) => p.id)
export const presetExp = (id: string | null | undefined): PresetExp | null => PRESETS_EXP.find((p) => p.id === id) ?? null

/** "Título|preset" (formato do marcador [[EXP:id|Título|preset]]) → { titulo, preset }. O preset só vale se for um id conhecido. */
export function separarTituloPreset(bruto: string): { titulo: string; preset: string | null } {
  const i = bruto.lastIndexOf('|')
  if (i >= 0) {
    const cand = bruto.slice(i + 1).trim().toLowerCase()
    if (IDS_PRESET_EXP.includes(cand)) return { titulo: bruto.slice(0, i).trim(), preset: cand }
  }
  return { titulo: bruto.trim(), preset: null }
}
