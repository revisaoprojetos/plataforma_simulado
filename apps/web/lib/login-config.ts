// Configuração da tela de login POR EMPRESA (tenant). Guardada em `tema.login` (jsonb),
// editável no console. Vale para a tela do aluno e a do admin (mesma linguagem visual).

export type LoginTemplate = 'split' | 'central' | 'hero' | 'vitrine' | 'cartao'
export type LoginEntrada = 'nenhuma' | 'fade' | 'subir' | 'descer' | 'zoom' | 'deslizar' | 'mola' | 'giro'
export type LoginFundo = 'gradiente' | 'cor' | 'imagem'
export type LoginLado = 'esquerda' | 'direita'
export type CardEstilo = 'solido' | 'vidro'
export type LogoEstilo = 'arredondado' | 'quadrado' | 'borda'
export type LogoFiltro = 'none' | 'branco' | 'preto' | 'cor'
export type LogoTam = 'p' | 'm' | 'g'
export type BotaoEstilo = 'solido' | 'gradiente' | 'contorno'
export type CarModelo = 'spinner' | 'anel' | 'barra' | 'pulso' | 'pontos' | 'orbita'

export type LoginConfig = {
  template: LoginTemplate     // estilo/layout da tela
  animacaoEntrada: LoginEntrada // animação de aparecimento do card/formulário de login
  painelLado: LoginLado       // lado do painel da marca (só no template split)
  fundo: LoginFundo           // gradiente da marca | cor sólida | imagem
  fundoCor: string | null     // usado quando fundo = 'cor'
  fundoImagem: string | null  // usado quando fundo = 'imagem'
  fundoImagemCores: boolean   // brilhos (auroras) da primária/destaque SOBRE a imagem de fundo
  corPrimaria: string | null  // OVERRIDE da cor primária do login (botões/acento); null = usa o tema
  corAccent: string | null    // OVERRIDE da cor de destaque (kicker/checks); null = usa o tema
  corTextoMarca: string | null // cor do TEXTO do painel da marca (separada do fundo); null = branco
  corTextoForm: string | null  // cor do rótulo "Área do aluno" (lado do formulário); null = usa o destaque
  corTextoFormAdmin: string | null // cor do rótulo "Área administrativa" (modo admin); null = usa a do aluno
  cardEstilo: CardEstilo      // card do formulário: sólido | vidro (glass)
  // Logo (todas overrides; null = herda do tema)
  mostrarLogo: boolean        // exibe o logo/emblema
  logoUrl: string | null      // logo específico do login; null = logo do tema
  logoBg: string | null       // fundo atrás do logo; null = do tema
  logoEstilo: LogoEstilo | null // moldura do logo; null = do tema
  logoFiltro: LogoFiltro | null // filtro (branco/preto/cor/nenhum); null = do tema
  logoCor: string | null      // cor de tingimento quando logoFiltro = 'cor'
  logoOpacidade: number       // 0–100 (transparência da logo)
  logoTamanho: LogoTam        // tamanho do logo
  marcaNome: string | null    // nome da marca no painel/carregamento (ex.: "Revisão"); null = nome da plataforma
  marcaSub: string | null     // subtítulo da marca (ex.: "Ensino Jurídico"); null = do tema; '' = oculto
  titulo: string              // headline do painel da marca
  subtitulo: string           // texto de apoio
  textoKicker: string         // rótulo pequeno do formulário (ex.: "Área do aluno"); vazio = oculto
  textoKickerAdmin: string    // rótulo quando o botão Admin é acionado (ex.: "Área administrativa")
  textoEntrar: string         // título do formulário (ex.: "Entrar"); vazio = oculto
  textoPlataforma: string | null // nome exibido no formulário; null = usa o nome da plataforma; '' = oculto
  textoBotao: string          // rótulo do botão (ex.: "Entrar")
  botaoEstilo: BotaoEstilo    // sólido | gradiente | contorno
  botaoCor: string | null     // cor do botão; null = usa a primária
  textoRodape: string         // texto abaixo do botão (aluno); vazio = oculto
  textoRodapeAdmin: string    // texto abaixo do botão no modo admin; vazio = oculto
  destaques: string[]         // bullets do painel da marca
  mostrarMarca: boolean       // exibe o painel/cabeçalho da marca
  animacao: boolean           // véus/aurora animados no fundo
  // Tela de CARREGAMENTO (mostrada ao entrar na plataforma) — usa o mesmo fundo/cores da marca.
  carModelo: CarModelo        // modelo da animação de carregamento
  carTexto: string            // texto (ex.: "Entrando…"); vazio = oculto
  carTextoMarca: string | null // texto da marca no carregamento (ex.: "Revisão / Ensino Jurídico"); null = usa o nome da marca; '' = oculto
  carCorTexto: string | null  // cor dos textos do carregamento; null = usa a cor do texto da marca (ou branco)
  carCorAnim: string | null   // cor da animação (spinner/pontos/anel/órbita); null = usa o destaque
  carMostrarLogo: boolean     // exibe o logo na tela de carregamento
  // Logo do CARREGAMENTO (independente do logo do login; null = herda do tema)
  carLogoUrl: string | null
  carLogoBg: string | null
  carLogoEstilo: LogoEstilo | null
  carLogoFiltro: LogoFiltro | null
  carLogoCor: string | null
  carLogoOpacidade: number
  carLogoTamanho: LogoTam
}

export const LOGIN_DEFAULT: LoginConfig = {
  template: 'split',
  animacaoEntrada: 'nenhuma',
  painelLado: 'esquerda',
  fundo: 'gradiente',
  fundoCor: null,
  fundoImagem: null,
  fundoImagemCores: true,
  corPrimaria: null,
  corAccent: null,
  corTextoMarca: null,
  corTextoForm: null,
  corTextoFormAdmin: null,
  cardEstilo: 'vidro',
  mostrarLogo: true,
  logoUrl: null,
  logoBg: null,
  logoEstilo: null,
  logoFiltro: null,
  logoCor: null,
  logoOpacidade: 100,
  logoTamanho: 'm',
  marcaNome: null,
  marcaSub: null,
  titulo: 'Sua preparação começa aqui.',
  subtitulo: 'Entre com o seu e-mail e continue de onde parou — sem senha, sem atrito.',
  textoKicker: 'Área do aluno',
  textoKickerAdmin: 'Área administrativa',
  textoEntrar: 'Entrar',
  textoPlataforma: null,
  textoBotao: 'Entrar',
  botaoEstilo: 'solido',
  botaoCor: null,
  textoRodape: 'Como aluno, basta o e-mail — sem senha.',
  textoRodapeAdmin: 'Acesso restrito à equipe administrativa.',
  destaques: ['Simulados no padrão da banca', 'Correção automática e gabarito', 'Seu desempenho e evolução num só lugar'],
  mostrarMarca: true,
  animacao: true,
  carModelo: 'spinner',
  carTexto: 'Entrando…',
  carTextoMarca: null,
  carCorTexto: null,
  carCorAnim: null,
  carMostrarLogo: true,
  carLogoUrl: null,
  carLogoBg: null,
  carLogoEstilo: null,
  carLogoFiltro: null,
  carLogoCor: null,
  carLogoOpacidade: 100,
  carLogoTamanho: 'm',
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
  const ent = (['nenhuma', 'fade', 'subir', 'descer', 'zoom', 'deslizar', 'mola', 'giro'] as LoginEntrada[])
  return {
    template: tpl,
    animacaoEntrada: ent.includes(c.animacaoEntrada as LoginEntrada) ? (c.animacaoEntrada as LoginEntrada) : 'nenhuma',
    painelLado: c.painelLado === 'direita' ? 'direita' : 'esquerda',
    fundo,
    fundoCor: typeof c.fundoCor === 'string' ? c.fundoCor : null,
    fundoImagem: typeof c.fundoImagem === 'string' ? c.fundoImagem : null,
    fundoImagemCores: c.fundoImagemCores !== false,
    corPrimaria: typeof c.corPrimaria === 'string' && c.corPrimaria ? c.corPrimaria : null,
    corAccent: typeof c.corAccent === 'string' && c.corAccent ? c.corAccent : null,
    corTextoMarca: typeof c.corTextoMarca === 'string' && c.corTextoMarca ? c.corTextoMarca : null,
    corTextoForm: typeof c.corTextoForm === 'string' && c.corTextoForm ? c.corTextoForm : null,
    corTextoFormAdmin: typeof c.corTextoFormAdmin === 'string' && c.corTextoFormAdmin ? c.corTextoFormAdmin : null,
    cardEstilo: c.cardEstilo === 'solido' ? 'solido' : 'vidro',
    mostrarLogo: c.mostrarLogo !== false,
    logoUrl: typeof c.logoUrl === 'string' && c.logoUrl ? c.logoUrl : null,
    logoBg: typeof c.logoBg === 'string' && c.logoBg ? c.logoBg : null,
    logoEstilo: c.logoEstilo === 'quadrado' || c.logoEstilo === 'borda' || c.logoEstilo === 'arredondado' ? c.logoEstilo : null,
    logoFiltro: c.logoFiltro === 'branco' || c.logoFiltro === 'preto' || c.logoFiltro === 'cor' ? c.logoFiltro : (c.logoFiltro === 'none' ? 'none' : null),
    logoCor: typeof c.logoCor === 'string' && c.logoCor ? c.logoCor : null,
    logoOpacidade: typeof c.logoOpacidade === 'number' ? Math.min(100, Math.max(0, c.logoOpacidade)) : 100,
    logoTamanho: c.logoTamanho === 'p' || c.logoTamanho === 'g' ? c.logoTamanho : 'm',
    marcaNome: typeof c.marcaNome === 'string' ? c.marcaNome : null,
    marcaSub: typeof c.marcaSub === 'string' ? c.marcaSub : null,
    // título/subtítulo: string vazia = removido (oculto); undefined = usa o default.
    titulo: typeof c.titulo === 'string' ? c.titulo : LOGIN_DEFAULT.titulo,
    subtitulo: typeof c.subtitulo === 'string' ? c.subtitulo : LOGIN_DEFAULT.subtitulo,
    textoKicker: typeof c.textoKicker === 'string' ? c.textoKicker : LOGIN_DEFAULT.textoKicker,
    textoKickerAdmin: typeof c.textoKickerAdmin === 'string' ? c.textoKickerAdmin : LOGIN_DEFAULT.textoKickerAdmin,
    textoEntrar: typeof c.textoEntrar === 'string' ? c.textoEntrar : LOGIN_DEFAULT.textoEntrar,
    textoPlataforma: typeof c.textoPlataforma === 'string' ? c.textoPlataforma : null,
    textoBotao: typeof c.textoBotao === 'string' && c.textoBotao.trim() ? c.textoBotao : LOGIN_DEFAULT.textoBotao,
    botaoEstilo: c.botaoEstilo === 'gradiente' || c.botaoEstilo === 'contorno' ? c.botaoEstilo : 'solido',
    botaoCor: typeof c.botaoCor === 'string' && c.botaoCor ? c.botaoCor : null,
    textoRodape: typeof c.textoRodape === 'string' ? c.textoRodape : LOGIN_DEFAULT.textoRodape,
    textoRodapeAdmin: typeof c.textoRodapeAdmin === 'string' ? c.textoRodapeAdmin : LOGIN_DEFAULT.textoRodapeAdmin,
    destaques: Array.isArray(c.destaques) ? c.destaques.filter((x): x is string => typeof x === 'string').slice(0, 5) : LOGIN_DEFAULT.destaques,
    mostrarMarca: c.mostrarMarca !== false,
    animacao: c.animacao !== false,
    carModelo: (['spinner', 'anel', 'barra', 'pulso', 'pontos', 'orbita'] as CarModelo[]).includes(c.carModelo as CarModelo) ? (c.carModelo as CarModelo) : 'spinner',
    carTexto: typeof c.carTexto === 'string' ? c.carTexto : LOGIN_DEFAULT.carTexto,
    carTextoMarca: typeof c.carTextoMarca === 'string' ? c.carTextoMarca : null,
    carCorTexto: typeof c.carCorTexto === 'string' && c.carCorTexto ? c.carCorTexto : null,
    carCorAnim: typeof c.carCorAnim === 'string' && c.carCorAnim ? c.carCorAnim : null,
    carMostrarLogo: c.carMostrarLogo !== false,
    carLogoUrl: typeof c.carLogoUrl === 'string' && c.carLogoUrl ? c.carLogoUrl : null,
    carLogoBg: typeof c.carLogoBg === 'string' && c.carLogoBg ? c.carLogoBg : null,
    carLogoEstilo: c.carLogoEstilo === 'quadrado' || c.carLogoEstilo === 'borda' || c.carLogoEstilo === 'arredondado' ? c.carLogoEstilo : null,
    carLogoFiltro: c.carLogoFiltro === 'branco' || c.carLogoFiltro === 'preto' || c.carLogoFiltro === 'cor' || c.carLogoFiltro === 'none' ? c.carLogoFiltro : null,
    carLogoCor: typeof c.carLogoCor === 'string' && c.carLogoCor ? c.carLogoCor : null,
    carLogoOpacidade: typeof c.carLogoOpacidade === 'number' ? Math.min(100, Math.max(0, c.carLogoOpacidade)) : 100,
    carLogoTamanho: c.carLogoTamanho === 'p' || c.carLogoTamanho === 'g' ? c.carLogoTamanho : 'm',
  }
}

// Animações de aparecimento do card de login (classe CSS definida no <style> do formulário).
const ENTRADA_CLASSE: Record<LoginEntrada, string> = {
  nenhuma: '', fade: 'lge-fade', subir: 'lge-up', descer: 'lge-down',
  zoom: 'lge-zoom', deslizar: 'lge-slide', mola: 'lge-pop', giro: 'lge-giro',
}
/** Classe da animação de entrada do card (vazio = nenhuma). */
export const entradaClasse = (e: LoginEntrada): string => ENTRADA_CLASSE[e] ?? ''
/** Opções (valor + rótulo) para o seletor no console. */
export const ENTRADAS: [LoginEntrada, string][] = [
  ['nenhuma', 'Nenhuma'], ['fade', 'Fade'], ['subir', 'Subir'], ['descer', 'Descer'],
  ['zoom', 'Zoom'], ['deslizar', 'Deslizar'], ['mola', 'Mola'], ['giro', 'Giro 3D'],
]

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
