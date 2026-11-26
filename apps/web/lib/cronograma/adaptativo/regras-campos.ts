/**
 * Descrição dos CAMPOS de `RegrasMotor` para a tela admin (Faixas e limites) + utilitários puros (caminho, diff, ficha de personagem).
 * Puro, sem I/O. Os limites espelham `normalizarRegras`/`regras-validacao`; a validação oficial continua sendo o zod do servidor.
 */
import { REGRAS_PADRAO, normalizarRegras, type RegrasMotor } from './regras'
import { TIPOS_META, SLUGS_META, type SlugMeta } from './tipos-meta'
import { REGRA_TIPO_GX_PADRAO, type RegraTipoGx } from './gx-tipos'
import { descreverRestricao } from './restricoes'

/** Chave do rascunho (sessionStorage) compartilhado entre a aba Faixas e a aba Simulação. Só rascunho local. */
export const CHAVE_RASCUNHO = 'adaptativo-regras-rascunho'

export type TipoCampo = 'int' | 'real' | 'bool' | 'lista'
export interface CampoRegra { path: string; rotulo: string; tipo: TipoCampo; min?: number; max?: number; dica?: string; sufixo?: string }
export interface GrupoCampos { id: string; titulo: string; descricao: string; campos: CampoRegra[] }

const i = (path: string, rotulo: string, min: number, max: number, dica?: string, sufixo?: string): CampoRegra => ({ path, rotulo, tipo: 'int', min, max, dica, sufixo })
const r = (path: string, rotulo: string, min: number, max: number, dica?: string, sufixo?: string): CampoRegra => ({ path, rotulo, tipo: 'real', min, max, dica, sufixo })
const b = (path: string, rotulo: string, dica?: string): CampoRegra => ({ path, rotulo, tipo: 'bool', dica })
const l = (path: string, rotulo: string, min: number, max: number, dica?: string): CampoRegra => ({ path, rotulo, tipo: 'lista', min, max, dica })

const DIAS = 'Dias: 0 = segunda … 6 = domingo. Separe por vírgula.'
export const GRUPOS_CAMPOS: GrupoCampos[] = [
  { id: 'horizonte', titulo: 'Horizonte', descricao: 'Até onde o motor planeja à frente.', campos: [i('horizonte.maxSemanas', 'Semanas planejadas (máximo)', 20, 600, 'Se o plano não couber, nada é gravado.', 'sem')] },
  { id: 'revisao', titulo: 'Revisão (padrão global)', descricao: 'Valores padrão da revisão em ciclo e da semana especial; cada faixa de carga pode sobrescrever periodicidade, opções e padrão (aba Faixas).', campos: [
    i('revisao.cicloSemanas', 'Periodicidade do ciclo', 2, 12, undefined, 'sem'),
    l('revisao.opcoesNovas', 'Periodicidades oferecidas (planos novos)', 2, 24, 'Semanas, separadas por vírgula.'),
    l('revisao.opcoesLegado', 'Periodicidades só de planos legados', 2, 24),
    i('revisao.padrao', 'Periodicidade padrão', 2, 24, 'Deve estar entre as oferecidas.', 'sem'),
    i('revisao.antecipaMinSemanas.fl', 'Antecipar PDFlash: mínimo após a leitura', 0, 12, undefined, 'sem'),
    i('revisao.antecipaMinSemanas.qu', 'Antecipar questões: mínimo após a leitura', 0, 12, undefined, 'sem'),
    i('revisao.giroExternas', 'Rotação das essenciais externas', 0, 20),
  ] },
  { id: 'limites', titulo: 'Limites por dia', descricao: 'Quanto cabe em um dia.', campos: [
    i('limitesDia.pdfDistintos', 'PDFulls distintos por dia', 1, 6), i('limitesDia.revisoes', 'PDFlashes por dia', 1, 6), i('limitesDia.questoes', 'Questões por dia', 1, 6),
    i('limitesDia.pdfNovosBase', 'PDFulls novos por dia (base)', 1, 6), i('limitesDia.pdfNovosAposConclusao', 'PDFulls novos por dia após concluir um (modo de questões livre)', 1, 6),
  ] },
  { id: 'divisao', titulo: 'Divisão de leituras', descricao: 'Parcelamento de um PDFull em vários dias.', campos: [
    i('divisao.maxDatas', 'Datas máximas por leitura', 1, 5), i('divisao.sobraMinAvancarMin', 'Sobra mínima para iniciar trecho', 30, 240, 'Múltiplo de 30.', 'min'),
    i('divisao.janelaLeituraInteiraSemanas', 'Janela para achar dia que comporte a aula inteira', 0, 12, undefined, 'sem'),
  ] },
  { id: 'legproc', titulo: 'LegProc', descricao: 'Metas de lei seca por dia.', campos: [
    i('legproc.metasDiaMax', 'Metas por dia (2º bloco)', 1, 12), i('legproc.metasDiaBase', 'Metas por dia (1º bloco)', 1, 12),
    i('legproc.mesmaLei', 'Metas da mesma lei por dia', 1, 12), i('legproc.leisDistintas', 'Leis distintas por dia (reagendamento)', 1, 6),
  ] },
  { id: 'desempenho', titulo: 'Desempenho e limiares', descricao: 'Percentuais de acerto que decidem releitura, PDFlash ou dispensa.', campos: [
    i('desempenho.historicoOkMin', 'Diagnóstico: acerto que encerra', 0, 100, undefined, '%'), i('desempenho.historicoFlashMin', 'Diagnóstico: acerto mínimo p/ PDFlash', 0, 100, 'Abaixo vira PDFull.', '%'),
    i('desempenho.especialPdfAbaixo', 'Semana especial: abaixo disto, PDFull', 0, 100, undefined, '%'), i('desempenho.especialFlashAte', 'Semana especial: até isto, PDFlash', 0, 100, 'Acima fica de fora.', '%'),
    i('desempenho.acertoFracoPct', 'Tema "fraco" abaixo de', 0, 100, undefined, '%'),
    r('desempenho.rankingBonusFraco', 'Ranking: bônus por acerto fraco', 0, 20), r('desempenho.rankingPesoDistancia', 'Ranking: peso da distância ao limiar', 0, 50), r('desempenho.rankingPenalidadeRevisado', 'Ranking: penalidade de tema já revisado', 0, 50),
  ] },
  { id: 'reta', titulo: 'Reta final', descricao: 'Quando o plano entra na fase final.', campos: [
    i('retaFinal.semanaMinima', 'Só após a semana', 0, 52), i('retaFinal.limiarTetos', 'Restam ≤ N tetos (até a semana de corte)', 0, 12), i('retaFinal.limiarTetosApos', 'Restam ≤ N tetos (após o corte)', 0, 12),
    i('retaFinal.semanaCorteLimiar', 'Semana de corte entre os limiares', 0, 52), i('retaFinal.semanaEncaixeExtra', 'PDFull extra pode passar do teto após a semana', 0, 52),
  ] },
  { id: 'juris', titulo: 'Jurisprudência', descricao: 'Meta semanal de jurisprudência.', campos: [
    i('juris.minSemanalMin', 'Carga mínima da semana', 0, 3000, undefined, 'min'), l('juris.diasPreferidos', 'Dias preferidos', 0, 6, DIAS), b('juris.exigeOptIn', 'Exigir que o aluno marque Jurisprudência'),
    i('juris.reservaCapacidadeRevisaoMin', 'Reserva na semana de revisão', 0, 240, undefined, 'min'),
  ] },
  { id: 'historico', titulo: 'Histórico (diagnóstico)', descricao: 'Metas por semana do diagnóstico dos temas anteriores.', campos: [
    i('historico.metaSemanalBase', 'Metas por semana (carga normal)', 0, 7), i('historico.metaSemanalAlta', 'Metas por semana (carga alta)', 0, 7), i('historico.corteAltaMin', 'Carga alta a partir de', 0, 6000, undefined, 'min'),
  ] },
  { id: 'rotina', titulo: 'Rotina da semana', descricao: 'Como a semana é lida.', campos: [
    r('rotina.fimSemanaFracao', 'Fim de semana concentrado: fração da carga', 0, 1), r('rotina.fimSemanaDiferencaHoras', '… e maior dia acima da média dos úteis em', 0, 24, undefined, 'h'),
    i('rotina.diasPdfAteDow', 'Dias de PDFull: segunda até (exclusivo)', 1, 7, '4 = segunda a quinta.'), l('rotina.diasRevisao', 'Dias de revisão/questões', 0, 6, DIAS),
    i('rotina.aquecimentoComQuestoes', 'Aquecimento com questões', 0, 12, undefined, 'sem'), i('rotina.aquecimentoSoRevisao', 'Aquecimento só PDFlash', 0, 12, undefined, 'sem'),
  ] },
  { id: 'rodizio', titulo: 'Rodízio de disciplinas', descricao: 'Equilíbrio de progresso entre disciplinas.', campos: [r('rodizio.atrasoLimiar', 'Disciplina atrasada quando ≥ N abaixo do maior', 0, 1, '0,15 = 15 pontos percentuais.')] },
  { id: 'equilibrio', titulo: 'Equilíbrio (faixa equilibrada)', descricao: 'Vale nas faixas de carga marcadas como equilibradas.', campos: [
    i('equilibrio.retornosDiaMax', 'Retornos por dia (máx.)', 1, 6), i('equilibrio.questoesDia', 'Questões por dia', 1, 6), i('equilibrio.flashesDia', 'PDFlashes por dia no reagendamento', 1, 6),
  ] },
  { id: 'adaptacao', titulo: 'Adaptação por desempenho', descricao: 'Liga/desliga a adaptação sobre a MESMA base de metas. Tudo ligado = comportamento atual. Desligado = plano "normal" (use a Simulação para comparar).', campos: [
    b('adaptacao.dominoAtivo', 'Dominó (refluxo ao não fazer/mover)', 'Desligado: a meta só é adiada; as demais não se reorganizam (sem teto/limite sobre as adiadas).'),
    b('adaptacao.reforcoAtivo', 'Reforço do diagnóstico (metas :reforco:)', 'Desligado: nenhuma meta de reforço por acerto baixo no histórico.'),
    b('adaptacao.semanaEspecialAtiva', 'Semana especial por desempenho (metas :revisao:)', 'Desligado: a semana de revisão por desempenho não gera metas adaptativas (a revisão em ciclo não muda).'),
    b('adaptacao.antecipaRetornoAtivo', 'Antecipar retorno (PDFlash/questões)', 'Desligado: retorno nunca antes do prazo (também na reta final).'),
  ] },
  { id: 'constantes', titulo: 'Constantes do motor', descricao: 'Valores que eram fixos no código. O padrão reproduz o comportamento anterior; mude com cautela e confira na Inteligência.', campos: [
    i('constantes.blocoMin', 'Bloco mínimo de tempo', 10, 120, 'Granularidade das divisões de leitura, sobras e vagas. O padrão (30) é a base de todos os horários.', 'min'),
    i('constantes.questoesBaseDia', 'Questões por dia fora da faixa equilibrada (base)', 1, 6, 'A fórmula é "base + heranças" (questões adiadas que herdam vaga).'),
    i('constantes.reservaCicloDivisor', 'Reserva do ciclo: divisor das vagas de questões', 1, 12, 'PDFulls do ciclo = vagas de questões ÷ este valor (padrão 3).'),
    i('constantes.prioridadesDomino.revisaoDia', 'Dominó: prioridade de PDFlash/questões no dia de revisão', 0, 20, 'Menor = primeiro.'),
    i('constantes.prioridadesDomino.revisaoRepetida', 'Dominó: prioridade da mesma família repetida', 0, 20),
    i('constantes.prioridadesDomino.rebaixada', 'Dominó: prioridade rebaixada (fora do dia certo)', 0, 20),
    i('constantes.cotaPdflashDuracaoMin', 'Duração assumida na cota de PDFlash por dia', 15, 240, undefined, 'min'),
    i('constantes.cargaMinimaMin', 'Carga semanal mínima para gerar o plano', 0, 6000, '0 = não rejeita (comportamento atual).', 'min'),
  ] },
  { id: 'prioridades', titulo: 'Prioridades no reagendamento', descricao: 'Menor número = vem primeiro.', campos: [
    ...SLUGS_META.map((s) => i(`prioridades.porTipo.${s}`, `Prioridade: ${TIPOS_META[s].rotulo}`, 0, 20)),
    i('prioridades.outros', 'Prioridade: tipo desconhecido', 0, 20),
    i('prioridades.faixa3.fl', 'Modo livre (faixas ≥ 25h): PDFlash', 0, 20), i('prioridades.faixa3.qu', 'Modo livre: Questões', 0, 20), i('prioridades.faixa3.pdf', 'Modo livre: PDFull', 0, 20),
  ] },
]

export const TODOS_CAMPOS: CampoRegra[] = GRUPOS_CAMPOS.flatMap((g) => g.campos)

// ── caminho ──────────────────────────────────────────────────────────────────────────────────────────
export function lerCaminho(o: unknown, path: string): unknown {
  let cur: unknown = o
  for (const p of path.split('.')) { if (cur == null || typeof cur !== 'object') return undefined; cur = (cur as Record<string, unknown>)[p] }
  return cur
}
/** Cópia profunda de `o` com `path` = `valor` (não muta a entrada). */
export function gravarCaminho<T>(o: T, path: string, valor: unknown): T {
  const clone = JSON.parse(JSON.stringify(o)) as Record<string, unknown>
  const partes = path.split('.')
  let cur: Record<string, unknown> = clone
  for (let k = 0; k < partes.length - 1; k++) { const nx = cur[partes[k]]; if (nx == null || typeof nx !== 'object') return clone as T; cur = nx as Record<string, unknown> }
  cur[partes[partes.length - 1]] = valor
  return clone as T
}

// ── texto <-> valor ──────────────────────────────────────────────────────────────────────────────────
export const valorParaTexto = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v))
/** Texto digitado → valor do campo (número/lista). Inválido → NaN (número) ou array com NaN (lista), p/ a validação reprovar com mensagem. */
export function textoParaValor(c: CampoRegra, t: string): unknown {
  if (c.tipo === 'bool') return t === 'true'
  if (c.tipo === 'lista') return t.split(/[,;\s]+/).filter(Boolean).map(Number)
  return t.trim() === '' ? Number.NaN : Number(t.replace(',', '.'))
}
export const formatarValor = (v: unknown): string => (typeof v === 'boolean' ? (v ? 'sim' : 'não') : Array.isArray(v) ? (v.length ? v.join(', ') : '—') : v === null || v === undefined ? 'sem limite' : String(v))

// ── diff ─────────────────────────────────────────────────────────────────────────────────────────────
export interface DifCampo { path: string; rotulo: string; de: string; para: string }
const ROTULO_CAMPO_FAIXA: Record<string, string> = {
  nome: 'nome', minMin: 'carga mínima (min)', maxMin: 'carga máxima (min)', tetoPdf: 'teto de PDFull novo/semana', soRegra23: 'teto só com a regra 23', equilibra: 'equilibrada', revisaoModo: 'modo de revisão',
  cicloSemanas: 'periodicidade do ciclo', opcoesNovas: 'opções de periodicidade', padrao: 'periodicidade padrão', modoQuestoes: 'modo de questões', id: 'identificador',
}
const ROTULO_CAMPO_GX: Record<string, string> = {
  ativo: 'ativo', maxPorDia: 'máximo por dia', maxPorSemana: 'máximo por semana', dias: 'dias permitidos (0 = segunda)', faixas: 'faixas de carga (1-based)', aPartirDaSemana: 'a partir da semana',
}
/** Rótulo legível de qualquer caminho de `RegrasMotor` (inclui `faixas.N.campo` e `faixas.N.overrides.secao.campo`). */
export function rotuloDoCaminho(path: string, nomesGx?: Record<string, string>): string {
  const fixo = TODOS_CAMPOS.find((c) => c.path === path)?.rotulo
  if (fixo) return fixo
  const g = /^tiposGx\.([^.]+)(?:\.(.+))?$/.exec(path)
  if (g) {
    const nome = nomesGx?.[g[1]] ?? g[1]
    return g[2] ? `Tipo "${nome}": ${ROTULO_CAMPO_GX[g[2]] ?? g[2]}` : `Tipo "${nome}"`
  }
  const m = /^faixas\.(\d+)\.(.+)$/.exec(path)
  if (m) {
    const k = Number(m[1]) + 1, resto = m[2]
    if (resto.startsWith('overrides.')) { const sub = resto.slice('overrides.'.length); return `Faixa ${k} (override): ${TODOS_CAMPOS.find((c) => c.path === sub)?.rotulo ?? sub}` }
    return `Faixa ${k}: ${ROTULO_CAMPO_FAIXA[resto] ?? resto}`
  }
  return path
}
const rotuloDe = rotuloDoCaminho
function achatar(o: unknown, pre: string, out: Record<string, unknown>) {
  if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o as Record<string, unknown>)) achatar(v, pre ? `${pre}.${k}` : k, out)
  else if (Array.isArray(o) && o.some((x) => x && typeof x === 'object')) o.forEach((x, k) => achatar(x, `${pre}.${k}`, out))
  else out[pre] = o
}
/** Campos que diferem entre duas regras (ambas normalizadas). `de` = a, `para` = b. */
export function diffRegras(a: unknown, b: unknown, nomesGx?: Record<string, string>): DifCampo[] {
  const fa: Record<string, unknown> = {}, fb: Record<string, unknown> = {}
  achatar(normalizarRegras(a), '', fa); achatar(normalizarRegras(b), '', fb)
  const out: DifCampo[] = []
  // união das chaves: um tipo personalizado (tiposGx.<slug>.*) adicionado/removido só existe de um lado.
  for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
    if (k === 'versaoSchema') continue
    const va = fa[k], vb = fb[k]
    const vazioObj = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length
    if (vazioObj(va) || vazioObj(vb)) continue
    if (JSON.stringify(va) !== JSON.stringify(vb)) {
      const fmt = (v: unknown, lado: Record<string, unknown>) => (k in lado ? formatarValor(v) : 'não definido')
      out.push({ path: k, rotulo: k.startsWith('tiposGx.') ? rotuloDoCaminho(k, nomesGx) : rotuloDe(k), de: fmt(va, fa), para: fmt(vb, fb) })
    }
  }
  return out
}
/** Regras completas a partir do delta salvo numa versão. */
export const regrasDoDelta = (delta: unknown): RegrasMotor => normalizarRegras(delta)

// ── ficha de personagem (resumo legível das regras vigentes de um tipo de meta) ─────────────────────
export interface FichaTipo {
  avanca: string[]; recua: string[]; teto: string[]; editavel: string[]
  /** Revisão "chefão": periodicidade/modo (ciclo × desempenho) — só nos personagens de revisão; é a MESMA configuração de `regras.revisao` (não duplica dado). */
  chefao?: string[]
  /** Restrições (ativas ou não) que citam este personagem. */
  restricoes?: string[]
}
const h = (min: number) => (min % 60 === 0 ? `${min / 60}h` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`)
const DIA_PT = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']
/**
 * Ficha de um tipo PERSONALIZADO do catálogo (família gx). Só descreve as regras de elegibilidade de `regras.tiposGx[slug]`;
 * duração/prioridade/ordem/ativo-do-catálogo ficam no catálogo. Sem regra salva = comportamento padrão (sobra do dia).
 */
export function fichaDoTipoGx(slug: string, regras: RegrasMotor, nome?: string): FichaTipo {
  const r = (regras as { tiposGx?: Record<string, Partial<RegraTipoGx>> }).tiposGx?.[slug] ?? {}
  const p = { ...REGRA_TIPO_GX_PADRAO, ...r }
  const tipo = nome || slug
  const f: FichaTipo = { avanca: [], recua: [], teto: [], editavel: [`tiposGx.${slug}.*`] }
  if (p.ativo === false) f.teto.push(`Tipo "${tipo}" desligado nas regras: o motor não agenda metas dele.`)
  f.teto.push(p.maxPorDia == null ? 'Sem limite por dia (entra só na sobra do dia).' : `No máximo ${p.maxPorDia} meta(s) por dia.`)
  f.teto.push(p.maxPorSemana == null ? 'Sem limite por semana.' : `No máximo ${p.maxPorSemana} meta(s) por semana.`)
  f.avanca.push(p.aPartirDaSemana > 0 ? `Só começa a partir da semana ${p.aPartirDaSemana} do plano.` : 'Pode começar desde a 1ª semana.')
  f.recua.push(p.dias.length ? `Só nos dias: ${p.dias.map((d) => DIA_PT[d] ?? d).join(', ')}.` : 'Todos os dias da semana.', p.faixas.length ? `Só nas faixas de carga: ${p.faixas.join(', ')}.` : 'Todas as faixas de carga.')
  f.chefao = undefined
  f.restricoes = ['Vale ao gerar/regenerar o plano; planos já gerados só mudam quando regenerados (metas passadas/feitas nunca se movem).']
  return f
}
export function fichaDoTipo(slug: SlugMeta, regras: RegrasMotor): FichaTipo {
  const R = regras, t = TIPOS_META[slug]
  const prio = `Prioridade no reagendamento: ${R.prioridades.porTipo[slug] ?? R.prioridades.outros} (menor = primeiro).`
  const f: FichaTipo = { avanca: [], recua: [], teto: [], editavel: [`prioridades.porTipo.${slug}`] }
  const teto = R.faixas.map((x) => `${x.maxMin == null ? 'acima' : `até ${h(x.maxMin)}`}: ${x.tetoPdf}`).join(' · ')
  if (t.familia === 'pf') {
    f.teto.push(`${R.limitesDia.pdfNovosBase} PDFull novo por dia (${R.limitesDia.pdfNovosAposConclusao} na faixa 3 após concluir um); até ${R.limitesDia.pdfDistintos} distintos por dia.`, `Teto semanal de novos por carga — ${teto}.`)
    f.avanca.push(`Uma leitura pode ser dividida em até ${R.divisao.maxDatas} datas; só inicia trecho com sobra de ${R.divisao.sobraMinAvancarMin} min na reta final.`, `Reta final após a semana ${R.retaFinal.semanaMinima}: restando ≤ ${R.retaFinal.limiarTetos} tetos (≤ ${R.retaFinal.limiarTetosApos} depois da semana ${R.retaFinal.semanaCorteLimiar}).`)
    f.recua.push(`Dias de PDFull: segunda até o dia ${R.rotina.diasPdfAteDow} (exclusivo).`, `Releitura quando o acerto na semana especial fica abaixo de ${R.desempenho.especialPdfAbaixo}%.`)
    f.editavel.push('faixas.*.tetoPdf', 'limitesDia.pdf*', 'divisao.*', 'retaFinal.*')
  } else if (t.familia === 'fl') {
    f.teto.push(`Até ${R.limitesDia.revisoes} PDFlashes por dia.`)
    f.avanca.push(`Antecipável na revisão em ciclo: mínimo ${R.revisao.antecipaMinSemanas.fl} semana(s) após a leitura.`)
    f.recua.push(`Retorna ${t.deslocamentoPadraoSem ?? '—'} semana(s) após o PDFull (padrão; ajustável em Metas & inteligência).`, `Diagnóstico: acerto de ${R.desempenho.historicoFlashMin}% a ${R.desempenho.historicoOkMin - 1}% vira PDFlash.`, `Semana especial: acerto até ${R.desempenho.especialFlashAte}% vira PDFlash.`)
    f.editavel.push('limitesDia.revisoes', 'revisao.*', 'desempenho.*')
  } else if (t.familia === 'qu') {
    f.teto.push(`Até ${R.limitesDia.questoes} questões por dia.`)
    f.avanca.push(`Antecipável na revisão em ciclo: mínimo ${R.revisao.antecipaMinSemanas.qu} semana(s) após a leitura.`)
    f.recua.push(`Retorna ${t.deslocamentoPadraoSem ?? '—'} semana(s) após o PDFull (padrão; ajustável em Metas & inteligência).`, `Dias de revisão/questões: ${R.rotina.diasRevisao.join(', ')} (0 = segunda).`)
    f.editavel.push('limitesDia.questoes', 'revisao.antecipaMinSemanas', 'rotina.diasRevisao')
  } else if (t.familia === 'lp') {
    f.teto.push(`Até ${R.legproc.metasDiaMax} metas por dia no 2º bloco (${R.legproc.metasDiaBase} no 1º); ${R.legproc.mesmaLei} da mesma lei; ${R.legproc.leisDistintas} leis distintas no reagendamento.`)
    f.editavel.push('legproc.*')
  } else {
    f.teto.push(`Reservada na semana com carga ≥ ${h(R.juris.minSemanalMin)}${R.juris.exigeOptIn ? ', se o aluno marcou Jurisprudência' : ''}.`)
    f.avanca.push(`Dias preferidos: ${R.juris.diasPreferidos.join(', ')} (0 = segunda).`)
    f.recua.push(`Semana de revisão perde ${R.juris.reservaCapacidadeRevisaoMin} min de capacidade quando marcada.`)
    f.editavel.push('juris.*')
  }
  if (t.familia === 'fl') {
    const rv = R.revisao
    const ciclo = R.faixas.filter((x) => x.revisaoModo === 'ciclo'), desemp = R.faixas.filter((x) => x.revisaoModo === 'desempenho')
    const nomes = (l: typeof R.faixas) => l.map((x) => x.nome).join(', ')
    f.chefao = [
      ciclo.length ? `Modo ciclo (faixas ${nomes(ciclo)}): semana de revisão obrigatória a cada ${rv.cicloSemanas} semanas (ou o valor da faixa), com os PDFlashes e questões pendentes.` : 'Modo ciclo desligado: a revisão é só por desempenho.',
      desemp.length ? `Modo desempenho (faixas ${nomes(desemp)}): semana especial a cada ${rv.padrao} semanas (opções oferecidas: ${rv.opcoesNovas.join(', ')}).` : 'Modo desempenho desligado: a revisão é sempre em ciclo.',
      `Acerto abaixo de ${R.desempenho.especialPdfAbaixo}% volta como PDFull; até ${R.desempenho.especialFlashAte}%, como PDFlash.`,
    ]
    f.editavel.push('revisao.*')
  }
  const fam = t.familia
  const rs = R.restricoes.filter((x) => x.tipoA === fam || x.tipoB === fam).map((x) => `${x.ativa ? '' : '(desligada) '}${x.rotulo || descreverRestricao(x)}`)
  if (rs.length) f.restricoes = rs
  f.editavel.push('restricoes')
  f.teto.push(prio)
  return f
}
