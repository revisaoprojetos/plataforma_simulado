// CATÁLOGO de elementos (metadados + defaults + schema de campos). Sem UI/renderer — P3 implementa os renderers.
import type { CampoDef, CatalogoElementos, ElementoDef } from './registro'
import type { TipoElemento } from './tipos'

const toggle = (chave: string, rotulo: string, extra: Partial<CampoDef> = {}): CampoDef => ({ chave: `conteudo.${chave}`, rotulo, tipo: 'toggle', grupo: 'conteudo', ...extra })
const texto = (chave: string, rotulo: string, extra: Partial<CampoDef> = {}): CampoDef => ({ chave: `conteudo.${chave}`, rotulo, tipo: 'texto', grupo: 'conteudo', max_chars: 120, ...extra })
const tituloSecao: CampoDef = { chave: 'nome', rotulo: 'Título da seção', tipo: 'texto', grupo: 'conteudo', max_chars: 120, inline: true }

/** Campos de estilo comuns (todo elemento aceita; o renderer usa o que fizer sentido). */
const ESTILO_BASE: CampoDef[] = [
  { chave: 'estilo.cor', rotulo: 'Cor de destaque', tipo: 'token-cor', grupo: 'estilo' },
  { chave: 'estilo.fundo', rotulo: 'Fundo', tipo: 'token-cor', grupo: 'estilo' },
  { chave: 'estilo.espaco', rotulo: 'Espaçamento', tipo: 'seletor', grupo: 'estilo', opcoes: [{ v: 'sm', rotulo: 'Pequeno' }, { v: 'md', rotulo: 'Médio' }, { v: 'lg', rotulo: 'Grande' }] },
  { chave: 'estilo.raio', rotulo: 'Arredondamento', tipo: 'seletor', grupo: 'estilo', opcoes: [{ v: 'none', rotulo: 'Nenhum' }, { v: 'sm', rotulo: 'Pequeno' }, { v: 'md', rotulo: 'Médio' }, { v: 'lg', rotulo: 'Grande' }, { v: 'full', rotulo: 'Total' }] },
  { chave: 'estilo.alinhamento', rotulo: 'Alinhamento', tipo: 'seletor', grupo: 'estilo', opcoes: [{ v: 'left', rotulo: 'Esquerda' }, { v: 'center', rotulo: 'Centro' }, { v: 'right', rotulo: 'Direita' }] },
]
const ANCORA: CampoDef = { chave: 'ancora', rotulo: 'Âncora (#link)', tipo: 'texto', grupo: 'avancado', max_chars: 40, ajuda: 'Permite linkar direto para esta seção.' }
const unico = (tipo: TipoElemento) => ({ blocos }: { blocos: { tipo: string }[] }) => !blocos.some((b) => b.tipo === tipo)

const FORMATOS_MODULOS = [
  { id: 'herdar', rotulo: 'Padrão do produto' }, { id: 'grade', rotulo: 'Grade de cards' }, { id: 'carrossel', rotulo: 'Carrossel' },
  { id: 'lista', rotulo: 'Lista' }, { id: 'trilha', rotulo: 'Trilha' }, { id: 'trilha_imagem', rotulo: 'Trilha com imagem' }, { id: 'poster', rotulo: 'Pôsteres' },
]

const hero: ElementoDef<'hero'> = {
  tipo: 'hero', rotulo: 'Capa do produto', descricao: 'Banner no topo com nome, descrição, logo e validade do acesso.', icone: 'PanelTop', categoria: 'estrutura',
  variacoes: [{ id: 'banner', rotulo: 'Banner com grade e marca' }, { id: 'simples', rotulo: 'Simples (cor sólida)' }, { id: 'imagem', rotulo: 'Imagem de fundo' }],
  defaults: () => ({ variacao: 'banner', conteudo: { mostrar_voltar: true, mostrar_logo: true, mostrar_descricao: true, mostrar_validade: true, titulo: '', descricao: '', imagem: '' } }),
  schema: [
    texto('titulo', 'Título', { placeholder: 'Nome do produto', inline: true }),
    texto('descricao', 'Descrição', { placeholder: 'Descrição do produto', max_chars: 300, inline: true }),
    { chave: 'conteudo.imagem', rotulo: 'Imagem de fundo', tipo: 'imagem', grupo: 'conteudo', ajuda: 'Vazio = banner do produto.' },
    toggle('mostrar_voltar', 'Botão Voltar'), toggle('mostrar_logo', 'Logo'), toggle('mostrar_descricao', 'Descrição'), toggle('mostrar_validade', 'Validade do acesso'),
    ...ESTILO_BASE, ANCORA,
  ],
  podeAdicionar: unico('hero'), unico: true,
}
const avisos: ElementoDef<'avisos'> = {
  tipo: 'avisos', rotulo: 'Avisos', descricao: 'Avisos ativos do produto (fixados primeiro).', icone: 'Megaphone', categoria: 'conteudo',
  variacoes: [{ id: 'cards', rotulo: 'Cards' }, { id: 'faixa', rotulo: 'Faixa compacta' }],
  defaults: () => ({ variacao: 'cards', conteudo: { max: 10 } }),
  schema: [{ chave: 'conteudo.max', rotulo: 'Máximo de avisos', tipo: 'numero', grupo: 'conteudo', min: 1, max: 10 }, ...ESTILO_BASE, ANCORA],
  podeAdicionar: unico('avisos'), unico: true,
}
const progresso: ElementoDef<'progresso'> = {
  tipo: 'progresso', rotulo: 'Progresso geral', descricao: 'Progresso do aluno em todo o currículo.', icone: 'Gauge', categoria: 'conteudo',
  variacoes: [{ id: 'padrao', rotulo: 'Padrão' }],
  defaults: () => ({ variacao: 'padrao', conteudo: {} }),
  schema: [...ESTILO_BASE, ANCORA], podeAdicionar: unico('progresso'), unico: true,
}
const continuar: ElementoDef<'continuar'> = {
  tipo: 'continuar', rotulo: 'Continuar de onde parou', descricao: 'Progresso nos simulados e atalho para o próximo.', icone: 'PlayCircle', categoria: 'conteudo',
  variacoes: [{ id: 'card', rotulo: 'Card' }],
  defaults: () => ({ variacao: 'card', conteudo: { titulo: '', mostrar_barra: true, mostrar_proximo: true } }),
  schema: [texto('titulo', 'Título', { placeholder: 'Seu progresso nos simulados', inline: true }), toggle('mostrar_barra', 'Barra de progresso'), toggle('mostrar_proximo', 'Atalho "Continuar"'), ...ESTILO_BASE, ANCORA],
  podeAdicionar: unico('continuar'), unico: true,
}
const modulos: ElementoDef<'modulos'> = {
  tipo: 'modulos', rotulo: 'Módulos do curso', descricao: 'Prateleira de módulos do currículo.', icone: 'LayoutGrid', categoria: 'conteudo',
  variacoes: FORMATOS_MODULOS,
  defaults: () => ({ variacao: 'herdar', nome: 'Módulos do curso', conteudo: { modulo_ids: [], restantes: false, recolhivel: false, recolhida: false, agrupar_prefixo: false } }),
  schema: [
    tituloSecao,
    { chave: 'conteudo.modulo_ids', rotulo: 'Módulos desta seção', tipo: 'seletor', grupo: 'conteudo', ajuda: 'Múltipla escolha (lista vinda de DadosPagina.curriculo).' },
    toggle('restantes', 'Receber módulos restantes'), toggle('agrupar_prefixo', 'Agrupar por prefixo "X - "'),
    toggle('recolhivel', 'Seção recolhível'), toggle('recolhida', 'Começar recolhida', { visivelSe: { chave: 'conteudo.recolhivel', igual: true } }),
    ...ESTILO_BASE, ANCORA,
  ],
  podeAdicionar: () => true,
}
const cronograma: ElementoDef<'cronograma'> = {
  tipo: 'cronograma', rotulo: 'Plano de estudo', descricao: 'Resumo do cronograma do aluno.', icone: 'CalendarDays', categoria: 'conteudo',
  variacoes: [{ id: 'card', rotulo: 'Card compacto' }, { id: 'faixa', rotulo: 'Faixa larga' }, { id: 'lista', rotulo: 'Lista de próximas metas' }, { id: 'semana', rotulo: 'Destaque da semana' }],
  defaults: () => ({ variacao: 'card', nome: 'Plano de estudo', conteudo: { titulo: '', subtitulo: '', texto_botao: '', mostrar_metas: true, mostrar_progresso: true, mostrar_atrasadas: true, mostrar_hoje: true, mostrar_botao: true, qtd_metas: 3, cronograma_id: null } }),
  schema: [
    texto('titulo', 'Título', { inline: true }), texto('subtitulo', 'Subtítulo', { max_chars: 200, inline: true }), texto('texto_botao', 'Texto do botão', { max_chars: 40 }),
    toggle('mostrar_metas', 'Próximas metas'), { chave: 'conteudo.qtd_metas', rotulo: 'Qtd. de metas', tipo: 'numero', grupo: 'conteudo', min: 1, max: 5, visivelSe: { chave: 'conteudo.mostrar_metas', igual: true } },
    toggle('mostrar_progresso', 'Progresso da semana'), toggle('mostrar_hoje', 'Metas de hoje'), toggle('mostrar_atrasadas', 'Metas atrasadas'), toggle('mostrar_botao', 'Botão'),
    ...ESTILO_BASE, ANCORA,
  ],
  podeAdicionar: () => true,
}
const carrossel: ElementoDef<'carrossel'> = {
  tipo: 'carrossel', rotulo: 'Carrossel de itens', descricao: 'Fileira de simulados, pastas e cronogramas liberados.', icone: 'GalleryHorizontal', categoria: 'conteudo',
  variacoes: [{ id: 'vertical_small', rotulo: 'Vertical pequeno' }, { id: 'vertical_large', rotulo: 'Vertical grande' }, { id: 'horizontal_small', rotulo: 'Horizontal pequeno' }, { id: 'horizontal_large', rotulo: 'Horizontal grande' }, { id: 'destaque', rotulo: 'Destaque' }],
  defaults: () => ({ variacao: 'vertical_small', nome: 'Novo carrossel', conteudo: { itens: [], tamanho: 'vertical_small', ordenacao: 'manual' } }),
  schema: [
    tituloSecao,
    { chave: 'conteudo.itens', rotulo: 'Itens', tipo: 'seletor', grupo: 'conteudo', ajuda: 'Lista de {tipo_item,item_id} (picker de recursos do produto).' },
    { chave: 'conteudo.ordenacao', rotulo: 'Ordenação', tipo: 'seletor', grupo: 'conteudo', opcoes: [{ v: 'manual', rotulo: 'Manual' }, { v: 'alfabetica', rotulo: 'A-Z' }, { v: 'recentes', rotulo: 'Recentes' }] },
    ...ESTILO_BASE, ANCORA,
  ],
  podeAdicionar: () => true,
}
const banner: ElementoDef<'banner'> = {
  tipo: 'banner', rotulo: 'Banner de imagem', descricao: 'Imagem de largura cheia, com link opcional.', icone: 'Image', categoria: 'midia',
  variacoes: [{ id: 'cheio', rotulo: 'Largura cheia' }, { id: 'cartao', rotulo: 'Cartão com borda' }],
  defaults: () => ({ variacao: 'cheio', conteudo: { imagem: '', imagem_mobile: '', link: '', alt: '' } }),
  schema: [
    { chave: 'conteudo.imagem', rotulo: 'Imagem (desktop)', tipo: 'imagem', grupo: 'conteudo' }, { chave: 'conteudo.imagem_mobile', rotulo: 'Imagem (mobile)', tipo: 'imagem', grupo: 'conteudo' },
    { chave: 'conteudo.link', rotulo: 'Link', tipo: 'link', grupo: 'conteudo' }, texto('alt', 'Texto alternativo'), ...ESTILO_BASE, ANCORA,
  ],
  podeAdicionar: () => true,
}
const textoEl: ElementoDef<'texto'> = {
  tipo: 'texto', rotulo: 'Texto', descricao: 'Título e texto formatado livre.', icone: 'Type', categoria: 'conteudo',
  variacoes: [{ id: 'simples', rotulo: 'Simples' }, { id: 'destaque', rotulo: 'Caixa de destaque' }],
  defaults: () => ({ variacao: 'simples', conteudo: { titulo: '', html: '<p>Escreva aqui…</p>' } }),
  schema: [texto('titulo', 'Título', { inline: true }), { chave: 'conteudo.html', rotulo: 'Texto', tipo: 'rich', grupo: 'conteudo', max_chars: 8000, inline: true }, ...ESTILO_BASE, ANCORA],
  podeAdicionar: () => true,
}
const botao: ElementoDef<'botao'> = {
  tipo: 'botao', rotulo: 'Botão', descricao: 'Botão de chamada com link.', icone: 'MousePointerClick', categoria: 'acao',
  variacoes: [{ id: 'solido', rotulo: 'Sólido' }, { id: 'contorno', rotulo: 'Contorno' }, { id: 'link', rotulo: 'Link' }],
  defaults: () => ({ variacao: 'solido', conteudo: { rotulo: 'Saiba mais', link: '', nova_aba: false } }),
  schema: [texto('rotulo', 'Rótulo', { max_chars: 40, inline: true }), { chave: 'conteudo.link', rotulo: 'Link', tipo: 'link', grupo: 'conteudo' }, toggle('nova_aba', 'Abrir em nova aba'), ...ESTILO_BASE, ANCORA],
  podeAdicionar: () => true,
}
const divisor: ElementoDef<'divisor'> = {
  tipo: 'divisor', rotulo: 'Divisor', descricao: 'Linha ou espaço entre seções.', icone: 'Minus', categoria: 'estrutura',
  variacoes: [{ id: 'linha', rotulo: 'Linha' }, { id: 'espaco', rotulo: 'Só espaço' }, { id: 'titulo', rotulo: 'Linha com rótulo' }],
  defaults: () => ({ variacao: 'linha', conteudo: { rotulo: '' } }),
  schema: [texto('rotulo', 'Rótulo', { max_chars: 60, visivelSe: { chave: 'variacao', igual: 'titulo' } }), ...ESTILO_BASE.filter((c) => c.chave !== 'estilo.raio'), ANCORA],
  podeAdicionar: () => true,
}
const instrutores: ElementoDef<'instrutores'> = {
  tipo: 'instrutores', rotulo: 'Instrutores', descricao: 'Equipe de professores do produto (só disponível quando há instrutores cadastrados).', icone: 'Users', categoria: 'conteudo',
  variacoes: [{ id: 'cards', rotulo: 'Cards' }, { id: 'lista', rotulo: 'Lista' }],
  defaults: () => ({ variacao: 'cards', nome: 'Professores', conteudo: { titulo: '', ids: [] } }),
  schema: [tituloSecao, ...ESTILO_BASE, ANCORA],
  podeAdicionar: (ctx) => ctx.temInstrutores,
}

export const CATALOGO: CatalogoElementos = { hero, avisos, progresso, continuar, modulos, cronograma, carrossel, banner, texto: textoEl, botao, divisor, instrutores }
export const TIPOS_ELEMENTO = Object.keys(CATALOGO) as TipoElemento[]
export const getElemento = <T extends TipoElemento>(t: T): CatalogoElementos[T] => CATALOGO[t]
export const ehTipoElemento = (t: unknown): t is TipoElemento => typeof t === 'string' && t in CATALOGO
