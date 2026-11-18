// Lógica PURA (sem I/O) da trava de exclusão de questões. Testável sem banco.
// A parte com banco fica em dependencias-questao.ts (server).

/** Categoria exibida ao admin no motivo da recusa. */
export type CategoriaVinculo = 'simulados' | 'respostas' | 'documentos' | 'cronograma' | 'cadernos' | 'recorrecoes'

export type FonteVinculo = {
  tabela: string
  categoria: CategoriaVinculo
  /** Rótulo pt-BR (plural) usado na mensagem. */
  rotulo: string
  /** Tabela sem coluna tenant_id (não filtra por tenant). */
  semTenant?: boolean
  /** Tabela com soft-delete próprio: linhas deletado=true não contam como vínculo. */
  comDeletado?: boolean
}

/**
 * Tabelas que BLOQUEIAM a exclusão da questão. Qualquer linha viva aqui = a questão está em uso
 * (e/ou o delete físico cascatearia/quebraria histórico). Favoritos, comentários, feedbacks, etiquetas,
 * cargos e a associação a bancos (simulado_questao_pasta) NÃO bloqueiam (são metadados/organização).
 */
export const FONTES_VINCULO: readonly FonteVinculo[] = [
  { tabela: 'simulado_prova_questoes', categoria: 'simulados', rotulo: 'simulados' },
  { tabela: 'simulado_simulado_questoes', categoria: 'simulados', rotulo: 'simulados (legado)' },
  { tabela: 'simulado_respostas_objetivas', categoria: 'respostas', rotulo: 'respostas de alunos' },
  { tabela: 'simulado_respostas_avulsas', categoria: 'respostas', rotulo: 'respostas avulsas de alunos' },
  { tabela: 'simulado_respostas_discursivas', categoria: 'respostas', rotulo: 'respostas discursivas' },
  { tabela: 'simulado_anotacoes_discursivas', categoria: 'respostas', rotulo: 'anotações de correção' },
  { tabela: 'simulado_sessao_questao_ordem', categoria: 'respostas', rotulo: 'sessões de prova' },
  { tabela: 'simulado_leitura_respostas', categoria: 'respostas', rotulo: 'respostas de quiz de leitura' },
  { tabela: 'simulado_documento_questoes', categoria: 'documentos', rotulo: 'documentos (questões inline)', comDeletado: true },
  { tabela: 'simulado_documento_quiz_questoes', categoria: 'documentos', rotulo: 'documentos (quiz)', comDeletado: true },
  { tabela: 'simulado_conteudo_quiz_questoes', categoria: 'documentos', rotulo: 'documentos da Biblioteca (quiz)' },
  { tabela: 'simulado_cronograma_conjunto_aula_questoes', categoria: 'cronograma', rotulo: 'aulas do cronograma' },
  { tabela: 'simulado_cronograma_meta_questoes', categoria: 'cronograma', rotulo: 'metas do cronograma' },
  { tabela: 'simulado_aluno_caderno_itens', categoria: 'cadernos', rotulo: 'cadernos de alunos' },
  { tabela: 'simulado_aluno_caderno_questoes', categoria: 'cadernos', rotulo: 'cadernos de alunos', semTenant: true },
  { tabela: 'simulado_questao_conjunto_itens', categoria: 'cadernos', rotulo: 'conjuntos de questões' },
  { tabela: 'simulado_recorrecoes', categoria: 'recorrecoes', rotulo: 're-correções registradas' },
] as const

export type DetalheVinculo = { tabela: string; categoria: CategoriaVinculo; rotulo: string; qtd: number }

/** questaoId → detalhes (só os com qtd>0). */
export type MapaDependencias = Map<string, DetalheVinculo[]>

export type QuestaoBloqueada = { id: string; motivo: string; detalhes: DetalheVinculo[] }

/** Soma as contagens por tabela; ignora zeros e ids vazios. */
export function acumular(mapa: MapaDependencias, fonte: FonteVinculo, questaoId: string | null | undefined, n = 1): void {
  if (!questaoId || n <= 0) return
  const arr = mapa.get(questaoId) ?? []
  const ex = arr.find((d) => d.tabela === fonte.tabela)
  if (ex) ex.qtd += n
  else arr.push({ tabela: fonte.tabela, categoria: fonte.categoria, rotulo: fonte.rotulo, qtd: n })
  mapa.set(questaoId, arr)
}

/** Texto pt-BR: "3 respostas de alunos, 2 simulados". Agrupa por rótulo (categorias repetidas somam). */
export function descreverVinculos(detalhes: DetalheVinculo[]): string {
  const porRotulo = new Map<string, number>()
  for (const d of detalhes) porRotulo.set(d.rotulo, (porRotulo.get(d.rotulo) ?? 0) + d.qtd)
  return [...porRotulo.entries()].map(([r, n]) => `${n} ${r}`).join(', ')
}

export function motivoQuestao(detalhes: DetalheVinculo[]): string {
  return `Em uso: ${descreverVinculos(detalhes)}.`
}

/** Separa ids livres de bloqueados, preservando a ordem de entrada. */
export function particionarQuestoes(ids: string[], mapa: MapaDependencias): { livres: string[]; bloqueadas: QuestaoBloqueada[] } {
  const livres: string[] = []
  const bloqueadas: QuestaoBloqueada[] = []
  for (const id of [...new Set(ids.filter(Boolean))]) {
    const det = mapa.get(id) ?? []
    if (det.length) bloqueadas.push({ id, motivo: motivoQuestao(det), detalhes: det })
    else livres.push(id)
  }
  return { livres, bloqueadas }
}

/**
 * Mensagem de recusa para exibir ao admin (toast). Mostra até `max` questões com o motivo; o resto vira "+N".
 * `rotulos` opcional: id → código/título curto para a questão.
 */
export function mensagemRecusa(bloqueadas: QuestaoBloqueada[], opts: { acao?: string; max?: number; rotulos?: Map<string, string> } = {}): string {
  const { acao = 'excluir', max = 3, rotulos } = opts
  if (!bloqueadas.length) return ''
  const nome = (b: QuestaoBloqueada) => rotulos?.get(b.id) ?? `#${b.id.slice(0, 8)}`
  const linhas = bloqueadas.slice(0, max).map((b) => `${nome(b)}: ${b.motivo.replace(/^Em uso: /, '').replace(/\.$/, '')}`)
  const resto = bloqueadas.length > max ? ` (+${bloqueadas.length - max} outras)` : ''
  const sing = bloqueadas.length === 1
  return `Não é possível ${acao} ${sing ? 'esta questão' : `${bloqueadas.length} questões`}: ${sing ? 'ela está' : 'estão'} em uso. ${linhas.join(' | ')}${resto}. Use "Arquivar" para tirá-la de circulação sem apagar.`
}

/** Mensagem para banco/pasta cujo conteúdo está em uso. */
export function mensagemRecusaBanco(nomeBanco: string | null, qtdEmUso: number, resumo: string): string {
  const n = nomeBanco ? `"${nomeBanco}"` : 'este banco'
  return `Não é possível excluir ${n}: ${qtdEmUso} questão(ões) dele estão em uso (${resumo}). Remova o vínculo nos simulados/documentos ou arquive as questões.`
}
