import 'server-only'
import type { Grade, SemanaGrade, MetaDatada, TipoMetaDef, TipoMeta } from '@/lib/cronograma/tipos'
import type { AdaptativoSnapshot, MetaVM } from './snapshot'
import { DIAS } from './conteudo'

// Adaptador: AdaptativoSnapshot → Grade (tipo do gerador DOCX legado), para reusar
// gerarDocxCronograma (A4 paisagem, 1 página/semana, tabela de 8 colunas). As semanas de
// revisão do adaptativo têm metas concretas (rf/rq), então são emitidas como 'conteudo'
// para aparecerem na grade do documento.

const DEFS: Record<TipoMeta, TipoMetaDef> = {
  pdfull: def('pdfull', 'PDFULL', 'PDFULL', 0, true),
  flash: def('flash', 'Revisão', 'REVISÃO', 1, true),
  quest: def('quest', 'Questões', 'RESOLUÇÃO DE QUESTÕES', 2, true),
  legproc: def('legproc', 'LegProc', 'LEGPROC', 3, true),
  juris: def('juris', 'Jurisprudência', 'JURISPRUDÊNCIA', 4, false),
  simulado: def('simulado', 'Simulado', 'SIMULADO', 5, false),
}

function def(slug: TipoMeta, nome: string, rotulo: string, ordem: number, sempre: boolean): TipoMetaDef {
  return {
    id: slug, slug, nome, rotulo_docx: rotulo, ordem, cor: null,
    mostra_links: false, prefixo_aula: false, aula_no_titulo: false, quebra_conteudo: false,
    conta_atividade: slug !== 'simulado' && slug !== 'juris', destaque_docx: false, sempre_no_docx: sempre,
  }
}

function tipoCatalogo(t: string): TipoMeta {
  if (t === 'pf' || t === 'pp') return 'pdfull'
  if (t === 'fl' || t === 'rf') return 'flash'
  if (t === 'qu' || t === 'rq') return 'quest'
  return 'legproc'
}

function fH(min: number): string {
  const hh = Math.floor(min / 60), mm = min % 60
  return hh ? hh + 'h' + (mm ? String(mm).padStart(2, '0') : '') : mm + 'min'
}

function metaDatada(m: MetaVM, semana: number): MetaDatada {
  const tipo = tipoCatalogo(m.tipo)
  return {
    id: m.id, semana, dia: m.data ? (new Date(m.data + 'T12:00:00').getDay() + 6) % 7 : 0,
    tipo, disciplina: m.disc, disciplina_id: null, aula: m.aula || null,
    conteudo: m.titulo, duracao: fH(m.durMin), ordem: 0,
    simulado_id: null, simulado_externo_nome: null, simulado_externo_url: null,
    tipoDef: DEFS[tipo], data: m.data, diaNome: DIAS[(new Date(m.data + 'T12:00:00').getDay() + 6) % 7] || '',
    titulo: m.titulo, complemento: null, links: null,
  }
}

export function snapshotParaGrade(snap: AdaptativoSnapshot): Grade {
  const semanas: SemanaGrade[] = snap.semanas.map((s) => {
    if (s.kind === 'recesso') return { kind: 'recesso', numero: s.n, inicio: s.ini, fim: s.fim }
    const metas: MetaDatada[] = s.dias.flatMap((d) => d.metas.map((m) => metaDatada(m, s.n)))
    return { kind: 'conteudo', numero: s.n, inicio: s.ini, fim: s.fim, metas }
  })
  const semanasConteudo = snap.semanas.filter((s) => s.kind === 'conteudo').length
  const semanasRevisao = snap.semanas.filter((s) => s.kind === 'revisao').length
  const semanasRecesso = snap.semanas.filter((s) => s.kind === 'recesso').length
  const ultima = snap.semanas[snap.semanas.length - 1]
  return {
    semanas,
    resumo: {
      totalSemanas: snap.semanas.length, semanasConteudo, semanasRevisao, semanasRecesso,
      diasPorSemana: snap.config.nDias, atividades: snap.desempenho.total,
      conclusao: ultima ? ultima.fim : snap.cfg.start, subtitulo: '',
    },
    avisos: [],
  }
}
