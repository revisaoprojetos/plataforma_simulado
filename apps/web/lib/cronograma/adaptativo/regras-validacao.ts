/**
 * Validação (zod) das regras do motor — só servidor/testes (o motor/iframe usa `regras.ts`, que não depende de zod).
 * Mensagens em pt-BR. Aceita objeto PARCIAL (o que faltar vem do padrão); valores fora dos limites seguros são REJEITADOS
 * (diferente de `normalizarRegras`, que apenas faz clamp silencioso).
 */
import { z } from 'zod'
import { REGRAS_PADRAO, normalizarRegras, normalizarFaixas, TIPOS_RESTRICAO, FAMILIAS_RESTRICAO, type RegrasMotor } from './regras'
import { MODOS_QUESTOES, MODOS_REVISAO, SECOES_OVERRIDE, validarFaixas, type FaixaCarga } from './faixas-carga'
import { detectarConflitosRestricoes } from './restricoes'

const n = (rotulo: string, min: number, max: number) =>
  z.number({ invalid_type_error: `${rotulo}: informe um número.` }).int(`${rotulo}: use um número inteiro.`).min(min, `${rotulo}: mínimo ${min}.`).max(max, `${rotulo}: máximo ${max}.`)
const r = (rotulo: string, min: number, max: number) =>
  z.number({ invalid_type_error: `${rotulo}: informe um número.` }).min(min, `${rotulo}: mínimo ${min}.`).max(max, `${rotulo}: máximo ${max}.`)
const b = (rotulo: string) => z.boolean({ invalid_type_error: `${rotulo}: informe sim ou não.` })
const lista = (rotulo: string, min: number, max: number, tam = 12) =>
  z.array(n(rotulo, min, max)).min(1, `${rotulo}: informe ao menos um valor.`).max(tam, `${rotulo}: no máximo ${tam} valores.`)

const SCHEMA = z.object({
  versaoSchema: z.number().optional(),
  horizonte: z.object({ maxSemanas: n('Horizonte (semanas)', 20, 600) }),
  revisao: z.object({
    cicloSemanas: n('Periodicidade do ciclo (semanas)', 2, 12),
    opcoesNovas: lista('Opções de periodicidade', 2, 24),
    opcoesLegado: z.array(n('Opções legadas', 2, 24)).max(12),
    padrao: n('Periodicidade padrão (semanas)', 2, 24),
    antecipaMinSemanas: z.object({ fl: n('Antecipação do PDFlash (semanas)', 0, 12), qu: n('Antecipação das questões (semanas)', 0, 12) }),
    giroExternas: n('Rotação das essenciais externas', 0, 20),
  }),
  limitesDia: z.object({
    pdfDistintos: n('PDFulls distintos por dia', 1, 6),
    revisoes: n('PDFlashes por dia', 1, 6),
    questoes: n('Questões por dia', 1, 6),
    pdfNovosBase: n('PDFulls novos por dia', 1, 6),
    pdfNovosAposConclusao: n('PDFulls novos por dia após conclusão', 1, 6),
  }),
  divisao: z.object({
    maxDatas: n('Datas máximas por leitura', 1, 5),
    sobraMinAvancarMin: n('Sobra mínima para avançar (min)', 30, 240),
    janelaLeituraInteiraSemanas: n('Janela da leitura inteira (semanas)', 0, 12),
  }),
  legproc: z.object({
    metasDiaMax: n('LegProc: metas por dia', 1, 12),
    metasDiaBase: n('LegProc: metas por dia (1º bloco)', 1, 12),
    mesmaLei: n('LegProc: metas da mesma lei', 1, 12),
    leisDistintas: n('LegProc: leis distintas por dia', 1, 6),
  }),
  desempenho: z.object({
    historicoOkMin: n('Histórico: acerto "ok" (%)', 0, 100),
    historicoFlashMin: n('Histórico: acerto mínimo p/ PDFlash (%)', 0, 100),
    especialPdfAbaixo: n('Semana especial: PDFull abaixo de (%)', 0, 100),
    especialFlashAte: n('Semana especial: PDFlash até (%)', 0, 100),
    acertoFracoPct: n('Acerto fraco (%)', 0, 100),
    rankingBonusFraco: r('Ranking: bônus de tema fraco', 0, 20),
    rankingPesoDistancia: r('Ranking: peso da distância', 0, 50),
    rankingPenalidadeRevisado: r('Ranking: penalidade de revisado', 0, 50),
  }),
  retaFinal: z.object({
    semanaMinima: n('Reta final: semana mínima', 0, 52),
    limiarTetos: n('Reta final: limiar de tetos', 0, 12),
    limiarTetosApos: n('Reta final: limiar de tetos (após o corte)', 0, 12),
    semanaCorteLimiar: n('Reta final: semana de corte', 0, 52),
    semanaEncaixeExtra: n('Reta final: semana do encaixe extra', 0, 52),
  }),
  juris: z.object({
    minSemanalMin: n('Jurisprudência: carga mínima da semana (min)', 0, 3000),
    diasPreferidos: lista('Jurisprudência: dias preferidos', 0, 6, 7),
    exigeOptIn: b('Jurisprudência: exige opt-in'),
    reservaCapacidadeRevisaoMin: n('Jurisprudência: reserva na revisão (min)', 0, 240),
  }),
  historico: z.object({
    metaSemanalBase: n('Diagnóstico: metas por semana', 0, 7),
    metaSemanalAlta: n('Diagnóstico: metas por semana (carga alta)', 0, 7),
    corteAltaMin: n('Diagnóstico: corte da carga alta (min)', 0, 6000),
  }),
  rotina: z.object({
    fimSemanaFracao: r('Fim de semana concentrado: fração', 0, 1),
    fimSemanaDiferencaHoras: r('Fim de semana concentrado: diferença (h)', 0, 24),
    diasPdfAteDow: n('Dias de PDFull (até o dia da semana)', 1, 7),
    diasRevisao: lista('Dias de revisão', 0, 6, 7),
    aquecimentoComQuestoes: n('Aquecimento (com questões)', 0, 12),
    aquecimentoSoRevisao: n('Aquecimento (só revisão)', 0, 12),
  }),
  rodizio: z.object({ atrasoLimiar: r('Rodízio: limiar de atraso', 0, 1) }),
  equilibrio: z.object({
    retornosDiaMax: n('Retornos por dia', 1, 6),
    questoesDia: n('Questões por dia (faixa equilibrada)', 1, 6),
    flashesDia: n('PDFlashes por dia (faixa equilibrada)', 1, 6),
  }),
  prioridades: z.object({
    porTipo: z.record(z.string(), n('Prioridade', 0, 20)),
    outros: n('Prioridade (outros)', 0, 20),
    faixa3: z.object({ fl: n('Prioridade PDFlash (faixa 3)', 0, 20), qu: n('Prioridade questões (faixa 3)', 0, 20), pdf: n('Prioridade PDFull (faixa 3)', 0, 20) }),
  }),
  adaptacao: z.object({ dominoAtivo: b('Dominó'), reforcoAtivo: b('Reforço'), semanaEspecialAtiva: b('Semana especial'), antecipaRetornoAtivo: b('Antecipar retorno') }),
  constantes: z.object({
    blocoMin: n('Bloco mínimo de tempo (min)', 10, 120),
    questoesBaseDia: n('Questões por dia (base)', 1, 6),
    reservaCicloDivisor: n('Reserva do ciclo (divisor)', 1, 12),
    prioridadesDomino: z.object({ revisaoDia: n('Dominó: prioridade no dia de revisão', 0, 20), revisaoRepetida: n('Dominó: prioridade repetida', 0, 20), rebaixada: n('Dominó: prioridade rebaixada', 0, 20) }),
    cotaPdflashDuracaoMin: n('Duração da cota de PDFlash (min)', 15, 240),
    cargaMinimaMin: n('Carga semanal mínima (min)', 0, 6000),
  }),
})

// ── faixas de carga (lista completa; cada faixa pode ter overrides parciais por seção) ─────────────────
const SHAPE = SCHEMA.shape as unknown as Record<string, z.ZodObject<z.ZodRawShape>>
const OVERRIDES = z.object(Object.fromEntries(SECOES_OVERRIDE.map((sec) => [sec, SHAPE[sec].partial().optional()]))).partial()
const FAIXA = z.object({
  id: z.string({ invalid_type_error: 'Faixa: identificador inválido.' }).min(1, 'Faixa: identificador obrigatório.').max(20, 'Faixa: identificador longo demais.'),
  nome: z.string({ invalid_type_error: 'Faixa: informe o nome.' }).trim().min(1, 'Faixa: informe o nome.').max(40, 'Faixa: nome com no máximo 40 caracteres.'),
  minMin: n('Faixa: carga mínima (min)', 0, 10080),
  maxMin: n('Faixa: carga máxima (min)', 0, 10080).nullable(),
  tetoPdf: n('Faixa: teto de PDFull novo por semana', 1, 12),
  soRegra23: b('Faixa: só regra 23'),
  equilibra: b('Faixa: equilibrada'),
  revisaoModo: z.enum(MODOS_REVISAO as unknown as [string, ...string[]], { errorMap: () => ({ message: 'Faixa: modo de revisão deve ser ciclo ou desempenho.' }) }),
  cicloSemanas: n('Faixa: periodicidade do ciclo (semanas)', 2, 12).nullable().optional().default(null),
  opcoesNovas: z.array(n('Faixa: opção de periodicidade', 2, 24)).max(12, 'Faixa: no máximo 12 opções.').nullable().optional().default(null),
  padrao: n('Faixa: periodicidade padrão (semanas)', 2, 24).nullable().optional().default(null),
  modoQuestoes: z.enum(MODOS_QUESTOES as unknown as [string, ...string[]], { errorMap: () => ({ message: 'Faixa: modo de questões inválido.' }) }),
  overrides: OVERRIDES.optional().default({}),
})
const LISTA_FAIXAS = z.array(FAIXA, { invalid_type_error: 'Faixas: informe uma lista.' }).min(1, 'Informe ao menos uma faixa de carga.').max(8, 'No máximo 8 faixas.')


const PARCIAL = (SCHEMA as unknown as { deepPartial: () => z.ZodTypeAny }).deepPartial()

const RESTRICAO = z.object({
  id: z.string({ invalid_type_error: 'Restrição: identificador inválido.' }).min(1, 'Restrição: identificador obrigatório.').max(40, 'Restrição: identificador longo demais.'),
  tipo: z.enum(TIPOS_RESTRICAO as unknown as [string, ...string[]], { errorMap: () => ({ message: 'Restrição: tipo desconhecido.' }) }),
  ativa: b('Restrição ativa'),
  rotulo: z.string({ invalid_type_error: 'Restrição: descrição inválida.' }).max(80, 'Restrição: descrição com no máximo 80 caracteres.'),
  tipoA: z.enum(FAMILIAS_RESTRICAO as unknown as [string, ...string[]], { errorMap: () => ({ message: 'Restrição: escolha o personagem (PDFull, PDFlash, Questões, LegProc ou Jurisprudência).' }) }),
  tipoB: z.enum(FAMILIAS_RESTRICAO as unknown as [string, ...string[]], { errorMap: () => ({ message: 'Restrição: escolha o segundo personagem.' }) }).nullable(),
  valor: z.number({ invalid_type_error: 'Restrição: informe um número.' }).int('Restrição: use um número inteiro.').min(0, 'Restrição: valor mínimo 0.').max(60, 'Restrição: valor máximo 60.'),
  faixas: z.array(z.number().int().min(1, 'Restrição: faixa de 1 a 3.').max(3, 'Restrição: faixa de 1 a 3.')).max(3, 'Restrição: no máximo 3 faixas.'),
}).superRefine((x, ctx) => {
  if ((x.tipo === 'nao_mesmo_dia' || x.tipo === 'depois_de') && !x.tipoB) ctx.addIssue({ code: 'custom', message: 'Restrição "' + (x.tipo === 'depois_de' ? 'depois de' : 'não no mesmo dia que') + '": escolha o segundo personagem.' })
  if (x.tipo === 'max_por_dia' && (x.valor < 1 || x.valor > 6)) ctx.addIssue({ code: 'custom', message: 'Máximo por dia: mínimo 1 e máximo 6.' })
})
const LISTA_RESTRICOES = z.array(RESTRICAO).max(40, 'No máximo 40 restrições.')

const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
function fundir(base: unknown, extra: unknown): unknown {
  // listas de objetos (ex.: restrições/faixas) substituem inteiras; objetos fundem por chave com o padrão
  if (Array.isArray(extra)) return extra
  if (ehObj(base) && ehObj(extra)) { const o: Record<string, unknown> = { ...base }; for (const k of Object.keys(extra)) o[k] = fundir(base[k], extra[k]); return o }
  return extra === undefined ? base : extra
}

export interface ResultadoValidacao { ok: boolean; erros: string[]; regras: RegrasMotor | null; /** avisos não bloqueantes (conflitos detectáveis entre restrições). */ avisos?: string[] }

/** Valida um objeto (parcial) de regras. `ok` → `regras` já normalizadas/completas; senão `erros` em pt-BR. */
export function validarRegras(entrada: unknown): ResultadoValidacao {
  if (!ehObj(entrada)) return { ok: false, erros: ['Regras inválidas: envie um objeto.'], regras: null }
  const { restricoes: restricoesBrutas, faixas: faixasBrutas, ...resto } = entrada
  const faixasLegado = faixasBrutas !== undefined && !Array.isArray(faixasBrutas) // formato antigo (objeto) é convertido na normalização
  const p = PARCIAL.safeParse(resto)
  const erros: string[] = p.success ? [] : [...new Set(p.error.issues.map((i) => i.message))]
  if (restricoesBrutas !== undefined) {
    const pr = LISTA_RESTRICOES.safeParse(restricoesBrutas)
    if (!pr.success) erros.push(...new Set(pr.error.issues.map((i) => i.message)))
  }
  if (Array.isArray(faixasBrutas)) {
    const pf = LISTA_FAIXAS.safeParse(faixasBrutas)
    if (!pf.success) erros.push(...new Set(pf.error.issues.map((i) => i.message)))
    else erros.push(...validarFaixas(pf.data as unknown as FaixaCarga[]))
  }
  if (erros.length) return { ok: false, erros: [...new Set(erros)], regras: null }
  // coerência entre campos (sobre o objeto completo, sem clamp)
  const { faixas: _f, ...semFaixas } = entrada
  const m = fundir(REGRAS_PADRAO, semFaixas) as RegrasMotor
  void faixasLegado
  if (m.desempenho.historicoFlashMin > m.desempenho.historicoOkMin) erros.push('O acerto mínimo do PDFlash não pode superar o acerto "ok" do diagnóstico.')
  if (m.desempenho.especialPdfAbaixo > m.desempenho.especialFlashAte) erros.push('O limiar de PDFull da semana especial não pode superar o de PDFlash.')
  if (!m.revisao.opcoesNovas.includes(m.revisao.padrao)) erros.push('A periodicidade padrão da revisão deve estar entre as opções oferecidas.')
  if (m.constantes.cargaMinimaMin > 0 && m.constantes.cargaMinimaMin < 300) erros.push('A carga semanal mínima, quando usada, deve ser de pelo menos 5h (300 min).')
  if (m.legproc.metasDiaBase > m.legproc.metasDiaMax) erros.push('LegProc: as metas do 1º bloco não podem superar o máximo diário.')
  const norm = normalizarRegras(entrada)
  const conf = detectarConflitosRestricoes(norm.restricoes)
  erros.push(...conf.erros)
  if (erros.length) return { ok: false, erros: [...new Set(erros)], regras: null, avisos: conf.avisos }
  return { ok: true, erros: [], regras: norm, avisos: conf.avisos }
}
