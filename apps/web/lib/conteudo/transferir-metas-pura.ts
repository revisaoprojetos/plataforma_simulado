// Regras PURAS (sem I/O) do "Transferir metas" da Biblioteca: validação origem→destino, avisos e a tabela "antes → depois".
// Estratégia (ver migração 20261210000000): trocar a chave 'd:<origem>' por 'd:<destino>' na assinatura (cfg.chavesAS) dos planos
// ATIVOS; o remap por chave (garantirAS) reposiciona progresso/grade quando o aluno abre o plano. Concluídas mantêm o histórico.

export type DocResumo = {
  id: string; titulo: string; status: string | null; deletado: boolean
  /** tipo_origem (pdf | docx | html | …) */
  tipo: string | null
  /** o documento compõe uma AULA do Cronograma Adaptativo hoje (publicado em pasta PDFull)? null = não verificado */
  emAulas: boolean | null
}

/** Contagens da prévia (todas relativas aos planos NÃO arquivados). */
export type ContagensTransferencia = {
  /** planos ativos com a origem na assinatura e SEM o destino → serão repontados */
  planosTransferiveis: number
  /** linhas do espelho (metas) desses planos que apontam p/ a origem (tipos de aula) */
  metasTransferiveis: number
  /** dessas, quantas o aluno já concluiu (o histórico é mantido) */
  metasConcluidas: number
  /** planos que já têm o destino: NÃO são tocados (a origem ficaria órfã) */
  planosConflito: number
  /** planos em que a origem já está órfã (cfg.orfas) */
  planosOrfas: number
  /** planos legados (sem assinatura por chave): não há como reapontar com segurança */
  planosLegados: number
  /** metas LegProc/Jurisprudência/gx: o documento vem da PASTA em runtime — não transferíveis */
  metasDerivadas: number
  /** vínculos explícitos do cronograma Revisão (meta_conteudo) */
  metaConteudo: number
  /** planos com descrição LegProc legada apontando p/ a origem */
  planosLpLegado: number
  /** definições ativas do catálogo (meta_def) ligadas ao documento */
  defsAtivas: number
}

export const CONTAGENS_VAZIAS: ContagensTransferencia = {
  planosTransferiveis: 0, metasTransferiveis: 0, metasConcluidas: 0, planosConflito: 0, planosOrfas: 0, planosLegados: 0,
  metasDerivadas: 0, metaConteudo: 0, planosLpLegado: 0, defsAtivas: 0,
}

export type ItensTransferencia = { planos: boolean; conteudoMeta: boolean; catalogo: boolean }
export const ITENS_PADRAO: ItensTransferencia = { planos: true, conteudoMeta: true, catalogo: true }

/** O que NÃO é transferível com segurança (mostrado desabilitado no pop-up, com o motivo). */
export const ITENS_BLOQUEADOS: { chave: string; rotulo: string; motivo: string }[] = [
  { chave: 'grifos', rotulo: 'Grifos e anotações dos alunos', motivo: 'Pertencem às páginas/trechos do arquivo de origem; em outro arquivo apontariam para o lugar errado. Para manter grifos use “Substituir documento” (nova versão, com reconciliação).' },
  { chave: 'progresso', rotulo: 'Progresso de leitura', motivo: 'É por página/posição do arquivo de origem e pode colidir com o progresso que o aluno já tem no destino.' },
  { chave: 'produto', rotulo: 'Itens de produto/curso', motivo: 'Troque o item direto no Produto (a ordem e a liberação do módulo são do produto, não da meta).' },
  { chave: 'jurisprudencia', rotulo: 'Metas LegProc / Jurisprudência / tipos próprios', motivo: 'O documento dessas metas é resolvido pela PASTA da Biblioteca em tempo real; para trocá-lo mova/classifique o documento na pasta certa.' },
]

export function avaliarTransferencia(origem: DocResumo | null, destino: DocResumo | null, c: ContagensTransferencia): { bloqueios: string[]; avisos: string[] } {
  const bloqueios: string[] = [], avisos: string[] = []
  if (!origem) { bloqueios.push('Documento de origem não encontrado.'); return { bloqueios, avisos } }
  if (!destino) return { bloqueios, avisos }
  if (origem.id === destino.id) bloqueios.push('A origem e o destino são o mesmo documento.')
  if (destino.deletado) bloqueios.push('O documento de destino está na lixeira.')
  else if ((destino.status ?? '').toLowerCase() === 'arquivado') bloqueios.push('O documento de destino está arquivado. Escolha um documento publicado.')
  if (!bloqueios.length) {
    if ((destino.status ?? '').toLowerCase() !== 'publicado') avisos.push('O destino não está publicado: as metas ficam aguardando (sem material) até ele ser publicado.')
    if (destino.emAulas === false) avisos.push('O destino não aparece como AULA do cronograma (precisa estar publicado em pasta de aula/PDFull). As metas ficam aguardando e voltam sozinhas quando ele virar aula.')
    if (origem.tipo && destino.tipo && origem.tipo !== destino.tipo) avisos.push(`Formatos diferentes (${origem.tipo.toUpperCase()} → ${destino.tipo.toUpperCase()}): as metas continuam, mas páginas e tempo estimado mudam.`)
    if (c.planosConflito > 0) avisos.push(`${c.planosConflito.toLocaleString('pt-BR')} ${c.planosConflito === 1 ? 'plano já tem' : 'planos já têm'} o destino: não ${c.planosConflito === 1 ? 'é alterado' : 'são alterados'} (a origem fica sem aula nesses).`)
    if (c.planosLegados > 0) avisos.push(`${c.planosLegados.toLocaleString('pt-BR')} ${c.planosLegados === 1 ? 'plano legado' : 'planos legados'} (sem assinatura por aula) não ${c.planosLegados === 1 ? 'pode' : 'podem'} ser repontados com segurança.`)
    if (c.planosOrfas > 0) avisos.push(`${c.planosOrfas.toLocaleString('pt-BR')} ${c.planosOrfas === 1 ? 'plano já tem' : 'planos já têm'} a origem como aula órfã e não ${c.planosOrfas === 1 ? 'é transferido' : 'são transferidos'}.`)
  }
  return { bloqueios, avisos }
}

export type LinhaPrevia = { chave: 'planos' | 'metas' | 'concluidas' | 'conteudoMeta' | 'catalogo'; rotulo: string; origemAntes: number; origemDepois: number; destinoAntes: number; destinoDepois: number }

/** Tabela "antes → depois" só do que está marcado. `destinoPlanos` = planos ativos que já têm o destino. */
export function linhasAntesDepois(c: ContagensTransferencia, itens: ItensTransferencia, destino: { planos: number; defs: number; metaConteudo: number }, origemPlanos: number): LinhaPrevia[] {
  const out: LinhaPrevia[] = []
  if (itens.planos) {
    out.push({ chave: 'planos', rotulo: 'Planos de alunos ativos', origemAntes: origemPlanos, origemDepois: Math.max(0, origemPlanos - c.planosTransferiveis), destinoAntes: destino.planos, destinoDepois: destino.planos + c.planosTransferiveis })
    out.push({ chave: 'metas', rotulo: 'Metas (linhas dos planos)', origemAntes: c.metasTransferiveis, origemDepois: 0, destinoAntes: 0, destinoDepois: c.metasTransferiveis })
    out.push({ chave: 'concluidas', rotulo: '↳ já concluídas (histórico mantido)', origemAntes: c.metasConcluidas, origemDepois: 0, destinoAntes: 0, destinoDepois: c.metasConcluidas })
  }
  if (itens.conteudoMeta) out.push({ chave: 'conteudoMeta', rotulo: 'Vínculos de meta do cronograma Revisão', origemAntes: c.metaConteudo, origemDepois: 0, destinoAntes: destino.metaConteudo, destinoDepois: destino.metaConteudo + c.metaConteudo })
  if (itens.catalogo) out.push({ chave: 'catalogo', rotulo: 'Definições ativas do catálogo de metas', origemAntes: c.defsAtivas, origemDepois: c.defsAtivas, destinoAntes: destino.defs, destinoDepois: destino.defs })
  return out
}

export function nadaATransferir(c: ContagensTransferencia, itens: ItensTransferencia): boolean {
  const planos = itens.planos && (c.planosTransferiveis > 0 || c.planosLpLegado > 0)
  const mc = itens.conteudoMeta && c.metaConteudo > 0
  return !planos && !mc && !itens.catalogo
}

export function mensagemTransferida(r: { planos: number; metas: number; metaConteudo: number; arquivou: boolean }): string {
  const p = r.planos === 1 ? '1 plano' : `${r.planos.toLocaleString('pt-BR')} planos`
  const partes = [`${p} (${r.metas.toLocaleString('pt-BR')} ${r.metas === 1 ? 'meta' : 'metas'})`]
  if (r.metaConteudo > 0) partes.push(`${r.metaConteudo.toLocaleString('pt-BR')} ${r.metaConteudo === 1 ? 'vínculo' : 'vínculos'} do cronograma Revisão`)
  return `Metas transferidas: ${partes.join(' e ')}${r.arquivou ? '. Origem arquivada.' : '.'} Os alunos veem o novo material ao abrir o cronograma.`
}
