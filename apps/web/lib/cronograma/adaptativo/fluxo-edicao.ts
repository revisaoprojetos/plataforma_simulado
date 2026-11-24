/**
 * Mapeamento NÓ DO FLUXO → CAMPOS EDITÁVEIS das regras do motor (adaptador 'cronograma-adaptativo'). Puro, sem I/O.
 * Reusa os campos/limites de `regras-campos.ts` (a validação oficial continua sendo o zod de `regras-validacao.ts` no servidor).
 * Nós ausentes do mapa não têm regra editável (o painel mostra só o link "Editar em …").
 */
import type { RegrasMotor } from './regras'
import { GRUPOS_CAMPOS, TODOS_CAMPOS, gravarCaminho, lerCaminho, type CampoRegra } from './regras-campos'
import { MODOS_QUESTOES, MODOS_REVISAO, ROTULO_MODO_QUESTOES, ROTULO_MODO_REVISAO } from './faixas-carga'
import { ajustarMaximo } from './faixas-editor'
import { descreverRestricao } from './restricoes'
import type { CampoSchema, EdicaoNo } from '../../admin/fluxo/adaptador'

const GRUPO_DE: Record<string, string> = {}
for (const g of GRUPOS_CAMPOS) for (const c of g.campos) GRUPO_DE[c.path] = g.titulo

const doCampo = (c: CampoRegra, R: RegrasMotor): CampoSchema => ({
  chave: c.path, rotulo: c.rotulo, tipo: c.tipo, valor: lerCaminho(R, c.path), min: c.min, max: c.max, sufixo: c.sufixo, dica: c.dica, grupo: GRUPO_DE[c.path],
})

/** `a.b` (campo exato) ou `a.*` (todos os campos do prefixo `a.`). */
function expandir(padrao: string): CampoRegra[] {
  if (padrao.endsWith('.*')) { const p = padrao.slice(0, -1); return TODOS_CAMPOS.filter((c) => c.path.startsWith(p)) }
  return TODOS_CAMPOS.filter((c) => c.path === padrao)
}

// nó → campos globais (paths exatos ou prefixo.*)
const MAPA: Record<string, string[]> = {
  'c.gera': ['horizonte.*', 'rotina.*', 'constantes.blocoMin', 'constantes.cotaPdflashDuracaoMin', 'constantes.questoesBaseDia', 'constantes.reservaCicloDivisor'],
  'c.cabe': ['horizonte.maxSemanas'],
  'c.menos': ['constantes.cargaMinimaMin'],
  'c.fila': ['rodizio.*'],
  'r.ciclo': ['revisao.cicloSemanas', 'revisao.antecipaMinSemanas.fl', 'revisao.antecipaMinSemanas.qu', 'revisao.giroExternas'],
  'r.sem': ['adaptacao.semanaEspecialAtiva'],
  'r.off': ['adaptacao.semanaEspecialAtiva'],
  'r.perio': ['revisao.padrao', 'revisao.opcoesNovas', 'revisao.opcoesLegado'],
  'h.d': ['historico.corteAltaMin'],
  'h.alta': ['historico.metaSemanalAlta'],
  'h.base': ['historico.metaSemanalBase'],
  'h.ac': ['desempenho.historicoOkMin', 'desempenho.historicoFlashMin'],
  'h.ok': ['desempenho.historicoOkMin'],
  'h.fl': ['desempenho.historicoOkMin', 'desempenho.historicoFlashMin', 'adaptacao.reforcoAtivo'],
  'h.pf': ['desempenho.historicoFlashMin', 'adaptacao.reforcoAtivo'],
  'e.ac': ['desempenho.especialPdfAbaixo', 'desempenho.especialFlashAte', 'desempenho.acertoFracoPct', 'desempenho.rankingBonusFraco', 'desempenho.rankingPesoDistancia', 'desempenho.rankingPenalidadeRevisado'],
  'e.pf': ['desempenho.especialPdfAbaixo'],
  'e.fl': ['desempenho.especialPdfAbaixo', 'desempenho.especialFlashAte'],
  'e.fora': ['desempenho.especialFlashAte'],
  'd.ini': ['prioridades.*'],
  'd.lim': ['limitesDia.pdfDistintos', 'limitesDia.revisoes', 'limitesDia.questoes'],
  'd.novos': ['limitesDia.pdfNovosBase', 'limitesDia.pdfNovosAposConclusao'],
  'rf.d': ['retaFinal.*'],
  'rf.sim': ['retaFinal.semanaEncaixeExtra', 'divisao.sobraMinAvancarMin'],
  'rf.nao': ['retaFinal.semanaMinima'],
  'j.d1': ['juris.exigeOptIn'],
  'j.d2': ['juris.minSemanalMin'],
  'j.res': ['juris.diasPreferidos', 'juris.reservaCapacidadeRevisaoMin'],
  'l.res': ['legproc.*'],
  'm.dom': ['adaptacao.dominoAtivo', 'constantes.prioridadesDomino.revisaoDia', 'constantes.prioridadesDomino.revisaoRepetida', 'constantes.prioridadesDomino.rebaixada'],
  'm.adia': ['adaptacao.dominoAtivo'],
  'm.conc': ['adaptacao.antecipaRetornoAtivo'],
  'm.ref': ['adaptacao.reforcoAtivo'],
  'm.refok': ['adaptacao.reforcoAtivo', 'desempenho.historicoFlashMin', 'desempenho.historicoOkMin'],
  'm.refoff': ['adaptacao.reforcoAtivo'],
  'p.3': ['divisao.maxDatas', 'limitesDia.pdfDistintos'],
  'p.4': ['retaFinal.*', 'juris.minSemanalMin'],
  'p.5': ['divisao.janelaLeituraInteiraSemanas', 'divisao.sobraMinAvancarMin'],
  'p.7': ['retaFinal.semanaEncaixeExtra'],
  'p.8': ['legproc.*'],
}

const OPC_REV = MODOS_REVISAO.map((m) => ({ valor: m, rotulo: ROTULO_MODO_REVISAO[m] }))
const OPC_QUE = MODOS_QUESTOES.map((m) => ({ valor: m, rotulo: ROTULO_MODO_QUESTOES[m] }))

type CampoFaixa = 'maxMin' | 'tetoPdf' | 'soRegra23' | 'equilibra' | 'revisaoModo' | 'modoQuestoes'
/** Campos de UMA faixa (k). `quais` filtra. */
function camposDaFaixa(R: RegrasMotor, k: number, quais: CampoFaixa[]): CampoSchema[] {
  const f = R.faixas[k]; if (!f) return []
  const ultima = k === R.faixas.length - 1, g = `Faixa ${k + 1} · ${f.nome}`, ch = (c: CampoFaixa) => `faixas.${k}.${c}`
  const out: CampoSchema[] = []
  for (const q of quais) {
    if (q === 'maxMin') { if (!ultima) out.push({ chave: ch(q), rotulo: 'Carga máxima da faixa (o mínimo da seguinte acompanha)', tipo: 'int', valor: f.maxMin, min: f.minMin, max: 6000, sufixo: 'min', dica: 'Múltiplo de 30 recomendado.', grupo: g }) }
    else if (q === 'tetoPdf') out.push({ chave: ch(q), rotulo: 'Teto de PDFulls novos por semana', tipo: 'int', valor: f.tetoPdf, min: 1, max: 12, grupo: g })
    else if (q === 'soRegra23') out.push({ chave: ch(q), rotulo: 'Teto só na regra 23', tipo: 'bool', valor: f.soRegra23, grupo: g })
    else if (q === 'equilibra') out.push({ chave: ch(q), rotulo: 'Faixa equilibrada', tipo: 'bool', valor: f.equilibra, grupo: g })
    else if (q === 'revisaoModo') out.push({ chave: ch(q), rotulo: 'Modo de revisão', tipo: 'opcao', valor: f.revisaoModo, opcoes: OPC_REV, grupo: g })
    else out.push({ chave: ch(q), rotulo: 'Modo de questões', tipo: 'opcao', valor: f.modoQuestoes, opcoes: OPC_QUE, grupo: g })
  }
  return out
}

function camposRestricoes(R: RegrasMotor): CampoSchema[] {
  const out: CampoSchema[] = []
  R.restricoes.forEach((r, k) => {
    const g = r.rotulo || descreverRestricao(r)
    out.push({ chave: `restricoes.${k}.ativa`, rotulo: 'Ativa', tipo: 'bool', valor: r.ativa, grupo: g })
    if (r.tipo === 'max_por_dia') out.push({ chave: `restricoes.${k}.valor`, rotulo: 'Máximo por dia', tipo: 'int', valor: r.valor, min: 1, max: 12, grupo: g })
  })
  return out
}

/** Campos editáveis do nó `id` nas regras `R` (`null` = nó sem regra editável). */
export function camposDoNo(id: string, R: RegrasMotor): EdicaoNo | null {
  let campos: CampoSchema[] = []
  let aviso: string | undefined
  let m: RegExpExecArray | null
  const todasFaixas = (q: CampoFaixa[]) => R.faixas.flatMap((_, k) => camposDaFaixa(R, k, q))
  if (id === 'c.rotina') campos = todasFaixas(['maxMin', 'tetoPdf', 'soRegra23', 'equilibra', 'revisaoModo', 'modoQuestoes'])
  else if ((m = /^f\.r(\d+)$/.exec(id))) {
    const k = Number(m[1])
    campos = camposDaFaixa(R, k, ['tetoPdf', 'soRegra23', 'equilibra', 'revisaoModo', 'modoQuestoes'])
    if (R.faixas[k]?.equilibra) campos.push(...expandir('equilibrio.*').map((c) => doCampo(c, R)))
  } else if ((m = /^f\.d(\d+)$/.exec(id))) campos = camposDaFaixa(R, Number(m[1]), ['maxMin', 'soRegra23'])
  else if (id === 'r.d') campos = todasFaixas(['revisaoModo'])
  else if (id === 'd.teto') campos = todasFaixas(['tetoPdf'])
  else if (id === 'c.restr' || id === 'd.restr') { campos = camposRestricoes(R); aviso = 'Criar, apagar ou editar o tipo/escopo de uma restrição continua em Restrições.' }
  else if (MAPA[id]) campos = MAPA[id].flatMap(expandir).filter((c, i, a) => a.findIndex((x) => x.path === c.path) === i).map((c) => doCampo(c, R))
  return campos.length ? { campos, ...(aviso ? { aviso } : {}) } : null
}

const RE_FAIXA = /^faixas\.\d+\.(maxMin|tetoPdf|soRegra23|equilibra|revisaoModo|modoQuestoes)$/
const RE_RESTR = /^restricoes\.\d+\.(ativa|valor)$/
/** Lista branca das chaves aceitas no patch (nada fora dela chega ao motor). */
export const chaveEditavel = (k: string): boolean => RE_FAIXA.test(k) || RE_RESTR.test(k) || TODOS_CAMPOS.some((c) => c.path === k)

/** Aplica o patch (chave → valor) sobre as regras vigentes, sem mutar. O resultado AINDA passa por `validarRegras` no servidor. */
export function aplicarPatchRegras(R: RegrasMotor, valores: Record<string, unknown>): { ok: true; regras: RegrasMotor } | { ok: false; error: string } {
  let atual = R
  for (const [k, v] of Object.entries(valores)) {
    if (!chaveEditavel(k)) return { ok: false, error: `Campo não editável: ${k}` }
    const mf = /^faixas\.(\d+)\.(.+)$/.exec(k)
    if (mf && Number(mf[1]) >= atual.faixas.length) return { ok: false, error: `Faixa inexistente: ${k}` }
    const mr = /^restricoes\.(\d+)\./.exec(k)
    if (mr && Number(mr[1]) >= atual.restricoes.length) return { ok: false, error: `Restrição inexistente: ${k}` }
    if (mf && mf[2] === 'maxMin') {
      if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: 'Carga máxima inválida.' }
      atual = { ...atual, faixas: ajustarMaximo(atual.faixas, Number(mf[1]), v) as RegrasMotor['faixas'] }
    } else atual = gravarCaminho(atual, k, v)
  }
  return { ok: true, regras: atual }
}
