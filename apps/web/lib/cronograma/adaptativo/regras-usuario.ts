/**
 * REGRAS DO USUÁRIO (editor de fluxo) → AJUSTES DO MOTOR ADAPTATIVO. Avaliador PURO e DETERMINÍSTICO (sem I/O, Date, random, eval).
 *
 * Como funciona: nós `condicao` e `acao` do overlay do Fluxo formam regras ("SE condição ENTÃO ação"). Este módulo lê o overlay,
 * resolve as condições (comparações sobre variáveis NOMEADAS e fechadas: faixa, dia_semana, tipo_meta; E/OU/negação por ramo "não")
 * e COMPILA as ações do CATÁLOGO FECHADO para dados que o motor JÁ entende (`RegrasMotor`):
 *   limitar/bloquear/não-no-mesmo-dia/…  →  `restricoes[]` (com filtros de faixa e dia da semana)
 *   ajustar teto de PDFull               →  `faixas[].tetoPdf`
 *   ajustar limite por dia               →  `limitesDia` (global) ou `faixas[].overrides.limitesDia` (por faixa)
 * Ou seja: o motor NÃO executa nada do usuário; só recebe regras como dados, pelo mesmo caminho de `ctx.regras`. Sem nenhuma regra com efeito,
 * `compilarRegrasUsuario` devolve A MESMA referência de `regras` (saída do motor idêntica; golden 125/125 intacto).
 * Variáveis sem ponto de extensão seguro (horas por dia, semanas até a prova) são REJEITADAS com mensagem clara.
 */
import { FAMILIAS_RESTRICAO, normalizarRegras, type FamiliaRestricao, type RegrasMotor, type RestricaoRegra, type TipoRestricao } from './regras'
import { classeDaFaixa, type FaixaCarga } from './faixas-carga'
import { descreverRestricao, detectarConflitosRestricoes, ROTULO_FAMILIA } from './restricoes'
import { ROTULO_OP, type AcaoUsuario, type CatalogoExecutavel, type Comparacao, type Condicao, type NoUsuario, type OpCond, type OverlayFluxo } from '../../admin/fluxo/overlay'

export const DIAS_NOME = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'] as const
const OPS_NUM: OpCond[] = ['igual', 'diferente', 'menor', 'menor_igual', 'maior', 'maior_igual', 'em', 'fora_de']
const OPS_CONJ: OpCond[] = ['igual', 'diferente', 'em', 'fora_de']
const OPCOES_FAMILIA = FAMILIAS_RESTRICAO.map((f) => ({ valor: f, rotulo: ROTULO_FAMILIA[f] }))
export const CAMPOS_LIMITE_DIA = [{ valor: 'pdfDistintos', rotulo: 'PDFulls distintos por dia' }, { valor: 'revisoes', rotulo: 'PDFlashes por dia' }, { valor: 'questoes', rotulo: 'Metas de questões por dia' }] as const

const UNIVERSO: Record<string, Array<number | string>> = { faixa: [1, 2, 3], dia_semana: [0, 1, 2, 3, 4, 5, 6], tipo_meta: [...FAMILIAS_RESTRICAO] }

export const CATALOGO: CatalogoExecutavel = {
  variaveis: [
    { chave: 'faixa', rotulo: 'Faixa de carga da semana (classe 1, 2 ou 3)', tipo: 'opcao', opcoes: [1, 2, 3].map((n) => ({ valor: String(n), rotulo: `Faixa ${n}` })), ops: OPS_NUM, disponivel: true, dica: 'Mesma "faixa" das Restrições: classe 1/2/3 da carga semanal do aluno.' },
    { chave: 'dia_semana', rotulo: 'Dia da semana', tipo: 'opcao', opcoes: DIAS_NOME.map((n, k) => ({ valor: String(k), rotulo: n })), ops: OPS_CONJ, disponivel: true },
    { chave: 'tipo_meta', rotulo: 'Tipo de meta', tipo: 'opcao', opcoes: OPCOES_FAMILIA, ops: OPS_CONJ, disponivel: true, dica: 'Vale para ações que atuam sobre um tipo de meta: a ação só é aplicada se o tipo dela estiver na condição.' },
    { chave: 'horas_dia', rotulo: 'Horas do dia', tipo: 'numero', ops: OPS_NUM, disponivel: false, motivo: 'Sem ponto de extensão seguro: o motor decide por rotina semanal; condicionar por horas de um dia exigiria mexer na alocação diária.' },
    { chave: 'semanas_ate_prova', rotulo: 'Semanas até a prova', tipo: 'numero', ops: OPS_NUM, disponivel: false, motivo: 'O motor não recebe a data da prova; não há como avaliar essa variável sem alterá-lo.' },
  ],
  acoes: [
    { tipo: 'limitar_por_dia', rotulo: 'Limitar por dia', descricao: 'No máximo N metas do tipo por dia (restrição "máximo por dia").', params: [{ chave: 'tipoA', rotulo: 'Tipo de meta', tipo: 'opcao', opcoes: OPCOES_FAMILIA }, { chave: 'valor', rotulo: 'Máximo por dia', tipo: 'int', min: 1, max: 6, padrao: 1 }] },
    { tipo: 'bloquear', rotulo: 'Bloquear tipo', descricao: 'O tipo de meta não é alocado nos dias da condição (use "dia da semana" na condição).', params: [{ chave: 'tipoA', rotulo: 'Tipo de meta', tipo: 'opcao', opcoes: OPCOES_FAMILIA }] },
    { tipo: 'nao_mesmo_dia', rotulo: 'Não no mesmo dia', descricao: 'Os dois tipos nunca dividem o mesmo dia.', params: [{ chave: 'tipoA', rotulo: 'Tipo A', tipo: 'opcao', opcoes: OPCOES_FAMILIA }, { chave: 'tipoB', rotulo: 'Tipo B', tipo: 'opcao', opcoes: OPCOES_FAMILIA }] },
    { tipo: 'nao_dias_seguidos', rotulo: 'Não em dias seguidos', descricao: 'O tipo não cai em dois dias consecutivos.', params: [{ chave: 'tipoA', rotulo: 'Tipo de meta', tipo: 'opcao', opcoes: OPCOES_FAMILIA }] },
    { tipo: 'so_na_sobra', rotulo: 'Só na sobra do dia', descricao: 'O tipo só entra em dia que já tem outro tipo.', params: [{ chave: 'tipoA', rotulo: 'Tipo de meta', tipo: 'opcao', opcoes: OPCOES_FAMILIA }] },
    { tipo: 'depois_de', rotulo: 'Depois de', descricao: 'O tipo A vem ao menos N dias depois do tipo B (da mesma aula).', params: [{ chave: 'tipoA', rotulo: 'Tipo A (depois)', tipo: 'opcao', opcoes: OPCOES_FAMILIA }, { chave: 'tipoB', rotulo: 'Tipo B (antes)', tipo: 'opcao', opcoes: OPCOES_FAMILIA }, { chave: 'valor', rotulo: 'Dias de atraso', tipo: 'int', min: 0, max: 60, padrao: 1 }] },
    { tipo: 'ajustar_teto_pdf', rotulo: 'Ajustar teto de PDFull', descricao: 'Muda o teto de PDFulls novos por semana nas faixas da condição (condição só por faixa).', params: [{ chave: 'valor', rotulo: 'PDFulls novos por semana', tipo: 'int', min: 1, max: 12, padrao: 3 }] },
    { tipo: 'ajustar_limite_dia', rotulo: 'Ajustar limite por dia', descricao: 'Muda um limite diário (PDFulls distintos, PDFlashes ou questões) nas faixas da condição (condição só por faixa).', params: [{ chave: 'campo', rotulo: 'Limite', tipo: 'opcao', opcoes: CAMPOS_LIMITE_DIA.map((c) => ({ ...c })) }, { chave: 'valor', rotulo: 'Valor', tipo: 'int', min: 1, max: 6, padrao: 2 }] },
    { tipo: 'aviso', rotulo: 'Emitir aviso', descricao: 'Só informa: aparece na validação do fluxo. Não altera o cronograma.', informativa: true, params: [{ chave: 'texto', rotulo: 'Texto do aviso', tipo: 'texto' }] },
  ],
  naoSuportado: [
    'Mover/priorizar um tipo de meta (a prioridade é uma tabela fixa do motor; mudar a ordem exigiria alterar a alocação e arriscar o golden).',
    'Exigir um tipo de meta em um dia da semana (o motor não tem passo de "preenchimento obrigatório"; só sabe proibir/limitar).',
    'Condições por horas do dia e por semanas até a prova (variáveis fora do contexto seguro do motor).',
    'Limitar horas por dia (a rotina em horas é entrada do aluno; o motor só limita quantidade de metas).',
  ],
}
const ACAO_POR_TIPO = new Map(CATALOGO.acoes.map((a) => [a.tipo, a]))

// ── DNF (OU de grupos E) ────────────────────────────────────────────────────────────────────────────
type Dnf = Comparacao[][]
const LIM_TERMOS = 64
const VERDADEIRO: Dnf = [[]]
class Complexa extends Error {}
const e = (a: Dnf, b: Dnf): Dnf => { const out: Dnf = []; for (const x of a) for (const y of b) { out.push([...x, ...y]); if (out.length > LIM_TERMOS) throw new Complexa() } return out }
const ou = (a: Dnf, b: Dnf): Dnf => { const r = [...a, ...b]; if (r.length > LIM_TERMOS) throw new Complexa(); return r }
const OPOSTO: Record<OpCond, OpCond> = { igual: 'diferente', diferente: 'igual', menor: 'maior_igual', maior_igual: 'menor', maior: 'menor_igual', menor_igual: 'maior', em: 'fora_de', fora_de: 'em' }
const negarCmp = (c: Comparacao): Comparacao => ({ ...c, op: OPOSTO[c.op] })
/** ¬(OU de grupos E) = E de (OU de comparações negadas). Falso = `[]`, verdadeiro = `[[]]`. */
export function negar(d: Dnf): Dnf {
  let acc: Dnf = VERDADEIRO
  for (const g of d) acc = e(acc, g.map((c) => [negarCmp(c)]))
  return acc
}
const condicaoParaDnf = (c: Condicao | undefined): Dnf => (c && c.ou.length ? c.ou.map((g) => [...g]) : VERDADEIRO)
const ehNao = (r: string | undefined): boolean => /^\s*(n[aã]o|n)\s*$/i.test(r ?? '')

// ── regras extraídas do overlay ─────────────────────────────────────────────────────────────────────
export interface RegraExecutavel { noId: string; titulo: string; acao: AcaoUsuario; dnf: Dnf; semCondicao: boolean }

export function extrairRegras(o: OverlayFluxo): { regras: RegraExecutavel[]; erros: string[]; avisos: string[] } {
  const erros: string[] = [], avisos: string[] = []
  const nos = new Map<string, NoUsuario>(o.nos.map((n) => [n.id, n]))
  const memo = new Map<string, Dnf>(), visitando = new Set<string>()
  const entradas = (id: string) => o.arestas.filter((a) => a.para === id && nos.get(a.de)?.tipo === 'condicao' && nos.get(a.de)?.diagrama === nos.get(id)?.diagrama)
  const doPredecessores = (id: string): Dnf | null => {
    const es = entradas(id)
    if (!es.length) return null
    let acc: Dnf = []
    for (const a of es) { const c = efetiva(a.de); acc = ou(acc, ehNao(a.rotulo) ? negar(c) : c) }
    return acc
  }
  const efetiva = (id: string): Dnf => {
    const m = memo.get(id); if (m) return m
    if (visitando.has(id)) { erros.push(`Ciclo de condições em “${nos.get(id)?.titulo ?? id}”.`); return [] }
    visitando.add(id)
    let r: Dnf
    try { const p = doPredecessores(id); r = p ? e(condicaoParaDnf(nos.get(id)?.condicao), p) : condicaoParaDnf(nos.get(id)?.condicao) } catch { erros.push(`Condição complexa demais em “${nos.get(id)?.titulo ?? id}” (máx. ${LIM_TERMOS} combinações).`); r = [] }
    visitando.delete(id); memo.set(id, r)
    return r
  }
  const regras: RegraExecutavel[] = []
  for (const n of o.nos) {
    if (n.tipo !== 'acao' || !n.acao) continue
    let dnf: Dnf
    try { const p = doPredecessores(n.id); dnf = p ?? VERDADEIRO } catch { erros.push(`Condição complexa demais antes de “${n.titulo}” (máx. ${LIM_TERMOS} combinações).`); continue }
    regras.push({ noId: n.id, titulo: n.titulo, acao: n.acao, dnf, semCondicao: entradas(n.id).length === 0 })
  }
  return { regras, erros: [...new Set(erros)], avisos }
}

// ── resolução de uma condição em conjuntos ──────────────────────────────────────────────────────────
interface Conjunto { faixa: Set<number>; dia: Set<number>; tipo: Set<string> }
const todos = (): Conjunto => ({ faixa: new Set([1, 2, 3]), dia: new Set([0, 1, 2, 3, 4, 5, 6]), tipo: new Set<string>(FAMILIAS_RESTRICAO) })
const nomeVal = (v: string, x: number | string) => (v === 'dia_semana' ? DIAS_NOME[Number(x)] ?? String(x) : v === 'tipo_meta' ? ROTULO_FAMILIA[x as FamiliaRestricao] ?? String(x) : String(x))

function filtrar(c: Comparacao): { ok: true; ids: Array<number | string> } | { ok: false; erro: string } {
  const def = CATALOGO.variaveis.find((v) => v.chave === c.variavel)
  if (!def) return { ok: false, erro: `Variável desconhecida: “${c.variavel}”.` }
  if (!def.disponivel) return { ok: false, erro: `A variável “${def.rotulo}” não pode ser usada: ${def.motivo}` }
  if (!def.ops.includes(c.op)) return { ok: false, erro: `Operador “${ROTULO_OP[c.op]}” não vale para “${def.rotulo}”.` }
  const uni = UNIVERSO[c.variavel]
  const num = c.variavel !== 'tipo_meta'
  const valores = c.valor.map((x) => (num ? Number(x) : String(x)))
  if (!valores.length || valores.some((x) => !uni.includes(x))) return { ok: false, erro: `Valor inválido em “${def.rotulo}”.` }
  const v0 = valores[0]
  const ids = uni.filter((u) => {
    switch (c.op) {
      case 'igual': return u === v0
      case 'diferente': return u !== v0
      case 'menor': return (u as number) < (v0 as number)
      case 'menor_igual': return (u as number) <= (v0 as number)
      case 'maior': return (u as number) > (v0 as number)
      case 'maior_igual': return (u as number) >= (v0 as number)
      case 'em': return valores.includes(u)
      case 'fora_de': return !valores.includes(u)
    }
  })
  return { ok: true, ids }
}
function resolverGrupo(g: Comparacao[]): { ok: true; c: Conjunto } | { ok: false; erro: string } {
  const c = todos()
  for (const cmp of g) {
    const r = filtrar(cmp)
    if (!r.ok) return r
    const alvo = cmp.variavel === 'faixa' ? c.faixa : cmp.variavel === 'dia_semana' ? c.dia : c.tipo
    for (const x of [...alvo]) if (!r.ids.includes(x as never)) alvo.delete(x as never)
  }
  return { ok: true, c }
}

export function descreverCondicao(d: Dnf): string {
  if (d.length === 1 && d[0].length === 0) return 'sempre'
  if (!d.length) return 'nunca'
  return d.map((g) => g.map((c) => `${CATALOGO.variaveis.find((v) => v.chave === c.variavel)?.rotulo ?? c.variavel} ${ROTULO_OP[c.op]} ${c.valor.map((x) => nomeVal(c.variavel, x)).join(', ')}`).join(' E ')).join(' OU ')
}

// ── validação de parâmetros da ação ─────────────────────────────────────────────────────────────────
const ehFamilia = (v: unknown): v is FamiliaRestricao => FAMILIAS_RESTRICAO.includes(v as FamiliaRestricao)
export function validarAcao(a: AcaoUsuario): string | null {
  const def = ACAO_POR_TIPO.get(a.tipo)
  if (!def) return `Ação desconhecida: “${a.tipo}”.`
  for (const p of def.params) {
    const v = a[p.chave]
    if (p.tipo === 'int') { if (typeof v !== 'number' || !Number.isInteger(v) || v < (p.min ?? 0) || v > (p.max ?? 999)) return `${def.rotulo}: “${p.rotulo}” deve ser inteiro de ${p.min} a ${p.max}.` }
    else if (p.tipo === 'opcao') { if (typeof v !== 'string' || !p.opcoes?.some((o) => o.valor === v)) return `${def.rotulo}: escolha “${p.rotulo}”.` }
    else if (typeof v !== 'string' || !v.trim()) return `${def.rotulo}: preencha “${p.rotulo}”.`
  }
  if ((a.tipo === 'nao_mesmo_dia' || a.tipo === 'depois_de') && a.tipoA === a.tipoB) return `${def.rotulo}: os dois tipos devem ser diferentes.`
  if (a.tipo === 'depois_de' && [a.tipoA, a.tipoB].some((f) => f === 'lp' || f === 'jp')) return '“Depois de” só vale entre PDFull, PDFlash e Questões.'
  return null
}

// ── compilação ──────────────────────────────────────────────────────────────────────────────────────
export interface ResultadoCompilacao { regras: RegrasMotor; erros: string[]; avisos: string[]; diagnosticos: string[]; aplicadas: number }
const TIPO_RESTR: Partial<Record<string, TipoRestricao>> = { limitar_por_dia: 'max_por_dia', bloquear: 'max_por_dia', nao_mesmo_dia: 'nao_mesmo_dia', nao_dias_seguidos: 'nao_dias_seguidos', so_na_sobra: 'so_na_sobra', depois_de: 'depois_de' }

export function compilarRegrasUsuario(regras: RegrasMotor, overlay: OverlayFluxo): ResultadoCompilacao {
  const ext = extrairRegras(overlay)
  const erros = [...ext.erros], avisos = [...ext.avisos], diagnosticos: string[] = []
  if (!ext.regras.length) return { regras, erros, avisos, diagnosticos, aplicadas: 0 }

  const novas: RestricaoRegra[] = []
  const teto = new Map<number, number>()                 // índice da faixa → teto
  const limites: Array<{ classes: number[]; campo: string; valor: number }> = []
  let aplicadas = 0
  for (const r of ext.regras) {
    const ref = `“${r.titulo}”`
    const errA = validarAcao(r.acao)
    if (errA) { erros.push(`${ref}: ${errA}`); continue }
    if (r.semCondicao && r.acao.tipo !== 'aviso') avisos.push(`${ref} não tem condição ligada: vale SEMPRE.`)
    const grupos: Conjunto[] = []
    let invalida = false
    for (const g of r.dnf) { const x = resolverGrupo(g); if (!x.ok) { erros.push(`${ref}: ${x.erro}`); invalida = true; break } if (x.c.faixa.size && x.c.dia.size && x.c.tipo.size) grupos.push(x.c) }
    if (invalida) continue
    if (!grupos.length) { avisos.push(`${ref}: a condição nunca é verdadeira; a ação não terá efeito.`); continue }
    const quando = descreverCondicao(r.dnf)
    if (r.acao.tipo === 'aviso') { diagnosticos.push(`Aviso — ${ref} (quando ${quando}): ${r.acao.texto}`); continue }

    const efeitosAntes = novas.length + teto.size + limites.length
    grupos.forEach((c, k) => {
      const fx = c.faixa.size === 3 ? [] : [...c.faixa].sort((a, b) => a - b)
      const dias = c.dia.size === 7 ? undefined : [...c.dia].sort((a, b) => a - b)
      const tipoAcao = r.acao.tipo
      if (tipoAcao === 'ajustar_teto_pdf' || tipoAcao === 'ajustar_limite_dia') {
        if (dias) { erros.push(`${ref}: “${ACAO_POR_TIPO.get(tipoAcao)!.rotulo}” não aceita condição por dia da semana.`); return }
        if (c.tipo.size !== 5) { erros.push(`${ref}: “${ACAO_POR_TIPO.get(tipoAcao)!.rotulo}” não aceita condição por tipo de meta.`); return }
        const classes = fx.length ? fx : [1, 2, 3]
        if (tipoAcao === 'ajustar_teto_pdf') {
          regras.faixas.forEach((f: FaixaCarga, i) => { if (classes.includes(classeDaFaixa(f))) { if (teto.has(i) && teto.get(i) !== r.acao.valor) avisos.push(`${ref}: outra regra já ajusta o teto da faixa “${f.nome}”; vale a última.`); teto.set(i, r.acao.valor as number) } })
          diagnosticos.push(`${ref}: teto de PDFull = ${r.acao.valor} (faixa ${classes.join(', ')}; quando ${quando}).`)
        } else { limites.push({ classes, campo: r.acao.campo as string, valor: r.acao.valor as number }); diagnosticos.push(`${ref}: ${CAMPOS_LIMITE_DIA.find((x) => x.valor === r.acao.campo)?.rotulo} = ${r.acao.valor} (faixa ${classes.join(', ')}; quando ${quando}).`) }
        return
      }
      const A = r.acao.tipoA as FamiliaRestricao
      if (!c.tipo.has(A)) { avisos.push(`${ref}: a condição por tipo de meta exclui ${ROTULO_FAMILIA[A]}; esta ação não vale neste ramo.`); return }
      const tipo = TIPO_RESTR[tipoAcao] as TipoRestricao
      const rel = tipo === 'nao_mesmo_dia' || tipo === 'depois_de'
      novas.push({
        id: `usr:${r.noId}:${k}`.slice(0, 40), tipo, ativa: true, rotulo: `Fluxo: ${r.titulo}`.slice(0, 80), tipoA: A, tipoB: rel ? (r.acao.tipoB as FamiliaRestricao) : null,
        valor: tipoAcao === 'bloquear' ? 0 : tipo === 'max_por_dia' || tipo === 'depois_de' ? (r.acao.valor as number) : 0, faixas: fx, ...(dias ? { dias } : {}),
      })
    })
    if (novas.length + teto.size + limites.length > efeitosAntes) aplicadas++
  }

  // restrições: total ≤ 40 e sem conflito ERRO (as regras do usuário NÃO são aplicadas se criarem um) — o runtime nunca roda com conflito.
  let restr = [...regras.restricoes, ...novas]
  if (novas.length) {
    if (restr.length > 40) { erros.push('Restrições demais: as regras do usuário somadas às regras do motor passam de 40.'); restr = [...regras.restricoes] }
    else {
      const antes = new Set(detectarConflitosRestricoes(regras.restricoes).erros)
      const c = detectarConflitosRestricoes(restr)
      const novosErros = c.erros.filter((x) => !antes.has(x))
      if (novosErros.length) { erros.push(...novosErros.map((x) => `Regras do fluxo: ${x}`)); restr = [...regras.restricoes] }
      else avisos.push(...c.avisos)
    }
    if (restr.length > regras.restricoes.length) diagnosticos.push(...novas.map((x) => `Restrição aplicada: ${descreverRestricao(x)}.`))
  }
  const aplicouRestr = restr.length > regras.restricoes.length
  if (!aplicouRestr && !teto.size && !limites.length) return { regras, erros: [...new Set(erros)], avisos: [...new Set(avisos)], diagnosticos, aplicadas: 0 }

  const faixas = teto.size ? regras.faixas.map((f, i) => (teto.has(i) ? { ...f, tetoPdf: teto.get(i) as number } : f)) : regras.faixas
  let limitesDia = regras.limitesDia
  let faixasFinal = faixas
  for (const l of limites) {
    if (l.classes.length === 3) limitesDia = { ...limitesDia, [l.campo]: l.valor }
    else faixasFinal = faixasFinal.map((f) => (l.classes.includes(classeDaFaixa(f)) ? { ...f, overrides: { ...f.overrides, limitesDia: { ...(f.overrides?.limitesDia ?? {}), [l.campo]: l.valor } } } : f))
  }
  const final = normalizarRegras({ ...regras, restricoes: restr, faixas: faixasFinal, limitesDia })
  return { regras: final, erros: [...new Set(erros)], avisos: [...new Set(avisos)], diagnosticos, aplicadas }
}
