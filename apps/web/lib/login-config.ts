// Configuração da tela de login POR EMPRESA (tenant). Guardada em `tema.login` (jsonb),
// editável no console. Vale para a tela do aluno e a do admin (mesma linguagem visual).

export type LoginTemplate = 'split' | 'central' | 'hero' | 'vitrine' | 'cartao'
export type LoginFundo = 'gradiente' | 'cor' | 'imagem'
export type LoginLado = 'esquerda' | 'direita'
export type CardEstilo = 'solido' | 'vidro'

export type LoginConfig = {
  template: LoginTemplate     // estilo/layout da tela
  painelLado: LoginLado       // lado do painel da marca (só no template split)
  fundo: LoginFundo           // gradiente da marca | cor sólida | imagem
  fundoCor: string | null     // usado quando fundo = 'cor'
  fundoImagem: string | null  // usado quando fundo = 'imagem'
  corPrimaria: string | null  // OVERRIDE da cor primária do login (botões/acento); null = usa o tema
  corAccent: string | null    // OVERRIDE da cor de destaque (kicker/checks); null = usa o tema
  cardEstilo: CardEstilo      // card do formulário: sólido | vidro (glass)
  titulo: string              // headline do painel da marca
  subtitulo: string           // texto de apoio
  destaques: string[]         // bullets do painel da marca
  mostrarMarca: boolean       // exibe o painel/cabeçalho da marca
  animacao: boolean           // véus/aurora animados no fundo
}

export const LOGIN_DEFAULT: LoginConfig = {
  template: 'split',
  painelLado: 'esquerda',
  fundo: 'gradiente',
  fundoCor: null,
  fundoImagem: null,
  corPrimaria: null,
  corAccent: null,
  cardEstilo: 'vidro',
  titulo: 'Sua preparação começa aqui.',
  subtitulo: 'Entre com o seu e-mail e continue de onde parou — sem senha, sem atrito.',
  destaques: ['Simulados no padrão da banca', 'Correção automática e gabarito', 'Seu desempenho e evolução num só lugar'],
  mostrarMarca: true,
  animacao: true,
}

const TEMPLATES: LoginTemplate[] = ['split', 'central', 'hero', 'vitrine', 'cartao']

/** Resolve a config vinda de `tema.login` aplicando defaults, migrando o formato antigo (`layout`)
 *  e saneando os tipos. */
export function resolverLoginConfig(raw: unknown): LoginConfig {
  const c = (raw ?? {}) as Partial<LoginConfig> & { layout?: string }
  // Migração do formato v1 (layout: split|centro|full) → template.
  let template = c.template
  if (!template && c.layout) template = c.layout === 'centro' ? 'central' : c.layout === 'full' ? 'hero' : 'split'
  const tpl: LoginTemplate = TEMPLATES.includes(template as LoginTemplate) ? (template as LoginTemplate) : 'split'
  const fundo: LoginFundo = c.fundo === 'cor' || c.fundo === 'imagem' ? c.fundo : 'gradiente'
  return {
    template: tpl,
    painelLado: c.painelLado === 'direita' ? 'direita' : 'esquerda',
    fundo,
    fundoCor: typeof c.fundoCor === 'string' ? c.fundoCor : null,
    fundoImagem: typeof c.fundoImagem === 'string' ? c.fundoImagem : null,
    corPrimaria: typeof c.corPrimaria === 'string' && c.corPrimaria ? c.corPrimaria : null,
    corAccent: typeof c.corAccent === 'string' && c.corAccent ? c.corAccent : null,
    cardEstilo: c.cardEstilo === 'solido' ? 'solido' : 'vidro',
    titulo: typeof c.titulo === 'string' && c.titulo.trim() ? c.titulo : LOGIN_DEFAULT.titulo,
    subtitulo: typeof c.subtitulo === 'string' ? c.subtitulo : LOGIN_DEFAULT.subtitulo,
    destaques: Array.isArray(c.destaques) ? c.destaques.filter((x): x is string => typeof x === 'string').slice(0, 5) : LOGIN_DEFAULT.destaques,
    mostrarMarca: c.mostrarMarca !== false,
    animacao: c.animacao !== false,
  }
}

/** Cor primária/accent efetivas (override do login OU token do tema). */
export const corPrimariaLogin = (c: LoginConfig) => c.corPrimaria ?? 'var(--primary)'
export const corAccentLogin = (c: LoginConfig) => c.corAccent ?? 'var(--brand-accent)'

/** Variáveis CSS aplicadas na raiz do login (cascateiam p/ bg-primary, text-primary, --brand-accent…). */
export function loginVars(c: LoginConfig): React.CSSProperties {
  const v: Record<string, string> = {}
  if (c.corPrimaria) { v['--primary'] = c.corPrimaria; v['--ring'] = c.corPrimaria }
  if (c.corAccent) v['--brand-accent'] = c.corAccent
  return v as React.CSSProperties
}

/** Estilo do fundo da marca (painel/tela) a partir da config. */
export function fundoLoginStyle(c: LoginConfig): React.CSSProperties {
  if (c.fundo === 'imagem' && c.fundoImagem) return { backgroundImage: `url(${c.fundoImagem})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  if (c.fundo === 'cor' && c.fundoCor) return { background: c.fundoCor }
  const p = corPrimariaLogin(c)
  return { background: `linear-gradient(150deg, ${p} 0%, color-mix(in oklab, ${p} 66%, #0b0716) 58%, #0b0716 130%)` }
}
