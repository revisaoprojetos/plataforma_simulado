// SEGMENTOS DE VISIBILIDADE — tipos, catálogo de campos/operadores e validação. Client-safe (sem I/O).
// Modelo inspirado no "Criar um Segmento" do ActiveCampaign: GRUPOS de condições ligados por E/OU, e
// dentro de cada grupo condições ligadas por E/OU. Avaliação no servidor: lib/segmentos/avaliar.ts.
// Tabelas: simulado_segmentos / simulado_produto_visibilidade (migração 20261103130000).

export type Juncao = 'e' | 'ou'

export type ValorTipo = 'texto' | 'data' | 'numero' | 'relacao'
export type RefTipo = 'grupo' | 'produto' | 'simulado'

export type Operador =
  // texto
  | 'igual' | 'diferente' | 'contem' | 'nao_contem' | 'comeca' | 'termina'
  // data
  | 'antes' | 'depois' | 'em' | 'entre' | 'ultimos_dias' | 'mais_de_dias' | 'proximos_dias'
  // número
  | 'maior' | 'maior_igual' | 'menor' | 'menor_igual'
  // relação
  | 'possui' | 'nao_possui'
  // presença (texto / data)
  | 'existe' | 'nao_existe'

export type CampoId =
  | 'aluno_nome' | 'aluno_email' | 'aluno_telefone' | 'aluno_classificacao' | 'aluno_origem'
  | 'aluno_cadastro' | 'aluno_nascimento'
  | 'grupo' | 'grupo_entrada' | 'grupo_expira'
  | 'assinatura' | 'assinatura_inicio' | 'assinatura_expira' | 'matricula_produto'
  | 'simulados_feitos' | 'simulado_nota' | 'questoes_respondidas' | 'questoes_acerto'
  | 'documentos_lidos' | 'progresso_produto' | 'tempo_estudo'
  | 'data_atual'

export interface Condicao {
  id: string
  campo: CampoId
  operador: Operador
  valor?: string | number | null
  valor2?: string | number | null   // 2º limite do "entre"
  ref?: string | null               // id do grupo / produto / simulado
  dias?: number | null              // período "nos últimos X dias" dos campos de quantidade
  /** Vários grupos/produtos na MESMA condição (só campos de relação): vale se o aluno estiver em QUALQUER um. */
  refs?: string[] | null
}
export interface GrupoCondicoes { id: string; op: Juncao; condicoes: Condicao[] }
export interface RegraSegmento { op: Juncao; grupos: GrupoCondicoes[] }

export interface Segmento {
  id: string
  nome: string
  descricao: string | null
  regra: RegraSegmento
  atualizado_em: string | null
}

export type AlvoTipo = 'produto' | 'modulo' | 'aula'
export type Efeito = 'liberar' | 'bloquear' | 'mostrar' | 'ocultar'
export type SemAcesso = 'oculto' | 'bloqueado_cadeado'

export interface RegraVisibilidade {
  id: string
  segmento_id: string
  alvo_tipo: AlvoTipo
  alvo_id: string | null
  efeito: Efeito
  sem_acesso: SemAcesso
  ativo: boolean
}

export const EFEITO_LABEL: Record<Efeito, string> = {
  liberar: 'Liberar acesso para',
  bloquear: 'Bloquear acesso para',
  mostrar: 'Mostrar somente para',
  ocultar: 'Ocultar para',
}
export const SEM_ACESSO_LABEL: Record<SemAcesso, string> = {
  oculto: 'Não aparece',
  bloqueado_cadeado: 'Aparece com cadeado',
}

// ── Operadores por tipo de valor ──
export const OPERADOR_LABEL: Record<Operador, string> = {
  igual: 'É', diferente: 'Não é', contem: 'Contém', nao_contem: 'Não contém', comeca: 'Começa com', termina: 'Termina com',
  antes: 'É antes de', depois: 'É depois de', em: 'É em', entre: 'Está entre', ultimos_dias: 'Nos últimos', mais_de_dias: 'Há mais de', proximos_dias: 'Nos próximos',
  maior: 'Maior que', maior_igual: 'Maior ou igual a', menor: 'Menor que', menor_igual: 'Menor ou igual a',
  possui: 'Possui', nao_possui: 'Não possui',
  existe: 'Existe', nao_existe: 'Não existe',
}

export const OPERADORES_POR_TIPO: Record<ValorTipo, Operador[]> = {
  texto: ['igual', 'diferente', 'contem', 'nao_contem', 'comeca', 'termina', 'existe', 'nao_existe'],
  data: ['antes', 'depois', 'em', 'entre', 'ultimos_dias', 'mais_de_dias', 'proximos_dias', 'existe', 'nao_existe'],
  numero: ['igual', 'diferente', 'maior', 'maior_igual', 'menor', 'menor_igual', 'entre'],
  relacao: ['possui', 'nao_possui'],
}

/** Operadores que não pedem valor. */
export const SEM_VALOR: Operador[] = ['existe', 'nao_existe', 'possui', 'nao_possui']
/** Operadores de data cujo valor é uma QUANTIDADE DE DIAS (e não uma data). */
export const VALOR_EM_DIAS: Operador[] = ['ultimos_dias', 'mais_de_dias', 'proximos_dias']

export type CategoriaCampo = 'Dados do aluno' | 'Grupos e produtos' | 'Atividade' | 'Data'

export interface CampoDef {
  id: CampoId
  label: string
  categoria: CategoriaCampo
  tipo: ValorTipo
  /** Recurso que a condição aponta (grupo/produto/simulado). */
  ref?: RefTipo
  /** ref obrigatório? (falso = "qualquer") */
  refObrigatoria?: boolean
  /** Aceita período "nos últimos X dias" (campos de quantidade). */
  periodo?: boolean
  /** Sufixo do valor (ex.: "%", "h"). */
  unidade?: string
  /** Texto de ajuda curto. */
  ajuda?: string
  /** Operadores possíveis (default: os do tipo). */
  operadores?: Operador[]
  /** Rótulos específicos dos operadores de relação. */
  rotulos?: Partial<Record<Operador, string>>
}

export const CAMPOS: CampoDef[] = [
  // Dados do aluno
  { id: 'aluno_nome', label: 'Nome', categoria: 'Dados do aluno', tipo: 'texto' },
  { id: 'aluno_email', label: 'E-mail', categoria: 'Dados do aluno', tipo: 'texto' },
  { id: 'aluno_telefone', label: 'Telefone', categoria: 'Dados do aluno', tipo: 'texto' },
  { id: 'aluno_classificacao', label: 'Classificação', categoria: 'Dados do aluno', tipo: 'texto' },
  { id: 'aluno_origem', label: 'Origem do cadastro', categoria: 'Dados do aluno', tipo: 'texto', ajuda: 'Plataforma de onde o aluno veio (ex.: curseduca, guru).' },
  { id: 'aluno_cadastro', label: 'Data de cadastro', categoria: 'Dados do aluno', tipo: 'data' },
  { id: 'aluno_nascimento', label: 'Data de nascimento', categoria: 'Dados do aluno', tipo: 'data' },
  // Grupos e produtos
  { id: 'grupo', label: 'Grupo de acesso', categoria: 'Grupos e produtos', tipo: 'relacao', ref: 'grupo', refObrigatoria: true, rotulos: { possui: 'Está no grupo', nao_possui: 'Não está no grupo' }, ajuda: 'Participação válida (sem prazo ou ainda não vencida).' },
  { id: 'grupo_entrada', label: 'Entrada no grupo', categoria: 'Grupos e produtos', tipo: 'data', ref: 'grupo', refObrigatoria: true },
  { id: 'grupo_expira', label: 'Vencimento no grupo', categoria: 'Grupos e produtos', tipo: 'data', ref: 'grupo', refObrigatoria: true, ajuda: '"Não existe" = participação sem prazo.' },
  { id: 'assinatura', label: 'Assinatura de produto', categoria: 'Grupos e produtos', tipo: 'relacao', ref: 'produto', refObrigatoria: true, rotulos: { possui: 'Possui ativa', nao_possui: 'Não possui ativa' } },
  { id: 'assinatura_inicio', label: 'Início da assinatura', categoria: 'Grupos e produtos', tipo: 'data', ref: 'produto', refObrigatoria: true },
  { id: 'assinatura_expira', label: 'Vencimento da assinatura', categoria: 'Grupos e produtos', tipo: 'data', ref: 'produto', refObrigatoria: true, ajuda: '"Não existe" = assinatura sem prazo.' },
  { id: 'matricula_produto', label: 'Matrícula no produto', categoria: 'Grupos e produtos', tipo: 'data', ref: 'produto', refObrigatoria: true, ajuda: 'A mais antiga entre o início da assinatura e a entrada nos grupos do produto.' },
  // Atividade
  { id: 'simulados_feitos', label: 'Simulados realizados', categoria: 'Atividade', tipo: 'numero', ref: 'simulado', refObrigatoria: false, periodo: true, ajuda: 'Tentativas finalizadas (sem as de teste). Sem simulado = qualquer um.' },
  { id: 'simulado_nota', label: 'Nota no simulado', categoria: 'Atividade', tipo: 'numero', ref: 'simulado', refObrigatoria: true, ajuda: 'Maior nota entre as tentativas finalizadas.' },
  { id: 'questoes_respondidas', label: 'Questões respondidas', categoria: 'Atividade', tipo: 'numero', periodo: true, ajuda: 'Simulados + questões avulsas.' },
  { id: 'questoes_acerto', label: 'Acerto nas questões', categoria: 'Atividade', tipo: 'numero', periodo: true, unidade: '%' },
  { id: 'documentos_lidos', label: 'Materiais lidos', categoria: 'Atividade', tipo: 'numero', periodo: true, ajuda: 'Documentos da biblioteca abertos pelo aluno.' },
  { id: 'progresso_produto', label: 'Progresso no produto', categoria: 'Atividade', tipo: 'numero', ref: 'produto', refObrigatoria: true, unidade: '%', ajuda: '% das aulas (documentos) do currículo já abertas.' },
  { id: 'tempo_estudo', label: 'Tempo de estudo', categoria: 'Atividade', tipo: 'numero', periodo: true, unidade: 'h' },
  // Data
  { id: 'data_atual', label: 'Data de hoje', categoria: 'Data', tipo: 'data', operadores: ['antes', 'depois', 'em', 'entre'], ajuda: 'Útil para janelas de tempo (ex.: só durante a campanha).' },
]

export const CAMPO_POR_ID: Record<string, CampoDef> = Object.fromEntries(CAMPOS.map((c) => [c.id, c]))
export const CATEGORIAS: CategoriaCampo[] = ['Dados do aluno', 'Grupos e produtos', 'Atividade', 'Data']

export function operadoresDoCampo(c: CampoDef): Operador[] {
  return c.operadores ?? OPERADORES_POR_TIPO[c.tipo]
}
export function rotuloOperador(c: CampoDef | undefined, op: Operador): string {
  return c?.rotulos?.[op] ?? OPERADOR_LABEL[op] ?? op
}

// ── Construção ──
export function novoId(): string {
  try { return crypto.randomUUID().slice(0, 8) } catch { return Math.random().toString(36).slice(2, 10) }
}
export function novaCondicao(campo: CampoId = 'grupo', ref: string | null = null): Condicao {
  const c = CAMPO_POR_ID[campo]
  return { id: novoId(), campo, operador: operadoresDoCampo(c)[0], valor: null, valor2: null, ref, dias: null }
}
export function novoGrupo(op: Juncao = 'e'): GrupoCondicoes {
  return { id: novoId(), op, condicoes: [novaCondicao()] }
}
export const REGRA_VAZIA: RegraSegmento = { op: 'e', grupos: [] }

/** Normaliza o jsonb vindo do banco (tolerante a lixo). */
export function normalizarRegra(v: unknown): RegraSegmento {
  const r = v && typeof v === 'object' ? (v as any) : {}
  const grupos = Array.isArray(r.grupos) ? r.grupos : []
  return {
    op: r.op === 'ou' ? 'ou' : 'e',
    grupos: grupos.map((g: any) => ({
      id: String(g?.id || novoId()),
      op: g?.op === 'ou' ? 'ou' : 'e',
      condicoes: (Array.isArray(g?.condicoes) ? g.condicoes : [])
        .filter((c: any) => c && CAMPO_POR_ID[c.campo])
        .map((c: any): Condicao => ({
          id: String(c.id || novoId()), campo: c.campo, operador: c.operador,
          valor: c.valor ?? null, valor2: c.valor2 ?? null, ref: c.ref ?? null,
          refs: Array.isArray(c.refs) ? c.refs.map(String).filter(Boolean).slice(0, 500) : null,
          dias: c.dias == null || c.dias === '' ? null : Number(c.dias),
        })),
    })).filter((g: GrupoCondicoes) => g.condicoes.length > 0),
  }
}

/** Erro de validação (texto) da 1ª condição incompleta, ou null se a regra está ok. */
export function validarRegra(r: RegraSegmento): string | null {
  const total = r.grupos.reduce((s, g) => s + g.condicoes.length, 0)
  if (!total) return 'Adicione pelo menos uma condição.'
  for (const g of r.grupos) for (const c of g.condicoes) {
    const def = CAMPO_POR_ID[c.campo]
    if (!def) return 'Campo inválido.'
    if (!operadoresDoCampo(def).includes(c.operador)) return `Operador inválido em "${def.label}".`
    if (def.ref && def.refObrigatoria && !c.ref && !c.refs?.length) return `Escolha o ${def.ref} em "${def.label}".`
    if (SEM_VALOR.includes(c.operador)) continue
    const vazio = (x: unknown) => x === null || x === undefined || String(x).trim() === ''
    if (vazio(c.valor)) return `Preencha o valor em "${def.label}".`
    if (c.operador === 'entre' && vazio(c.valor2)) return `Preencha os dois limites em "${def.label}".`
    if ((def.tipo === 'numero' || VALOR_EM_DIAS.includes(c.operador)) && isNaN(Number(c.valor))) return `Valor numérico inválido em "${def.label}".`
  }
  return null
}

function fmtDataCurta(v: unknown): string {
  const s = String(v ?? '')
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}

/** Uma condição em português ("Grupo de acesso · Está no grupo Revisão"). `nomes` resolve refs. */
export function resumoCondicao(c: Condicao, nomes: Record<string, string> = {}): string {
  const def = CAMPO_POR_ID[c.campo]
  if (!def) return '?'
  const partes = [def.label]
  if (def.ref) {
    const ids = c.refs?.length ? c.refs : c.ref ? [c.ref] : []
    partes.push(ids.length ? `“${ids.slice(0, 3).map((i) => nomes[i] ?? def.ref).join('”, “')}”${ids.length > 3 ? ` e mais ${ids.length - 3}` : ''}` : `(qualquer ${def.ref})`)
  }
  partes.push(rotuloOperador(def, c.operador).toLowerCase())
  if (!SEM_VALOR.includes(c.operador)) {
    const un = def.unidade ?? ''
    const fmt = (x: unknown) => (def.tipo === 'data' && !VALOR_EM_DIAS.includes(c.operador) ? fmtDataCurta(x) : `${x}${un}`)
    if (c.operador === 'entre') partes.push(`${fmt(c.valor)} e ${fmt(c.valor2)}`)
    else if (VALOR_EM_DIAS.includes(c.operador)) partes.push(`${c.valor} dia(s)`)
    else partes.push(fmt(c.valor))
  }
  if (def.periodo && c.dias) partes.push(`· últimos ${c.dias} dia(s)`)
  return partes.join(' ')
}

/** Resumo da regra inteira ("(A e B) ou (C)"). */
export function resumoRegra(r: RegraSegmento, nomes: Record<string, string> = {}): string {
  const gs = r.grupos.filter((g) => g.condicoes.length)
  if (!gs.length) return 'Sem condições'
  const txt = gs.map((g) => {
    const s = g.condicoes.map((c) => resumoCondicao(c, nomes)).join(g.op === 'ou' ? ' OU ' : ' E ')
    return gs.length > 1 && g.condicoes.length > 1 ? `(${s})` : s
  })
  return txt.join(r.op === 'ou' ? ' OU ' : ' E ')
}

/** ids referenciados (grupo/produto/simulado) — para resolver nomes em lote. */
export function refsDaRegra(r: RegraSegmento): Record<RefTipo, string[]> {
  const out: Record<RefTipo, Set<string>> = { grupo: new Set(), produto: new Set(), simulado: new Set() }
  for (const g of r.grupos) for (const c of g.condicoes) {
    const def = CAMPO_POR_ID[c.campo]
    if (def?.ref && c.ref) out[def.ref].add(c.ref)
    if (def?.ref && c.refs) for (const r of c.refs) out[def.ref].add(r)
  }
  return { grupo: [...out.grupo], produto: [...out.produto], simulado: [...out.simulado] }
}
