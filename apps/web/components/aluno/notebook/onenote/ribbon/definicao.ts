// Definição declarativa do ribbon (spec §2). A UI (ribbon.tsx) só renderiza isto.
//
// COMO LIGAR UM BOTÃO (onda 2): registrar um handler para o `id` com useRegistrarComandos({ [id]: (payload) => ... }).
// Sem handler => botão desabilitado. Para destacar estado ativo: useOneNoteCmd().definirEstado(id, true|false|valor).
//   payload: botões com `menu` enviam `opcao.payload` (ou o `valor` da opção); `paleta` envia o `valor` da cor; `seletor` envia a string.
// Prefixos de id: arquivo.* | fmt.* (texto) | estilo.* | marca.* | inserir.* | desenho.* | historico.* | revisao.* | exibir.* | ajuda.* | edicao.*
import {
  AlignLeft, ArrowDownToLine, Baseline, BookOpen, ChevronsRightLeft, ClipboardPaste, Clock, Code, Copy, Eraser, Expand, FilePlus2, FileDown, FileText, FolderPlus,
  Highlighter, History, HelpCircle, IndentDecrease, IndentIncrease, Image as ImageIcon, Italic, Keyboard, Lasso, Link2, List, ListOrdered, Maximize, Minus, MousePointer2, Paintbrush,
  PanelLeft, PanelRight, Paperclip, Pen, PenLine, Printer, Quote, Redo2, Ruler, Scissors, SpellCheck, Star, Strikethrough, Subscript, Superscript, Table2, Trash2,
  Type, Underline, Hand, Palette, CalendarDays, CalendarClock, Smile, ZoomIn, ZoomOut, Search, HelpCircle as Pergunta, CheckSquare, Bookmark, Lightbulb, Lock, Shapes, Bold, Rows3, BookMarked, Settings2,
  type LucideIcon,
} from 'lucide-react'
import { CORES_PAGINA, REGUAS_UI } from '../tipos'

export type OpcaoMenu = { rotulo: string; payload?: unknown; id?: string }
export type Cor = { nome: string; valor: string | null }
export type ItemRibbon = {
  id: string; rotulo: string; icone: LucideIcon
  grande?: boolean; atalho?: string; alternar?: boolean
  /** Dropdown de opções. Com `soMenu` o botão inteiro abre o menu; senão há botão principal + seta. */
  menu?: OpcaoMenu[]; soMenu?: boolean
  paleta?: Cor[]
  seletor?: { opcoes: string[]; largura: number; padrao: string }
  /** Rótulo curto visível também no modo clássico para botões pequenos. */
  mostrarRotulo?: boolean
  /** Rótulo abreviado (telas médias e botão grande). */
  rotuloCurto?: string
  /** Linha (1|2) na grade compacta do modo clássico; sem isso os itens fluem em colunas de 2 linhas. */
  linha?: 1 | 2
  /** Recurso ainda sem handler (fase 2): fica desabilitado com tooltip "Em breve". */
  emBreve?: boolean
}
export type GrupoRibbon = { id: string; rotulo: string; itens: ItemRibbon[] }
export type AbaRibbon = { id: string; rotulo: string; grupos: GrupoRibbon[] }

export const CORES_TEXTO: Cor[] = [
  { nome: 'Automática', valor: null }, { nome: 'Preto', valor: '#1f1f1f' }, { nome: 'Cinza', valor: '#6b7280' }, { nome: 'Vermelho', valor: '#d64545' },
  { nome: 'Laranja', valor: '#f08a24' }, { nome: 'Amarelo', valor: '#e0a800' }, { nome: 'Verde', valor: '#2f9e5b' }, { nome: 'Ciano', valor: '#1b9aaa' },
  { nome: 'Azul', valor: '#2f6fd1' }, { nome: 'Roxo', valor: '#7b4bc4' }, { nome: 'Rosa', valor: '#d9549a' }, { nome: 'Marrom', valor: '#8d6249' },
]
export const CORES_REALCE: Cor[] = [
  { nome: 'Sem realce', valor: null }, { nome: 'Amarelo', valor: '#fff176' }, { nome: 'Verde', valor: '#b9f6ca' }, { nome: 'Ciano', valor: '#a7f0ff' },
  { nome: 'Rosa', valor: '#ffc1e3' }, { nome: 'Laranja', valor: '#ffd59e' }, { nome: 'Lilás', valor: '#e1c8ff' }, { nome: 'Cinza', valor: '#d9dde3' },
]
// Canetas: 16 cores-DADO (o aluno escolhe); 'tinta' = automática (segue o tema: legível no claro e no escuro).
export const CORES_CANETA: Cor[] = [
  { nome: 'Automática', valor: 'tinta' }, { nome: 'Preto', valor: '#1f1f1f' }, { nome: 'Cinza', valor: '#6b7280' }, { nome: 'Vermelho', valor: '#d64545' },
  { nome: 'Vermelho escuro', valor: '#9b1c1c' }, { nome: 'Laranja', valor: '#f08a24' }, { nome: 'Amarelo', valor: '#e0a800' }, { nome: 'Verde', valor: '#2f9e5b' },
  { nome: 'Verde escuro', valor: '#17653a' }, { nome: 'Ciano', valor: '#1b9aaa' }, { nome: 'Azul', valor: '#2f6fd1' }, { nome: 'Azul escuro', valor: '#1e3a8a' },
  { nome: 'Roxo', valor: '#7b4bc4' }, { nome: 'Magenta', valor: '#a8329c' }, { nome: 'Rosa', valor: '#d9549a' }, { nome: 'Marrom', valor: '#8d6249' },
]
const CORES_PAG: Cor[] = CORES_PAGINA.map((c) => ({ nome: c.rotulo, valor: c.chave }))

const FONTES = ['Segoe UI', 'Arial', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana']
const TAMANHOS = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72']

export const ABAS_RIBBON: AbaRibbon[] = [
  { id: 'arquivo', rotulo: 'Arquivo', grupos: [
    { id: 'novo', rotulo: 'Novo', itens: [
      { id: 'arquivo.nova_pagina', rotulo: 'Nova página', icone: FilePlus2, grande: true, atalho: 'Ctrl+O' },
      { id: 'arquivo.nova_secao', rotulo: 'Nova seção', icone: FolderPlus, grande: true, atalho: 'Ctrl+T' },
      { id: 'arquivo.novo_caderno', emBreve: true, rotulo: 'Novo caderno', icone: BookMarked, grande: true },
    ] },
    { id: 'exportar', rotulo: 'Exportar', itens: [
      { id: 'arquivo.exportar_pdf', rotulo: 'Exportar PDF', icone: FileDown, grande: true },
      { id: 'arquivo.exportar_docx', rotulo: 'Exportar Word', icone: FileText, grande: true },
      { id: 'arquivo.imprimir', rotulo: 'Imprimir', icone: Printer, grande: true },
    ] },
    { id: 'opcoes', rotulo: 'Opções', itens: [
      { id: 'arquivo.opcoes', emBreve: true, rotulo: 'Opções', icone: Settings2, grande: true },
    ] },
  ] },
  { id: 'inicio', rotulo: 'Página Inicial', grupos: [
    { id: 'transferencia', rotulo: 'Área de Transferência', itens: [
      { id: 'fmt.colar', rotulo: 'Colar', icone: ClipboardPaste, grande: true, atalho: 'Ctrl+V', menu: [{ rotulo: 'Colar' }, { rotulo: 'Colar sem formatação', payload: 'texto' }] },
      { id: 'fmt.recortar', rotulo: 'Recortar', mostrarRotulo: true, icone: Scissors, atalho: 'Ctrl+X' },
      { id: 'fmt.copiar', rotulo: 'Copiar', mostrarRotulo: true, icone: Copy, atalho: 'Ctrl+C' },
      { id: 'fmt.pincel', rotulo: 'Pincel de Formatação', rotuloCurto: 'Pincel', icone: Paintbrush, grande: true },
    ] },
    { id: 'texto', rotulo: 'Texto Básico', itens: [
      { id: 'fmt.fonte', rotulo: 'Fonte', linha: 1, icone: Type, seletor: { opcoes: FONTES, largura: 120, padrao: 'Segoe UI' } },
      { id: 'fmt.tamanho', rotulo: 'Tamanho', linha: 1, icone: Type, seletor: { opcoes: TAMANHOS, largura: 52, padrao: '16' } },
      { id: 'fmt.negrito', rotulo: 'Negrito', linha: 1, icone: Bold, atalho: 'Ctrl+B', alternar: true },
      { id: 'fmt.italico', rotulo: 'Itálico', linha: 1, icone: Italic, atalho: 'Ctrl+I', alternar: true },
      { id: 'fmt.sublinhado', rotulo: 'Sublinhado', linha: 1, icone: Underline, atalho: 'Ctrl+U', alternar: true },
      { id: 'fmt.tachado', rotulo: 'Tachado', linha: 1, icone: Strikethrough, atalho: 'Alt+Hífen', alternar: true },
      { id: 'fmt.subscrito', rotulo: 'Subscrito', linha: 1, icone: Subscript, alternar: true },
      { id: 'fmt.sobrescrito', rotulo: 'Sobrescrito', linha: 1, icone: Superscript, alternar: true },
      { id: 'fmt.realce', rotulo: 'Cor de realce', linha: 1, icone: Highlighter, paleta: CORES_REALCE },
      { id: 'fmt.cor_fonte', rotulo: 'Cor da fonte', linha: 2, icone: Baseline, paleta: CORES_TEXTO },
      { id: 'fmt.marcadores', rotulo: 'Marcadores', linha: 2, icone: List, atalho: 'Ctrl+.', alternar: true },
      { id: 'fmt.numeracao', rotulo: 'Numeração', linha: 2, icone: ListOrdered, atalho: 'Ctrl+/', alternar: true },
      { id: 'fmt.recuo_menos', rotulo: 'Diminuir recuo', linha: 2, icone: IndentDecrease, atalho: 'Shift+Tab' },
      { id: 'fmt.recuo_mais', rotulo: 'Aumentar recuo', linha: 2, icone: IndentIncrease, atalho: 'Tab' },
      { id: 'fmt.alinhar', rotulo: 'Alinhamento', linha: 2, icone: AlignLeft, soMenu: true, menu: [
        { rotulo: 'Alinhar à esquerda (Ctrl+Q)', payload: 'esquerda' }, { rotulo: 'Centralizar', payload: 'centro' },
        { rotulo: 'Alinhar à direita (Ctrl+R)', payload: 'direita' }, { rotulo: 'Justificar', payload: 'justificar' },
      ] },
      { id: 'fmt.limpar', rotulo: 'Limpar toda a formatação', linha: 2, icone: Eraser, atalho: 'Ctrl+Shift+N' },
    ] },
    { id: 'estilos', rotulo: 'Estilos', itens: [
      { id: 'estilo.h1', rotulo: 'Título 1', linha: 1, rotuloCurto: 'T1', icone: Type, atalho: 'Ctrl+Alt+1', mostrarRotulo: true },
      { id: 'estilo.h2', rotulo: 'Título 2', linha: 1, rotuloCurto: 'T2', icone: Type, atalho: 'Ctrl+Alt+2', mostrarRotulo: true },
      { id: 'estilo.h3', rotulo: 'Título 3', linha: 1, rotuloCurto: 'T3', icone: Type, atalho: 'Ctrl+Alt+3', mostrarRotulo: true },
      { id: 'estilo.mais', rotulo: 'Mais estilos', linha: 1, icone: Rows3, soMenu: true, menu: [
        { rotulo: 'Título 4', id: 'estilo.h4' }, { rotulo: 'Título 5', id: 'estilo.h5' }, { rotulo: 'Título 6', id: 'estilo.h6' },
        { rotulo: 'Título da Página', id: 'estilo.titulo_pagina' },
      ] },
      { id: 'estilo.citacao', rotulo: 'Citação', linha: 2, rotuloCurto: 'Cit.', icone: Quote, mostrarRotulo: true },
      { id: 'estilo.codigo', rotulo: 'Código', linha: 2, rotuloCurto: 'Cód.', icone: Code, mostrarRotulo: true },
      { id: 'estilo.normal', rotulo: 'Normal', linha: 2, rotuloCurto: 'Norm.', icone: AlignLeft, mostrarRotulo: true },
    ] },
    { id: 'marcas', rotulo: 'Marcas', itens: [
      { id: 'marca.a_fazer', rotulo: 'A Fazer', rotuloCurto: 'Fazer', icone: CheckSquare, atalho: 'Ctrl+1', mostrarRotulo: true },
      { id: 'marca.importante', rotulo: 'Importante', rotuloCurto: 'Import.', icone: Star, atalho: 'Ctrl+2', mostrarRotulo: true },
      { id: 'marca.pergunta', rotulo: 'Pergunta', rotuloCurto: 'Perg.', icone: Pergunta, atalho: 'Ctrl+3', mostrarRotulo: true },
      { id: 'marca.lembrar', rotulo: 'Lembrar-se', rotuloCurto: 'Lembrar', icone: Bookmark, atalho: 'Ctrl+4', mostrarRotulo: true },
      { id: 'marca.definicao', rotulo: 'Definição', rotuloCurto: 'Def.', icone: Lightbulb, atalho: 'Ctrl+5', mostrarRotulo: true },
      { id: 'marca.localizar', rotulo: 'Localizar marcas', rotuloCurto: 'Localizar', icone: Search, mostrarRotulo: true },
    ] },
  ] },
  { id: 'inserir', rotulo: 'Inserir', grupos: [
    { id: 'espaco', rotulo: 'Espaço', itens: [{ id: 'inserir.espaco', rotulo: 'Espaço Extra', icone: ArrowDownToLine, grande: true }] },
    { id: 'tabelas', rotulo: 'Tabelas', itens: [{ id: 'inserir.tabela', rotulo: 'Tabela', icone: Table2, grande: true }] },
    { id: 'arquivos', rotulo: 'Arquivos', itens: [{ id: 'inserir.arquivo', rotulo: 'Anexar Arquivo', icone: Paperclip, grande: true }] },
    { id: 'imagens', rotulo: 'Imagens', itens: [{ id: 'inserir.imagem', rotulo: 'Imagem', icone: ImageIcon, grande: true }] },
    { id: 'links', rotulo: 'Links', itens: [{ id: 'inserir.link', rotulo: 'Link', icone: Link2, grande: true, atalho: 'Ctrl+K' }] },
    { id: 'tempo', rotulo: 'Marcas de Tempo', itens: [
      { id: 'inserir.data', rotulo: 'Data', mostrarRotulo: true, icone: CalendarDays, atalho: 'Alt+Shift+D' },
      { id: 'inserir.hora', rotulo: 'Hora', mostrarRotulo: true, icone: Clock, atalho: 'Alt+Shift+T' },
      { id: 'inserir.data_hora', rotulo: 'Data e Hora', icone: CalendarClock, grande: true, atalho: 'Alt+Shift+F' },
    ] },
    { id: 'simbolos', rotulo: 'Símbolos', itens: [
      { id: 'inserir.simbolo', rotulo: 'Símbolo', mostrarRotulo: true, icone: Smile },
      { id: 'inserir.linha', rotulo: 'Linha horizontal', mostrarRotulo: true, icone: Minus },
    ] },
  ] },
  { id: 'desenhar', rotulo: 'Desenhar', grupos: [
    { id: 'ferramentas', rotulo: 'Ferramentas', itens: [
      { id: 'desenho.selecionar', rotulo: 'Selecionar Objetos ou Texto', icone: MousePointer2, grande: true, alternar: true },
      { id: 'desenho.laco', rotulo: 'Seleção com Laço', icone: Lasso, grande: true, alternar: true },
      { id: 'desenho.borracha', rotulo: 'Borracha', icone: Eraser, grande: true, alternar: true, menu: [
        { rotulo: 'Pequena', payload: 'pequena' }, { rotulo: 'Média', payload: 'media' }, { rotulo: 'Grande', payload: 'grande' }, { rotulo: 'Apagar traço', payload: 'traco' },
      ] },
      { id: 'desenho.texto', rotulo: 'Texto', icone: Type, grande: true, alternar: true },
    ] },
    { id: 'canetas', rotulo: 'Canetas', itens: [
      { id: 'desenho.caneta.1', rotulo: 'Caneta 1', icone: Pen, grande: true, alternar: true, paleta: CORES_CANETA },
      { id: 'desenho.caneta.2', rotulo: 'Caneta 2', icone: PenLine, grande: true, alternar: true, paleta: CORES_CANETA },
      { id: 'desenho.caneta.3', rotulo: 'Caneta 3', icone: Pen, grande: true, alternar: true, paleta: CORES_CANETA },
      { id: 'desenho.marca_texto', rotulo: 'Marca-texto', icone: Highlighter, grande: true, alternar: true, paleta: CORES_REALCE.slice(1) },
    ] },
    { id: 'formas', rotulo: 'Formas', itens: [{ id: 'desenho.formas', emBreve: true, rotulo: 'Formas', icone: Shapes, grande: true }] },
    { id: 'toque', rotulo: 'Toque', itens: [{ id: 'desenho.toque', rotulo: 'Desenhar com Toque', icone: Hand, grande: true, alternar: true }] },
  ] },
  { id: 'historico', rotulo: 'Histórico', grupos: [
    { id: 'versoes', rotulo: 'Versões', itens: [{ id: 'historico.versoes', emBreve: true, rotulo: 'Versões da Página', icone: History, grande: true }] },
    { id: 'lixeira', rotulo: 'Lixeira', itens: [
      { id: 'pagina.excluir', rotulo: 'Excluir Página', icone: Trash2, grande: true },
      { id: 'secao.excluir', rotulo: 'Excluir Seção', icone: Trash2, grande: true },
      { id: 'historico.lixeira', rotulo: 'Lixeira do Caderno', icone: History, grande: true },
    ] },
    { id: 'leitura', rotulo: 'Leitura', itens: [{ id: 'historico.lido', emBreve: true, rotulo: 'Marcar como Lido', icone: BookOpen, grande: true }] },
  ] },
  { id: 'revisao', rotulo: 'Revisão', grupos: [
    { id: 'ortografia', rotulo: 'Verificação', itens: [{ id: 'revisao.ortografia', emBreve: true, rotulo: 'Ortografia', icone: SpellCheck, grande: true }] },
    { id: 'protecao', rotulo: 'Proteção', itens: [{ id: 'revisao.proteger', emBreve: true, rotulo: 'Proteger Seção com Senha', icone: Lock, grande: true }] },
  ] },
  { id: 'exibir', rotulo: 'Exibir', grupos: [
    { id: 'exibicoes', rotulo: 'Exibições', itens: [
      { id: 'exibir.normal', rotulo: 'Normal', icone: PanelLeft, grande: true },
      { id: 'exibir.tela_cheia', rotulo: 'Tela Cheia', icone: Maximize, grande: true, atalho: 'F11', alternar: true },
      { id: 'exibir.imersivo', emBreve: true, rotulo: 'Modo Imersivo', icone: Expand, grande: true },
    ] },
    { id: 'pagina', rotulo: 'Página', itens: [
      { id: 'exibir.cor_pagina', rotulo: 'Cor da Página', icone: Palette, grande: true, paleta: CORES_PAG },
      { id: 'exibir.regua', rotulo: 'Linhas de Régua', icone: Ruler, grande: true, soMenu: true, menu: REGUAS_UI.map((r) => ({ rotulo: r.nome, payload: r.chave })) },
    ] },
    { id: 'zoom', rotulo: 'Zoom', itens: [
      { id: 'exibir.ampliar', rotulo: 'Ampliar', mostrarRotulo: true, icone: ZoomIn, atalho: 'Ctrl++' },
      { id: 'exibir.reduzir', rotulo: 'Reduzir', mostrarRotulo: true, icone: ZoomOut, atalho: 'Ctrl+-' },
      { id: 'exibir.zoom100', rotulo: '100%', mostrarRotulo: true, icone: Search },
      { id: 'exibir.largura', rotulo: 'Largura da Página', mostrarRotulo: true, icone: ChevronsRightLeft },
    ] },
    { id: 'paineis', rotulo: 'Painéis', itens: [
      { id: 'exibir.navegacao', rotulo: 'Painel de Navegação', icone: PanelLeft, grande: true, alternar: true, atalho: 'Ctrl+Alt+N' },
      { id: 'exibir.lista_paginas', rotulo: 'Lista de Páginas', icone: PanelRight, grande: true, alternar: true },
    ] },
  ] },
  { id: 'ajuda', rotulo: 'Ajuda', grupos: [
    { id: 'ajuda', rotulo: 'Ajuda', itens: [{ id: 'ajuda.atalhos', rotulo: 'Atalhos de Teclado', icone: Keyboard, grande: true, atalho: 'F1' }] },
  ] },
]
