// TOKENS DE COR permitidos no editor da página do extensivo. Guarda-se SEMPRE o NOME do token (nunca hex):
// o valor muda com o tenant/tema (claro/escuro) porque resolve para a CSS var do design-system.
// TS puro (cliente + servidor).

export const TOKENS_COR = [
  'produto',            // cor principal do próprio produto (simulado_produtos.cor) — comportamento legado
  'produto-2',          // cor secundária do produto
  'primary', 'primary-foreground',
  'secondary', 'secondary-foreground',
  'accent', 'accent-foreground',
  'brand-accent',
  'foreground', 'background', 'card',
  'muted', 'muted-foreground', 'border',
  'destructive',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
] as const
export type TokenCor = (typeof TOKENS_COR)[number]

export const ehTokenCor = (v: unknown): v is TokenCor => typeof v === 'string' && (TOKENS_COR as readonly string[]).includes(v)

export const ROTULO_TOKEN: Record<TokenCor, string> = {
  produto: 'Cor do produto', 'produto-2': 'Cor secundária do produto',
  primary: 'Principal', 'primary-foreground': 'Texto sobre principal',
  secondary: 'Secundária', 'secondary-foreground': 'Texto sobre secundária',
  accent: 'Destaque suave', 'accent-foreground': 'Texto sobre destaque',
  'brand-accent': 'Destaque da marca',
  foreground: 'Texto', background: 'Fundo da página', card: 'Cartão',
  muted: 'Neutra', 'muted-foreground': 'Texto suave', border: 'Borda',
  destructive: 'Alerta',
  'chart-1': 'Paleta 1', 'chart-2': 'Paleta 2', 'chart-3': 'Paleta 3', 'chart-4': 'Paleta 4', 'chart-5': 'Paleta 5',
}

/** Par "texto legível sobre este fundo" (para o renderer escolher a cor do texto quando `fundo` é definido). */
export const TEXTO_SOBRE: Partial<Record<TokenCor, TokenCor>> = {
  primary: 'primary-foreground', secondary: 'secondary-foreground', accent: 'accent-foreground',
  card: 'foreground', background: 'foreground', muted: 'foreground', destructive: 'primary-foreground',
}

/** Contexto de cores do produto (os 2 tokens 'produto*' não são CSS vars globais). */
export interface CoresProduto { cor: string; cor2: string }

/** Token → valor CSS (`var(--x)`; 'produto*' vêm das cores do produto). Use isto, nunca monte hex. */
export function corCss(t: TokenCor | undefined | null, p: CoresProduto): string | undefined {
  if (!t) return undefined
  if (t === 'produto') return p.cor
  if (t === 'produto-2') return p.cor2
  return `var(--${t})`
}
