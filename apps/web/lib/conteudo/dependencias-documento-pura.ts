// Lógica PURA (sem I/O) da trava "documento com vínculos não pode ser excluído".
// O módulo server (dependencias-documento.ts) só busca as contagens; a decisão, a mensagem e o
// particionamento de lote vivem aqui para serem testáveis. Rótulos em pt-BR.

export type TipoDependencia =
  | 'grifos' | 'metas' | 'progresso' | 'produto' | 'questoes'
  | 'atualizacoes' | 'caderno' | 'vinculos' | 'jurisclub' | 'favoritos' | 'respostas' | 'lei'

export type PorTipo = Partial<Record<TipoDependencia, number>>
/** `emUso`: o documento compõe metas de plano de aluno NÃO arquivado (ou meta ativa do catálogo) → além de não
 *  poder ser excluído, também não pode ser movido/despublicado/trocar de categoria (ver mensagemEmUso). */
export type Dependencias = { total: number; porTipo: PorTipo; emUso?: boolean; planosAtivos?: number }

/** Ações que o banco/servidor bloqueiam para documento em uso. */
export type AcaoBloqueada = 'excluir' | 'mover' | 'despublicar' | 'categoria' | 'pasta'
const VERBO: Record<AcaoBloqueada, string> = {
  excluir: 'excluído', mover: 'movido de pasta', despublicar: 'despublicado', categoria: 'ter a categoria alterada', pasta: 'alterado de pasta/tipo',
}
export const ALTERNATIVAS_EM_USO = "Use “Substituir documento” (nova versão no mesmo documento, preservando grifos e metas) ou “Ocultar” do aluno."

/** Recusa por documento EM USO em plano de aluno ativo (mover/despublicar/categoria/excluir). */
export function mensagemEmUso(acao: AcaoBloqueada, titulo?: string, planosAtivos?: number): string {
  const quem = titulo ? `O documento “${titulo}”` : 'Este documento'
  const uso = planosAtivos && planosAtivos > 0 ? `está em uso em ${fmt(planosAtivos)} ${planosAtivos === 1 ? 'plano de aluno ativo' : 'planos de alunos ativos'}` : 'está em uso por planos de alunos ativos (metas do cronograma)'
  return `${quem} ${uso} e não pode ser ${VERBO[acao]}. ${ALTERNATIVAS_EM_USO}`
}

/** Mensagem de recusa para PASTA que contém documentos em uso. */
export function mensagemPastaEmUso(nomePasta: string | undefined, nDocs: number, acao: string): string {
  return `A pasta${nomePasta ? ` “${nomePasta}”` : ''} contém ${fmt(nDocs)} ${nDocs === 1 ? 'documento em uso' : 'documentos em uso'} por planos de alunos ativos e não pode ser ${acao}. Mova/substitua os documentos pelo fluxo “Substituir documento” ou use “Ocultar”.`
}

/** Ordem de exibição + rótulo (singular, plural). */
const ROTULOS: Record<TipoDependencia, [string, string]> = {
  grifos: ['grifo/anotação de aluno', 'grifos/anotações de alunos'],
  metas: ['meta de cronograma', 'metas de cronograma'],
  progresso: ['registro de progresso de leitura', 'registros de progresso de leitura'],
  produto: ['item de produto/curso', 'itens de produtos/cursos'],
  questoes: ['questão vinculada', 'questões vinculadas'],
  atualizacoes: ['atualização registrada', 'atualizações registradas'],
  caderno: ['item de caderno de aluno', 'itens de cadernos de alunos'],
  vinculos: ['vínculo de conteúdo', 'vínculos de conteúdo'],
  jurisclub: ['edição do JurisClub', 'edições do JurisClub'],
  favoritos: ['favorito de aluno', 'favoritos de alunos'],
  respostas: ['resposta de quiz de aluno', 'respostas de quiz de alunos'],
  lei: ['dispositivo/histórico de lei', 'dispositivos/históricos de lei'],
}
export const ORDEM_TIPOS = Object.keys(ROTULOS) as TipoDependencia[]

export function dependenciasVazias(): Dependencias { return { total: 0, porTipo: {} } }

/** Soma `n` ao tipo (ignora n<=0 / NaN). Mantém `total` coerente. */
export function somarDependencia(d: Dependencias, tipo: TipoDependencia, n: number): void {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v) || v <= 0) return
  d.porTipo[tipo] = (d.porTipo[tipo] ?? 0) + v
  d.total += v
}

export const temVinculos = (d: Dependencias | undefined | null): boolean => !!d && (d.total > 0 || !!d.emUso)

const fmt = (n: number) => n.toLocaleString('pt-BR')

/** "1.234 grifos/anotações de alunos, 3 metas de cronograma" (ordem estável). */
export function resumoDependencias(d: Dependencias): string {
  const partes: string[] = []
  for (const t of ORDEM_TIPOS) {
    const n = d.porTipo[t] ?? 0
    if (n > 0) partes.push(`${fmt(n)} ${n === 1 ? ROTULOS[t][0] : ROTULOS[t][1]}`)
  }
  return partes.join(', ')
}

/** Mensagem de recusa de UM documento. */
export function mensagemBloqueio(d: Dependencias, titulo?: string): string {
  if (d.emUso && d.total === 0) return mensagemEmUso('excluir', titulo, d.planosAtivos)
  const quem = titulo ? `O documento “${titulo}”` : 'Este documento'
  const uso = d.emUso ? ` Ele está em uso por planos de alunos ativos.` : ''
  return `${quem} tem ${resumoDependencias(d)} e não pode ser excluído.${uso} ${ALTERNATIVAS_EM_USO}`
}

export const MSG_NAO_VERIFICADO =
  'Não foi possível verificar os vínculos do documento (grifos, metas, progresso…). Por segurança a exclusão foi recusada. Tente novamente.'

export type DocRef = { id: string; titulo?: string }
export type Bloqueado = { id: string; titulo?: string; motivo: string; porTipo: PorTipo; total: number }

/**
 * Decisão para uma lista de documentos: separa os LIVRES (podem ir à lixeira) dos BLOQUEADOS (com motivo).
 * `deps` ausente para um id = verificação não concluída → bloqueia (falha fechada).
 */
export function particionarPorVinculos(
  docs: DocRef[], deps: Map<string, Dependencias>,
): { livres: DocRef[]; bloqueados: Bloqueado[] } {
  const livres: DocRef[] = []; const bloqueados: Bloqueado[] = []
  for (const d of docs) {
    const dep = deps.get(d.id)
    if (!dep) { bloqueados.push({ id: d.id, titulo: d.titulo, motivo: MSG_NAO_VERIFICADO, porTipo: {}, total: 0 }); continue }
    if (temVinculos(dep)) bloqueados.push({ id: d.id, titulo: d.titulo, motivo: mensagemBloqueio(dep, d.titulo), porTipo: dep.porTipo, total: dep.total })
    else livres.push(d)
  }
  return { livres, bloqueados }
}

/**
 * Pastas que ficaram VAZIAS depois da ação: as que perderam documentos (`saindo`) e hoje têm 0 vivos.
 * Devolve, por pasta, os ids que saíram (para a auditoria antes/depois).
 */
export function pastasEsvaziadas(
  saindo: { id: string; pasta_id: string | null }[], vivosPorPasta: Map<string, number>,
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const d of saindo) {
    if (!d.pasta_id) continue
    if ((vivosPorPasta.get(d.pasta_id) ?? 0) > 0) continue
    const arr = out.get(d.pasta_id) ?? []; arr.push(d.id); out.set(d.pasta_id, arr)
  }
  return out
}

/** Resumo de lote: "3 de 10 documentos não foram excluídos (têm vínculos)". */
export function mensagemLoteParcial(totalDocs: number, bloqueados: number): string {
  if (!bloqueados) return ''
  if (bloqueados >= totalDocs) return `Nenhum documento foi excluído: ${totalDocs === 1 ? 'ele tem vínculos' : 'todos têm vínculos'} (grifos, metas, progresso…).`
  return `${bloqueados} de ${totalDocs} documentos não foram excluídos porque têm vínculos (grifos, metas, progresso…). Os demais foram para a lixeira.`
}
