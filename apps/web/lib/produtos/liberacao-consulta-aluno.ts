/**
 * Consulta PURA (sem I/O, sem server-only) de "por que esta aula está liberada/bloqueada para ESTE aluno" (camada Liberação).
 * Usa o MESMO núcleo de decisão do motor do aluno (liberacao-aulas-decisao.ts):
 *   1. EXCEÇÃO manual vigente (bloquear vence liberar; módulo vale p/ as aulas dentro) — `resolverExcecao`
 *   2. aula NÃO governada por regra 'cronograma' -> a data de planilha/trilha NÃO tem efeito (disponibilidade normal)
 *   3. aluno concluiu a meta (legado: `metasConcluidas`) -> liberada
 *   4. `decidirLiberacao` com a data-base = MENOR data entre as trilhas do aluno (senão a planilha) + plano fixado (com_plano)
 * Datas civis 'YYYY-MM-DD'.
 */
import { liberaEmTrilha, type TrilhaAulaDatas } from './liberacao-trilhas-calc'
import {
  PARAMS_PADRAO, SEM_PLANO, dataBaseDaAula, decidirAulaComExcecao, resolverExcecao,
  type ExcecaoLib, type ParamsLiberacao, type PlanoAula, type TrilhaDaAula,
} from './liberacao-aulas-decisao'

export type OrigemLiberacao = 'excecao' | 'meta' | 'plano' | 'trilha' | 'planilha' | 'sem-regra' | 'desligado'

export interface AulaConsulta {
  /** id da aula (submódulo do produto) */
  id: string
  titulo: string
  moduloId: string
  disciplina: string
  /** data-base da planilha (null = a aula não tem linha ativa) */
  dataPlanilha: string | null
  /** trilhaId -> datas da aula naquela trilha (ausente = a aula não existe na trilha) */
  porTrilha: Record<string, TrilhaAulaDatas>
}

export interface TrilhaAlunoRef { id: string; nome: string }

export interface ExcecaoConsulta {
  id: string
  alvoTipo: 'aula' | 'modulo'
  alvoId: string
  acao: 'liberar' | 'bloquear'
  escopo: 'aluno' | 'grupo'
  grupoNome?: string | null
  motivo?: string | null
  /** ISO timestamptz ou null (sem validade) */
  expiraEm: string | null
  ativo: boolean
}

export interface ExplicacaoAula {
  aulaId: string
  titulo: string
  disciplina: string
  moduloId: string
  liberada: boolean
  /** data efetiva de liberação quando houver (exceção/meta = null) */
  dataEfetiva: string | null
  origem: OrigemLiberacao
  /** rótulo curto da origem: "Trilha: 9 Matérias", "Planilha", "Exceção"… */
  origemRotulo: string
  trilhaNome: string | null
  excecaoId: string | null
  /** frase em linguagem clara */
  porque: string
}

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Passaporte = o aluno casa em TODAS as trilhas ativas (e há pelo menos 2). */
export function ehPassaporte(trilhasCasadas: number, trilhasAtivas: number): boolean {
  return trilhasAtivas >= 2 && trilhasCasadas >= trilhasAtivas
}

function excecaoVigente(e: ExcecaoConsulta, agoraIso: string): boolean {
  return e.ativo && (!e.expiraEm || e.expiraEm > agoraIso)
}

/** Insumos do núcleo para UM aluno (montados no servidor por detalheCronogramaDoAluno). Ausente = modo legado (gate do produto). */
export interface NucleoAluno {
  paramsDe: (aulaId: string) => ParamsLiberacao
  /** A aula tem regra 'cronograma' valendo para o aluno? (segmento > base > ancestral) */
  governada: (aulaId: string) => boolean
  plano: (aulaId: string) => PlanoAula
}

export function explicarLiberacaoAluno(a: {
  hoje: string
  /** instante atual ISO (valida a validade das exceções) */
  agora: string
  /** gate do produto (simulado_produto_liberacao_cfg.ativo) — só usado no modo legado (sem `nucleo`) */
  gateAtivo: boolean
  aulas: AulaConsulta[]
  /** trilhas em que o aluno casa (já avaliadas pelos Segmentos) */
  trilhasAluno: TrilhaAlunoRef[]
  /** exceções do aluno OU dos grupos dele (qualquer produto-escopo já filtrado) */
  excecoes: ExcecaoConsulta[]
  metasConcluidas?: ReadonlySet<string>
  nucleo?: NucleoAluno
}): ExplicacaoAula[] {
  const { hoje, agora, gateAtivo, trilhasAluno } = a
  const vig = a.excecoes.filter((e) => excecaoVigente(e, agora))
  const aplicaveis: ExcecaoLib[] = vig.map((e) => ({ alvo_tipo: e.alvoTipo, alvo_id: e.alvoId, estudante_id: null, grupo_id: null, acao: e.acao, motivo: e.motivo ?? null }))

  return a.aulas.map((aula): ExplicacaoAula => {
    const base = { aulaId: aula.id, titulo: aula.titulo, disciplina: aula.disciplina, moduloId: aula.moduloId }
    const params = a.nucleo?.paramsDe(aula.id) ?? PARAMS_PADRAO

    // 1) exceção (mesma precedência do motor: bloquear > liberar; vale a do alvo mais próximo)
    const r = resolverExcecao([aula.id, aula.moduloId], aplicaveis)
    if (r) {
      const e = vig.find((x) => x.alvoId === r.alvoId && x.acao === r.acao)!
      const onde = e.escopo === 'aluno' ? 'para este aluno' : `para o grupo${e.grupoNome ? ` ${e.grupoNome}` : ''}`
      const alvo = e.alvoTipo === 'aula' ? 'da aula' : 'do módulo'
      const ate = e.expiraEm ? ` até ${dataBr(e.expiraEm.slice(0, 10))}` : ''
      const d = decidirAulaComExcecao({ excecao: r, cfg: params, linha: null, plano: SEM_PLANO, hoje })
      return {
        ...base, liberada: d.liberada, dataEfetiva: null, origem: 'excecao', origemRotulo: `Exceção (${d.liberada ? 'liberar' : 'bloquear'})`, trilhaNome: null, excecaoId: e.id,
        porque: `Exceção manual ${alvo} ${d.liberada ? 'libera' : 'bloqueia'} ${onde}${ate}${e.motivo ? ` — ${e.motivo}` : ''}. Vence sobre cronograma de referência, planilha e plano. (Não derruba bloqueio de segmento nem produto bloqueado.)`,
      }
    }

    // 2) governança: só há efeito se a aula tem regra 'cronograma'
    const governada = a.nucleo ? a.nucleo.governada(aula.id) : gateAtivo
    const temData = !!aula.dataPlanilha || Object.keys(aula.porTrilha).length > 0
    if (!governada) {
      if (!a.nucleo && !gateAtivo) return { ...base, liberada: true, dataEfetiva: null, origem: 'desligado', origemRotulo: 'Controle desligado', trilhaNome: null, excecaoId: null, porque: 'O controle de liberação deste produto está desligado: tudo fica aberto.' }
      return {
        ...base, liberada: true, dataEfetiva: null, origem: 'sem-regra', origemRotulo: 'Sem regra de cronograma', trilhaNome: null, excecaoId: null,
        porque: temData
          ? 'Esta aula tem data na planilha/cronograma de referência, mas NENHUMA regra do tipo "Cronograma" vale para ela: a data não tem efeito e vale a disponibilidade normal do conteúdo.'
          : 'Sem data na planilha nem regra de cronograma: vale a disponibilidade normal do conteúdo.',
      }
    }

    // 3) meta concluída (modo legado)
    if (a.metasConcluidas?.has(aula.id)) return { ...base, liberada: true, dataEfetiva: null, origem: 'meta', origemRotulo: 'Concluiu a meta', trilhaNome: null, excecaoId: null, porque: 'O aluno concluiu a meta desta aula no cronograma dele, então ela está aberta.' }

    // 4) decisão do motor: data-base = menor data entre as trilhas do aluno (senão planilha) + plano fixado
    const dasTrilhas: TrilhaDaAula[] = []
    for (const t of trilhasAluno) { const d = aula.porTrilha[t.id]; if (d && liberaEmTrilha(d)) dasTrilhas.push({ nome: t.nome, datas: d }) }
    const db = dataBaseDaAula(dasTrilhas, aula.dataPlanilha)
    const plano = a.nucleo?.plano(aula.id) ?? SEM_PLANO
    const dec = decidirAulaComExcecao({ excecao: null, cfg: params, linha: db.data ? { data_liberacao: db.data } : null, plano, hoje })
    const trilhaNome = db.trilha
    const varias = trilhasAluno.length > 1 ? ` (menor data entre os ${trilhasAluno.length} cronogramas de referência do aluno)` : ''
    const fonteBase = trilhaNome ? `cronograma de referência "${trilhaNome}"${varias}` : 'data-base da planilha'
    const dtBr = (d: string | null) => (d ? dataBr(d) : '')
    const mk = (origem: OrigemLiberacao, rotulo: string, porque: string): ExplicacaoAula => ({
      ...base, liberada: dec.liberada, origem, origemRotulo: rotulo, trilhaNome: origem === 'trilha' ? trilhaNome : null, excecaoId: null, porque,
      dataEfetiva: dec.liberaEm ?? (dec.liberada && (origem === 'trilha' || origem === 'planilha') ? db.data : null),
    })
    switch (dec.motivo) {
      case 'planilha': case 'fora-do-plano': {
        const trilha = !!trilhaNome
        const extra = dec.motivo === 'fora-do-plano' ? ' (a aula não está no cronograma fixado do aluno)' : plano.tem ? '' : ' (aluno sem cronograma fixado)'
        return mk(trilha ? 'trilha' : 'planilha', trilha ? `Cronograma de ref.: ${trilhaNome}` : 'Planilha',
          dec.liberada ? `Liberada desde ${dtBr(db.data)} pelo ${fonteBase}${extra}.` : `Bloqueada: o ${fonteBase} libera em ${dtBr(dec.liberaEm)}${extra}.`)
      }
      case 'plano': return mk('plano', 'Plano do aluno', dec.liberada ? `Liberada pela data da meta no cronograma fixado do aluno (${params.dias_antes} dia(s) de antecedência).` : `Bloqueada: o cronograma fixado do aluno libera em ${dtBr(dec.liberaEm)}.`)
      case 'mais-cedo': return mk('plano', 'Mais cedo: plano ou planilha', dec.liberada ? 'Liberada: vale a data mais cedo entre o plano fixado e a planilha/cronograma de referência.' : `Bloqueada: a data mais cedo entre plano e planilha é ${dtBr(dec.liberaEm)}.`)
      case 'concluida': return mk('meta', 'Concluiu a meta', 'O aluno concluiu a meta desta aula no cronograma fixado, então ela está aberta.')
      case 'concluir-meta': return mk('meta', 'Aguarda concluir a meta', 'Bloqueada: a regra libera só quando o aluno concluir a meta desta aula no cronograma fixado dele.')
      case 'liberado': return mk('sem-regra', 'Regra: liberado sem plano', 'Aluno sem cronograma fixado e a regra manda liberar tudo.')
      case 'atual': return mk('sem-regra', 'Regra: disponibilidade atual', 'Aluno sem cronograma fixado: a regra "não interferir" mantém a disponibilidade normal do conteúdo.')
      default: return mk('sem-regra', 'Sem data na planilha', 'A regra de cronograma vale, mas esta aula não tem linha/data na planilha: fica aberta.')
    }
  })
}

export interface ResumoAluno { liberadas: number; total: number; proxima: { data: string; titulo: string } | null }

export function resumirLiberacao(lista: ExplicacaoAula[], hoje: string): ResumoAluno {
  let liberadas = 0
  let proxima: ResumoAluno['proxima'] = null
  for (const x of lista) {
    if (x.liberada) { liberadas++; continue }
    if (x.dataEfetiva && x.dataEfetiva > hoje && (!proxima || x.dataEfetiva < proxima.data)) proxima = { data: x.dataEfetiva, titulo: `${x.disciplina} — ${x.titulo}` }
  }
  return { liberadas, total: lista.length, proxima }
}
