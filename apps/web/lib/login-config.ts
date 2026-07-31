// Configuração da tela de login POR EMPRESA (tenant). Guardada em `tema.login` (jsonb),
// editável no console. Vale para a tela do aluno e a do admin (mesma linguagem visual).

export type LoginLayout = 'split' | 'centro' | 'full'
export type LoginFundo = 'gradiente' | 'cor' | 'imagem'
export type LoginLado = 'esquerda' | 'direita'

export type LoginConfig = {
  layout: LoginLayout        // split (painel+form) | centro (form central) | full (fundo cheio + card)
  painelLado: LoginLado      // lado do painel da marca (só no layout split)
  fundo: LoginFundo          // gradiente da marca | cor sólida | imagem
  fundoCor: string | null    // usado quando fundo = 'cor'
  fundoImagem: string | null // usado quando fundo = 'imagem'
  titulo: string             // headline do painel da marca
  subtitulo: string          // texto de apoio abaixo do headline
  destaques: string[]        // bullets do painel da marca
  mostrarMarca: boolean      // exibe o painel da marca (no split/full)
  animacao: boolean          // véus/aurora animados no fundo
}

export const LOGIN_DEFAULT: LoginConfig = {
  layout: 'split',
  painelLado: 'esquerda',
  fundo: 'gradiente',
  fundoCor: null,
  fundoImagem: null,
  titulo: 'Sua preparação começa aqui.',
  subtitulo: 'Entre com o seu e-mail e continue de onde parou — sem senha, sem atrito.',
  destaques: ['Simulados no padrão da banca', 'Correção automática e gabarito', 'Seu desempenho e evolução num só lugar'],
  mostrarMarca: true,
  animacao: true,
}

/** Resolve a config vinda de `tema.login` aplicando defaults e saneando os tipos. */
export function resolverLoginConfig(raw: unknown): LoginConfig {
  const c = (raw ?? {}) as Partial<LoginConfig>
  const layout: LoginLayout = c.layout === 'centro' || c.layout === 'full' ? c.layout : 'split'
  const fundo: LoginFundo = c.fundo === 'cor' || c.fundo === 'imagem' ? c.fundo : 'gradiente'
  return {
    layout,
    painelLado: c.painelLado === 'direita' ? 'direita' : 'esquerda',
    fundo,
    fundoCor: typeof c.fundoCor === 'string' ? c.fundoCor : null,
    fundoImagem: typeof c.fundoImagem === 'string' ? c.fundoImagem : null,
    titulo: typeof c.titulo === 'string' && c.titulo.trim() ? c.titulo : LOGIN_DEFAULT.titulo,
    subtitulo: typeof c.subtitulo === 'string' ? c.subtitulo : LOGIN_DEFAULT.subtitulo,
    destaques: Array.isArray(c.destaques) ? c.destaques.filter((x): x is string => typeof x === 'string').slice(0, 5) : LOGIN_DEFAULT.destaques,
    mostrarMarca: c.mostrarMarca !== false,
    animacao: c.animacao !== false,
  }
}

/** Estilo do fundo da marca (painel/tela) a partir da config. */
export function fundoLoginStyle(c: LoginConfig): React.CSSProperties {
  if (c.fundo === 'imagem' && c.fundoImagem) return { backgroundImage: `url(${c.fundoImagem})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  if (c.fundo === 'cor' && c.fundoCor) return { background: c.fundoCor }
  return { background: 'linear-gradient(150deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 68%, #0b0716) 58%, #0b0716 130%)' }
}
