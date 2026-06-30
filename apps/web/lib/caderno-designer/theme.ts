// Tema (identidade visual) do caderno — preview e impressão consomem o mesmo tema.

export type CadernoTheme = {
  cores: { primaria: string; secundaria: string; acento: string; texto: string; fundo: string }
  tipografia: { familia: string; base: number } // tamanhos em pt
}

export const FONTES_CADERNO: { id: string; nome: string; css: string }[] = [
  { id: 'serif', nome: 'Serifada (Times)', css: 'Georgia, "Times New Roman", serif' },
  { id: 'sans', nome: 'Sem serifa (Helvetica)', css: 'Helvetica, Arial, sans-serif' },
  { id: 'mono', nome: 'Monoespaçada (Courier)', css: '"Courier New", Courier, monospace' },
]

export const TEMA_PADRAO: CadernoTheme = {
  cores: { primaria: '#1e3a5f', secundaria: '#2c5282', acento: '#d69e2e', texto: '#1a202c', fundo: '#ffffff' },
  tipografia: { familia: FONTES_CADERNO[0].css, base: 12 },
}

/** CSS da fonte pelo id (serif/sans/mono); undefined se vazio (usa o tema). */
export function cssDaFonte(id?: string): string | undefined {
  return FONTES_CADERNO.find((f) => f.id === id)?.css
}

export function resolveTheme(override?: Partial<CadernoTheme['cores']> | null, familia?: string): CadernoTheme {
  return {
    cores: { ...TEMA_PADRAO.cores, ...(override ?? {}) },
    tipografia: { familia: familia || TEMA_PADRAO.tipografia.familia, base: TEMA_PADRAO.tipografia.base },
  }
}
