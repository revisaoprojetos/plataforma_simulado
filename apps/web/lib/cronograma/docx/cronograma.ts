import 'server-only'

/**
 * DOCX do cronograma (spec §7.1).
 *
 * A4 paisagem. Capa com imagem de fundo e o nome do aluno em caixa alta; depois UMA
 * PÁGINA POR SEMANA, cada uma com cabeçalho e rodapé de imagem e uma tabela de oito
 * colunas: TIPO DE META + SEGUNDA a DOMINGO.
 *
 * Duas fidelidades ao gerador legado que valem registro:
 *  · são sempre os SETE dias, mesmo em cronogramas de cinco — as colunas sem meta ficam
 *    vazias, e é assim que os alunos conhecem o documento;
 *  · a duração impressa é UMA por (semana, tipo), a primeira encontrada (R21). Onde há
 *    divergência, alguma some do documento — o CRUD avisa a equipe.
 */

import { AlignmentType, Document, Packer, Paragraph, TableRow } from 'docx'
import { duracaoPorTipo } from '../gerador'
import type { Grade, MetaDatada, SemanaGrade, TipoMetaDef } from '../tipos'
import type { Paleta } from '../paletas'
import { PAGINA_PAISAGEM, ESTILOS, carregarArtes, celula, faixa, hx, imagem, link, sz, tabela, texto } from './comum'

/** Ordem das colunas: segunda a domingo, sempre as sete (spec §7.1). */
const DIAS_SEMANA = [
  { dow: 1, nome: 'SEGUNDA' },
  { dow: 2, nome: 'TERÇA' },
  { dow: 3, nome: 'QUARTA' },
  { dow: 4, nome: 'QUINTA' },
  { dow: 5, nome: 'SEXTA' },
  { dow: 6, nome: 'SÁBADO' },
  { dow: 0, nome: 'DOMINGO' },
]

const LARGURA_TIPO = 16
const LARGURA_DIA = (100 - LARGURA_TIPO) / 7

export type OpcoesDocx = {
  nomeAluno: string
  nomeCronograma: string
  paleta: Paleta
}

export async function gerarDocxCronograma(grade: Grade, op: OpcoesDocx): Promise<Buffer> {
  const artes = await carregarArtes()

  /**
   * Quais linhas de tipo a tabela terá.
   *
   * Os quatro tipos principais aparecem se existirem NO CRONOGRAMA INTEIRO — assim todas
   * as páginas têm a mesma estrutura. `simulado` e `juris` aparecem só na semana em que
   * existirem (spec §7.1).
   */
  const noCronograma = new Map<string, TipoMetaDef>()
  for (const s of grade.semanas) if (s.kind === 'conteudo') for (const m of s.metas) noCronograma.set(m.tipo, m.tipoDef)
  const ordenados = [...noCronograma.values()].sort((a, b) => a.ordem - b.ordem)
  // `sempre_no_docx` decide quem aparece em todas as páginas; os demais entram só na
  // semana em que houver meta deles.
  const principais = ordenados.filter((t) => t.sempre_no_docx)

  const filhos: (Paragraph | ReturnType<typeof tabela>)[] = []

  // ── Capa
  if (artes.capa) filhos.push(imagem(artes.capa, 940, 660))
  filhos.push(
    texto(op.nomeAluno.toUpperCase(), {
      size: sz(26),
      bold: true,
      align: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
    }),
  )
  filhos.push(texto(op.nomeCronograma, { size: sz(14), align: AlignmentType.CENTER, color: op.paleta.primaria }))
  filhos.push(
    texto(grade.resumo.subtitulo, {
      size: sz(10),
      align: AlignmentType.CENTER,
      color: '#666666',
      spacing: { after: 240 },
    }),
  )

  // ── Uma página por semana
  grade.semanas.forEach((semana, i) => {
    filhos.push(new Paragraph({ pageBreakBefore: true, children: [] }))
    if (artes.cabecalho) filhos.push(imagem(artes.cabecalho, 940, 90, 'jpg'))

    filhos.push(faixa(`SEMANA ${semana.numero} - ${fmtCurto(semana.inicio)} a ${fmtCurto(semana.fim)}`, op.paleta.primaria))
    filhos.push(faixa(`REVISÃO - ${op.nomeCronograma.toUpperCase()}`, op.paleta.revisao, { size: sz(9) }))
    filhos.push(texto('', { spacing: { after: 80 } }))

    filhos.push(semana.kind === 'conteudo' ? tabelaDaSemana(semana, principais, op.paleta) : blocoDeTexto(semana, op.paleta))

    if (artes.rodape) {
      filhos.push(texto('', { spacing: { before: 120 } }))
      filhos.push(imagem(artes.rodape, 940, 40))
    }
  })

  const doc = new Document({
    creator: 'Plataforma de Simulados',
    title: `Cronograma — ${op.nomeCronograma}`,
    description: `${op.nomeAluno} · ${grade.resumo.subtitulo} · conclusão em ${fmtCurto(grade.resumo.conclusao)}`,
    styles: ESTILOS,
    sections: [{ properties: { page: PAGINA_PAISAGEM }, children: filhos as any }],
  })
  return Packer.toBuffer(doc)
}

/** Semanas de revisão e recesso substituem a grade por um bloco de texto (spec §7.1). */
function blocoDeTexto(semana: Extract<SemanaGrade, { kind: 'revisao' | 'recesso' }>, paleta: Paleta) {
  const linhas: Paragraph[] =
    semana.kind === 'recesso'
      ? [
          texto('SEMANA DE RECESSO', { size: sz(14), bold: true, color: paleta.revisao }),
          texto('Não há metas programadas nesta semana; o cronograma será retomado na próxima segunda-feira.', {
            size: sz(11),
            spacing: { before: 120 },
          }),
        ]
      : [
          texto('SEMANA DE REVISÃO', { size: sz(14), bold: true, color: paleta.revisao }),
          ...semana.blocos.flatMap((b) => [
            texto(b.titulo, { size: sz(11), bold: true, spacing: { before: 160 } }),
            texto(b.texto, { size: sz(10) }),
          ]),
        ]
  return tabela([new TableRow({ children: [celula(linhas, { bg: paleta.celula, widthPct: 100 })] })])
}

function tabelaDaSemana(semana: Extract<SemanaGrade, { kind: 'conteudo' }>, principais: TipoMetaDef[], paleta: Paleta) {
  const naSemana = new Map<string, TipoMetaDef>()
  for (const m of semana.metas) naSemana.set(m.tipo, m.tipoDef)
  const eventuais = [...naSemana.values()].filter((t) => !t.sempre_no_docx).sort((a, b) => a.ordem - b.ordem)
  const tipos = [...principais, ...eventuais]
  const duracoes = duracaoPorTipo(semana.metas)

  const cabecalho = new TableRow({
    tableHeader: true,
    children: [
      celula([texto('TIPO DE META', { size: sz(9), bold: true, color: '#ffffff' })], { bg: paleta.cabecalho, widthPct: LARGURA_TIPO }),
      ...DIAS_SEMANA.map((d) =>
        celula([texto(d.nome, { size: sz(8), bold: true, color: '#ffffff', align: AlignmentType.CENTER })], {
          bg: paleta.cabecalho,
          widthPct: LARGURA_DIA,
        }),
      ),
    ],
  })

  const linhas = tipos.map((tipo) => {
    const duracao = duracoes.get(tipo.slug)
    const rotulo: Paragraph[] = [texto(tipo.rotulo_docx, { size: sz(9), bold: true })]
    if (duracao) rotulo.push(texto(`(${duracao})`, { size: sz(8), color: '#666666' }))

    return new TableRow({
      // A linha de PDFULL é mais alta que as outras (spec §7.1).
      height: tipo.destaque_docx ? { value: 1400, rule: 'atLeast' as const } : undefined,
      children: [
        celula(rotulo, { bg: paleta.celula, widthPct: LARGURA_TIPO }),
        ...DIAS_SEMANA.map((d) => {
          const doDia = semana.metas.filter((m) => m.tipo === tipo.slug && diaDaData(m.data) === d.dow)
          return celula(conteudoDaCelula(doDia), { widthPct: LARGURA_DIA })
        }),
      ],
    })
  })

  return tabela([cabecalho, ...linhas], { bordas: '#d4d4d8' })
}

function conteudoDaCelula(metas: MetaDatada[]): Paragraph[] {
  const out: Paragraph[] = []
  for (const m of metas) {
    out.push(texto(m.titulo, { size: sz(8) }))
    if (m.complemento) out.push(texto(m.complemento, { size: sz(7), color: '#666666' }))
    // Videoaula (plataforma "Vídeo") — destaque próprio, antes dos links de questões.
    if (m.video) out.push(link('▶ Vídeo', m.video, sz(7)))
    if (m.pdf) out.push(link('📄 PDF', m.pdf, sz(7)))
    // Os links entram como hyperlinks clicáveis (spec §7.1).
    for (const u of m.links?.urls ?? []) out.push(link(u.plataforma.nome, u.url, sz(7)))
    if (m.links?.ausente) out.push(texto(m.links.ausente, { size: sz(7), color: '#999999' }))
    if (m.simulado_externo_url) {
      out.push(link(m.simulado_externo_nome ?? 'Abrir simulado', m.simulado_externo_url, sz(7)))
    }
  }
  return out
}

/** Dia da semana (0=domingo) de uma data civil, sem passar pelo fuso local. */
function diaDaData(d: string): number {
  const [a, m, dia] = d.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, dia)).getUTCDay()
}

const fmtCurto = (d: string) => {
  const [, m, dia] = d.split('-')
  return `${dia}/${m}`
}
