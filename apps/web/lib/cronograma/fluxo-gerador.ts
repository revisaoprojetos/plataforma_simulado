/**
 * FLUXO DO GERADOR DE CRONOGRAMAS como dados (adaptador 'cronograma-gerador'). Puro, sem I/O.
 * Pipeline R1–R21 (de `gerador.ts`) + o comportamento de cada TIPO DE META (cadastro editável, R10–R16).
 * O que é editável hoje no Gerador são os tipos de meta (tabela por tenant); o resto do pipeline é regra FIXA no código:
 * aparece no diagrama (leitura) com link para a tela onde cada insumo é gerenciado.
 */
import { BLOCOS_REVISAO, MAX_SEMANAS_CALENDARIO } from './gerador'
import { TEXTO_RECESSO } from './recesso'
import type { TipoMetaDef } from './tipos'
import type { ArestaFluxo, CampoSchema, DiagramaFluxo, EdicaoNo, NoFluxo, TipoNo } from '../admin/fluxo/adaptador'

export type TipoMetaFluxo = TipoMetaDef & { ativo?: boolean }

const L_TIPOS = { href: '/admin/cronogramas/tipos', rotulo: 'Editar em Tipos de meta' }
const L_CAT = { href: '/admin/cronogramas', rotulo: 'Abrir o Catálogo' }
const L_CONT = { href: '/admin/cronogramas/conteudos', rotulo: 'Abrir Conteúdos' }
const L_LINKS = { href: '/admin/cronogramas/links', rotulo: 'Abrir Links de aula' }
const L_ACES = { href: '/admin/cronogramas/pacotes', rotulo: 'Abrir Acessos' }

const no = (id: string, tipo: TipoNo, titulo: string, col: number, row: number, o: Pick<NoFluxo, 'descricao'> & Partial<Pick<NoFluxo, 'valor' | 'link' | 'inferido'>>): NoFluxo => ({ id, tipo, titulo, col, row, ...o })
const ar = (de: string, para: string, rotulo?: string): ArestaFluxo => ({ de, para, ...(rotulo ? { rotulo } : {}) })
const sn = (b: boolean) => (b ? 'sim' : 'não')

export function montarFluxoGerador(tipos: readonly TipoMetaFluxo[]): DiagramaFluxo[] {
  const ord = [...tipos].sort((a, b) => a.ordem - b.ordem)
  const FIXO = 'Regra fixa no código do gerador (não há tela para alterar).'
  const pipeline: DiagramaFluxo = {
    id: 'pipeline', titulo: 'Da grade do catálogo ao calendário datado',
    resumo: 'Como o gerador transforma uma grade fixa ("semana 7, dia 2") em datas reais, com semanas de revisão e recesso. Os insumos têm tela própria; as regras R1–R8 são fixas.',
    nos: [
      no('g.cad', 'inicio', 'Cronograma do catálogo', 0, 0, { link: L_CAT, descricao: 'Grade fixa cadastrada: semanas, dias da semana do curso (`dias_curso`) e metas (tipo, dia, ordem, conteúdo). É o insumo da geração.' }),
      no('g.cont', 'etapa', 'Conteúdos e links de aula', 0, 1, { link: L_CONT, descricao: 'Aulas do banco de conteúdos e links (PDF, vídeo, questões) ligados às metas; entram na formatação da meta datada.' }),
      no('g.opt', 'etapa', 'Opções do aluno', 1, 0, { descricao: 'Data de início, revisão a cada N semanas (ligada/desligada) e recesso (Natal, Ano Novo, Natal + Ano Novo, Outras com período). Informadas na emissão do cronograma.', inferido: true }),
      no('g.comp', 'etapa', 'R5 · Compactar semanas', 2, 0, { valor: 'Revisões originais descartadas', descricao: `Descarta as semanas de revisão do cadastro e renumera só as semanas com metas (1…N, sem buracos). A periodicidade de revisão conta sobre estes blocos. ${FIXO}` }),
      no('g.pauta', 'decisao', 'R6 · Semana de revisão?', 3, 0, { valor: `${BLOCOS_REVISAO.length} blocos de texto`, descricao: `Com a revisão ligada, a cada N blocos de conteúdo entra uma semana de revisão. Blocos fixos: ${BLOCOS_REVISAO.map((b) => `${b.titulo} — ${b.texto}`).join(' | ')}. ${FIXO}` }),
      no('g.rev', 'resultado', 'Semana de revisão', 3, 1, { descricao: 'Semana sem metas do cadastro, com os três blocos de texto de revisão.' }),
      no('g.rec', 'decisao', 'R8 · Semana de recesso?', 4, 0, { valor: 'Natal · Ano Novo · Outras', descricao: `Natal = semana que contém 25/12; Ano Novo = a que contém 01/01; "Outras" = intervalo informado (só vale com as duas datas). Recesso empurra o conteúdo para a semana seguinte. Guarda contra laço: até ${MAX_SEMANAS_CALENDARIO} semanas de calendário. ${FIXO}` }),
      no('g.recs', 'rejeicao', 'Semana de recesso', 4, 1, { descricao: TEXTO_RECESSO }),
      no('g.dat', 'etapa', 'R3 · Datar as metas', 5, 0, { valor: 'dia = índice em dias_curso', descricao: '`meta.dia` é ÍNDICE em `dias_curso`: pega o dia da semana alvo e avança a partir da segunda. Índice fora do intervalo cai na última coluna (com aviso).' }),
      no('g.ord', 'etapa', 'R10 · Ordenar no dia', 6, 0, { valor: ord.map((t) => t.nome).join(' › ') || 'sem tipos', link: L_TIPOS, descricao: 'Dentro da semana: por dia, depois pela ORDEM do tipo de meta (cadastro editável), depois pela ordem de origem. Reordene em Tipos de meta.' }),
      no('g.fmt', 'etapa', 'R11–R16 · Formatar por tipo', 7, 0, { link: L_TIPOS, descricao: 'Cada meta é formatada pelo comportamento do seu tipo: links de questões, prefixo "Aula NN", aula no título, quebra do conteúdo, contagem em "Atividades", destaque e presença no DOCX (veja o diagrama Tipos de meta).' }),
      no('g.fim', 'resultado', 'Grade datada / DOCX', 8, 0, { link: L_ACES, descricao: 'Calendário com semanas de conteúdo, revisão e recesso, resumo da grade e DOCX/CSV exportáveis — a mesma saída na tela e no arquivo.' }),
    ],
    arestas: [ar('g.cad', 'g.opt'), ar('g.cont', 'g.dat', 'links'), ar('g.opt', 'g.comp'), ar('g.comp', 'g.pauta'), ar('g.pauta', 'g.rev', 'sim'), ar('g.pauta', 'g.rec', 'não'), ar('g.rev', 'g.rec'), ar('g.rec', 'g.recs', 'sim'), ar('g.rec', 'g.dat', 'não'),
      ar('g.recs', 'g.pauta', 'próxima semana'), ar('g.dat', 'g.ord'), ar('g.ord', 'g.fmt'), ar('g.fmt', 'g.fim')],
  }

  const nt: NoFluxo[] = [no('t.ini', 'inicio', 'Meta da grade', 0, 0, { descricao: 'Toda meta tem um tipo (slug). Slug sem cadastro cai no comportamento neutro (aparece, conta, sem formatação especial).' })]
  const at: ArestaFluxo[] = []
  ord.forEach((t, i) => {
    const flags = `links ${sn(t.mostra_links)} · prefixo ${sn(t.prefixo_aula)} · aula no título ${sn(t.aula_no_titulo)} · quebra ${sn(t.quebra_conteudo)} · atividade ${sn(t.conta_atividade)} · destaque ${sn(t.destaque_docx)} · sempre no DOCX ${sn(t.sempre_no_docx)}`
    nt.push(no(`t.${t.slug}`, t.ativo === false ? 'aberto' : 'etapa', `${i + 1}. ${t.nome}`, 1 + (i % 4), Math.floor(i / 4), { valor: t.ativo === false ? 'Desativado' : `Ordem ${t.ordem}`, link: L_TIPOS, descricao: `Tipo "${t.slug}" · rótulo no DOCX: ${t.rotulo_docx}. ${flags}.` }))
    at.push(ar(i === 0 ? 't.ini' : `t.${ord[i - 1].slug}`, `t.${t.slug}`, i === 0 ? undefined : 'depois'))
  })
  const tiposD: DiagramaFluxo = { id: 'tipos', titulo: 'Tipos de meta (comportamento)', resumo: 'Ordem R10 (esquerda→direita, em linhas) e os sete comportamentos de cada tipo. Clique para editar nome, rótulo, cor, comportamentos e ativar/desativar.', nos: nt, arestas: at }
  return [pipeline, tiposD]
}

const BOOLS: Array<[keyof TipoMetaDef, string, string]> = [
  ['mostra_links', 'R11 · Mostra links de questões', 'Exibe os links (QC/TEC…) da aula na meta.'],
  ['prefixo_aula', 'R12 · Prefixo "Aula NN"', 'O conteúdo ganha o prefixo "Aula NN - ".'],
  ['aula_no_titulo', 'R15 · Aula no título', 'Com aula preenchida, mostra "Disciplina: Aula N" e ignora o conteúdo.'],
  ['quebra_conteudo', 'R14 · Quebra o conteúdo', 'Quebra o conteúdo em título + complemento.'],
  ['conta_atividade', 'R16 · Conta como atividade', 'Entra na contagem de "Atividades".'],
  ['destaque_docx', 'Linha de destaque no DOCX', 'Linha mais alta no DOCX.'],
  ['sempre_no_docx', 'Sempre no DOCX', 'Aparece em todas as páginas do DOCX, não só onde há meta do tipo.'],
]

/** Campos editáveis do nó `t.<slug>` (alvo = id do tipo). `null` = nó sem edição. */
export function camposDoNoGerador(noId: string, tipos: readonly TipoMetaFluxo[]): EdicaoNo | null {
  if (!noId.startsWith('t.')) return null
  const t = tipos.find((x) => `t.${x.slug}` === noId)
  if (!t || !t.id) return null
  const campos: CampoSchema[] = [
    { chave: 'nome', rotulo: 'Nome', tipo: 'texto', valor: t.nome, min: 1, max: 80, grupo: 'Identificação' },
    { chave: 'rotulo_docx', rotulo: 'Rótulo na coluna "TIPO DE META" do DOCX', tipo: 'texto', valor: t.rotulo_docx, min: 0, max: 60, grupo: 'Identificação', dica: 'Vazio = nome em maiúsculas.' },
    { chave: 'cor', rotulo: 'Cor (token ou hex já cadastrado)', tipo: 'cor', valor: t.cor ?? '', grupo: 'Identificação' },
    ...BOOLS.map(([k, rotulo, dica]): CampoSchema => ({ chave: k, rotulo, tipo: 'bool', valor: t[k] as boolean, dica, grupo: 'Comportamento' })),
    { chave: 'ativo', rotulo: 'Ativo (aparece na escolha de tipo)', tipo: 'bool', valor: t.ativo !== false, grupo: 'Situação', dica: 'Tipo em uso não é excluído: desative.' },
  ]
  return { alvo: t.id, campos, aviso: 'O slug não muda. Criar, reordenar e excluir tipos continua em Tipos de meta.' }
}

export const CHAVES_TIPO = ['nome', 'rotulo_docx', 'cor', 'ativo', ...BOOLS.map((b) => b[0] as string)] as const
