// Tema (identidade visual) do caderno — preview e impressão consomem o mesmo tema.

export type CadernoTheme = {
  cores: { primaria: string; secundaria: string; acento: string; texto: string; fundo: string }
  tipografia: { familia: string; base: number } // tamanhos em pt
}

export const FONTES_CADERNO: { id: string; nome: string; css: string }[] = [
  // Serifadas
  { id: 'serif', nome: 'Serifada (Georgia)', css: 'Georgia, "Times New Roman", serif' },
  { id: 'times', nome: 'Times New Roman', css: '"Times New Roman", Times, serif' },
  { id: 'georgia', nome: 'Georgia', css: 'Georgia, serif' },
  { id: 'garamond', nome: 'Garamond', css: 'Garamond, "EB Garamond", "Times New Roman", serif' },
  { id: 'palatino', nome: 'Palatino', css: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  { id: 'cambria', nome: 'Cambria', css: 'Cambria, Georgia, serif' },
  { id: 'bookman', nome: 'Bookman', css: '"Bookman Old Style", "Book Antiqua", serif' },
  // Sem serifa
  { id: 'montserrat', nome: 'Montserrat', css: '"Montserrat", "Segoe UI", Arial, sans-serif' },
  { id: 'sans', nome: 'Sem serifa (Helvetica)', css: 'Helvetica, Arial, sans-serif' },
  { id: 'arial', nome: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { id: 'verdana', nome: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  { id: 'tahoma', nome: 'Tahoma', css: 'Tahoma, Geneva, sans-serif' },
  { id: 'trebuchet', nome: 'Trebuchet MS', css: '"Trebuchet MS", Helvetica, sans-serif' },
  { id: 'calibri', nome: 'Calibri', css: 'Calibri, "Segoe UI", Arial, sans-serif' },
  { id: 'segoe', nome: 'Segoe UI', css: '"Segoe UI", Roboto, Arial, sans-serif' },
  { id: 'century-gothic', nome: 'Century Gothic', css: '"Century Gothic", "Apple SD Gothic Neo", Futura, sans-serif' },
  { id: 'gill-sans', nome: 'Gill Sans', css: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif' },
  // Monoespaçadas
  { id: 'mono', nome: 'Monoespaçada (Courier)', css: '"Courier New", Courier, monospace' },
  { id: 'consolas', nome: 'Consolas', css: 'Consolas, "Courier New", monospace' },
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
