// Cronograma Adaptativo (admin Plataforma Revisão) — esquema PURO das regras (sem server-only; usado no server e no client).
// Porte fiel de CR_SCHEMA / CR_ARR do protótipo. Os valores iniciais (`d`) são os do Cronograma Adaptativo 2.0.
// `p` = Proposta (regra nova, desligada por padrão) · `c` = Confirmar (valor a conferir no código do 2.0).

export type CampoTipo = 'num' | 'bool' | 'sel' | 'txt'
export interface CampoRegra {
  k: string
  l: string
  t: CampoTipo
  u?: string
  d: number | boolean | string
  min?: number
  max?: number
  step?: number
  p?: boolean
  c?: boolean
  h?: string
  o?: Array<[string, string]>
}
export interface SecaoRegra { id: string; title: string; desc: string; arr?: boolean; fields: CampoRegra[] }
export interface ArranjoRegra { n: string; txt: string; f: CampoRegra[] }

export const CR_SCHEMA: SecaoRegra[] = [
  { id: 'inicio', title: 'Início do aluno e ritmo de leitura', desc: 'Teste de leitura do primeiro acesso e o ritmo usado para converter páginas em horas.', fields: [
    { k: 'ritmoPadrao', l: 'Ritmo padrão (quem pula o teste)', t: 'num', u: 'páginas/hora', d: 17, min: 1 },
    { k: 'ritmoMin', l: 'Ritmo mínimo aceito', t: 'num', u: 'páginas/hora', d: 5, min: 1 },
    { k: 'ritmoMax', l: 'Ritmo máximo aceito', t: 'num', u: 'páginas/hora', d: 60, min: 1 },
    { k: 'testePaginas', l: 'Páginas do teste de leitura', t: 'num', u: 'páginas', d: 2, min: 1 },
    { k: 'testeQuestoes', l: 'Questões de compreensão do teste', t: 'num', u: 'questões', d: 2, min: 0 },
    { k: 'penalidadeErro', l: 'Tempo acrescido por erro no teste', t: 'num', u: 'segundos', d: 90, min: 0 },
    { k: 'usarExperiencia', l: 'Ajustar o plano pelo tempo de estudo para Procuradorias', t: 'bool', d: false, p: true, h: 'Hoje a resposta só fica no perfil. Ligado, aplica o multiplicador abaixo ao ritmo de quem está começando.' },
    { k: 'multIniciante', l: 'Multiplicador do ritmo para iniciantes', t: 'num', u: '×', d: 0.85, step: 0.05, min: 0.1, p: true },
  ] },
  { id: 'tempos', title: 'Tempos por atividade', desc: 'Quanto tempo cada tipo de meta ocupa no dia do aluno.', fields: [
    { k: 'blocoArred', l: 'Arredondamento do PDFull', t: 'num', u: 'min (para cima)', d: 30, min: 5, step: 5 },
    { k: 'tPdflash', l: 'PDFlash', t: 'num', u: 'min', d: 60, min: 5, step: 5 },
    { k: 'tPdfight', l: 'PDFight', t: 'num', u: 'min', d: 60, min: 5, step: 5, c: true, h: 'O PDFight não aparece na análise do 2.0. Defina quanto tempo ele ocupa.' },
    { k: 'tQuestoes', l: 'Questões', t: 'num', u: 'min', d: 30, min: 5, step: 5 },
    { k: 'tLegproc', l: 'LegProc (por bloco)', t: 'num', u: 'min', d: 45, min: 5, step: 5 },
    { k: 'tempoPorPagina', l: 'Calcular PDFlash e PDFight pelas páginas', t: 'bool', d: false, p: true, h: 'Usa as páginas cadastradas e o ritmo do aluno em vez do tempo fixo.' },
    { k: 'simuladosNoPlano', l: 'Incluir simulados disponíveis como metas', t: 'bool', d: false, p: true, h: 'Usa a duração cadastrada de cada simulado.' },
    { k: 'dividirPdf', l: 'Dividir PDFull que não cabe no dia', t: 'bool', d: true },
    { k: 'refUltimaParte', l: 'Revisões contam a partir da última parte do PDF', t: 'bool', d: true },
    { k: 'limiteSemanas', l: 'Limite do planejamento', t: 'num', u: 'semanas', d: 200, min: 1 },
  ] },
  { id: 'revisoes', title: 'Revisões normais', desc: 'Sequência PDFull → PDFlash → Questões, contada em semanas de conteúdo.', fields: [
    { k: 'offPdflash', l: 'PDFlash depois do PDFull', t: 'num', u: 'semanas de conteúdo', d: 1, min: 0 },
    { k: 'offPdfight', l: 'PDFight depois do PDFull', t: 'num', u: 'semanas de conteúdo', d: 1, min: 0, c: true },
    { k: 'offQuestoes', l: 'Questões depois do PDFull', t: 'num', u: 'semanas de conteúdo', d: 2, min: 0 },
    { k: 'pularEspeciais', l: 'Pular semanas especiais na contagem', t: 'bool', d: true },
    { k: 'anteciparFinal', l: 'Antecipar revisões e questões na reta final', t: 'bool', d: true },
    { k: 'permitirMover', l: 'Mover a atividade de dia ou semana quando faltar espaço', t: 'bool', d: true },
  ] },
  { id: 'arranjos', title: 'Arranjos de estudo', desc: 'Preferência inicial de distribuição escolhida pelo aluno, e as regras que valem para todos os arranjos.', arr: true, fields: [
    { k: 'arranjoPadrao', l: 'Arranjo sugerido no cadastro', t: 'sel', d: 'equilibrado', o: [['prioriza', 'Priorizar PDFulls'], ['equilibrado', 'Equilibrado'], ['constancia', 'Constância']], c: true },
    { k: 'preencherSobras', l: 'Preencher sobras de tempo', t: 'bool', d: true, h: 'Encaixa pendências, adianta LegProc e acrescenta PDFs inteiros ou em partes.' },
    { k: 'protegerRevisao', l: 'Não colocar leitura nova em dia reservado à revisão', t: 'bool', d: false, p: true, h: 'Hoje a sobra de tempo pode levar PDF novo para o dia de revisão.' },
    { k: 'maxPdfsDia', l: 'Máximo de PDFulls novos por dia', t: 'num', u: '0 = sem limite', d: 0, min: 0, p: true },
  ] },
  { id: 'especial', title: 'Semana especial de revisão', desc: 'Semana sem aula nova, com temas anteriores escolhidos pelo desempenho do aluno.', fields: [
    { k: 'freqEspecial', l: 'Frequência sugerida', t: 'num', u: 'a cada N semanas', d: 4, min: 2, c: true },
    { k: 'tEspPdflash', l: 'PDFlash ou flashcards por tema', t: 'num', u: 'min', d: 60, min: 5, step: 5 },
    { k: 'tEspQuestoes', l: 'Questões por tema', t: 'num', u: 'min', d: 30, min: 5, step: 5 },
    { k: 'limiarAcerto', l: 'Acerto abaixo do qual o tema é priorizado', t: 'num', u: '%', d: 60, min: 0, max: 100 },
    { k: 'pesoDificuldade', l: 'Peso da dificuldade do tema (0 a 10)', t: 'num', u: 'peso', d: 1, step: 0.1, min: 0, c: true },
    { k: 'pesoAcerto', l: 'Peso do acerto baixo', t: 'num', u: 'peso', d: 1, step: 0.1, min: 0, c: true },
    { k: 'pesoAntiguidade', l: 'Peso da antiguidade do estudo', t: 'num', u: 'peso', d: 1, step: 0.1, min: 0, c: true },
    { k: 'penalRepeticao', l: 'Redução para tema já revisado em semana especial', t: 'num', u: 'peso', d: 1, step: 0.1, min: 0, c: true },
    { k: 'usarEstrelas', l: 'Usar as estrelas das questões (1 a 5) no ranking', t: 'bool', d: false, p: true },
    { k: 'congelarSemana', l: 'Congelar a seleção quando a semana começa', t: 'bool', d: true },
    { k: 'exigirConclusao', l: 'Só considerar estudado o PDF concluído', t: 'bool', d: false, p: true, h: 'Hoje basta a data planejada ter passado, e um conteúdo atrasado pode ir para revisão.' },
  ] },
  { id: 'adaptacao', title: 'Adaptação ao ritmo real', desc: 'Regras que usam o que o aluno registra para ajustar o plano.', fields: [
    { k: 'recalibrarRitmo', l: 'Recalibrar o ritmo pelo cronômetro', t: 'bool', d: false, p: true, h: 'Usa o tempo real das leituras concluídas para atualizar as páginas por hora.' },
    { k: 'janelaRitmo', l: 'Leituras consideradas na recalibração', t: 'num', u: 'últimas leituras', d: 5, min: 1, p: true },
    { k: 'usarPontoParada', l: 'Recalcular a meta pelo ponto de parada', t: 'bool', d: false, p: true, h: '“Parei na página 30” passa a reduzir o tempo restante da meta.' },
    { k: 'recalcFuturas', l: 'Recalcular atrasos reconstrói também as metas futuras', t: 'bool', d: true },
    { k: 'pausaRedistribui', l: 'Retomar pausa redistribui pela capacidade do dia', t: 'bool', d: false, p: true, h: 'Hoje a retomada só desloca os dias pendentes.' },
  ] },
  { id: 'painel', title: 'Desempenho e exportação', desc: 'Indicadores do aluno e a exportação do calendário.', fields: [
    { k: 'janelaPrevisao', l: 'Janela da previsão de término', t: 'num', u: 'semanas', d: 2, min: 1 },
    { k: 'previsaoHoras', l: 'Prever término por horas, não por quantidade de metas', t: 'bool', d: false, p: true },
    { k: 'exportEspeciais', l: 'Incluir semanas especiais no Word exportado', t: 'bool', d: false, p: true },
  ] },
]

export const CR_ARR: ArranjoRegra[] = [
  { n: 'Priorizar PDFulls', txt: 'Leitura nos dias com tempo suficiente; depois LegProc, PDFlash e questões. Dias menores recebem principalmente questões.', f: [
    { k: 'priMinHoras', l: 'Mínimo do dia para receber leitura', t: 'num', u: 'horas', d: 2, min: 0, step: 0.5 },
  ] },
  { n: 'Equilibrado', txt: 'Reserva um dia da semana para revisão e questões.', f: [
    { k: 'eqMinDias', l: 'Dias de estudo mínimos para reservar', t: 'num', u: 'dias', d: 3, min: 1, max: 7 },
    { k: 'eqDia', l: 'Dia reservado', t: 'sel', d: 'ultimo', o: [['ultimo', 'Último dia de estudo'], ['penultimo', 'Penúltimo dia de estudo']] },
  ] },
  { n: 'Constância', txt: 'Concentra as revisões em dias fixos conforme quantos dias o aluno estuda.', f: [
    { k: 'coLimiar', l: 'A partir de quantos dias usa dois dias de revisão', t: 'num', u: 'dias', d: 6, min: 2, max: 7 },
    { k: 'coDias', l: 'Dias de revisão nesse caso', t: 'txt', d: '5º e 6º' },
    { k: 'coMinDias', l: 'Mínimo de dias para reservar o último', t: 'num', u: 'dias', d: 3, min: 1, max: 7 },
  ] },
]

export const CR_ALLF: CampoRegra[] = [...CR_SCHEMA.flatMap((s) => s.fields), ...CR_ARR.flatMap((a) => a.f)]

export type ValoresRegras = Record<string, number | boolean | string>

export const crDef = (): ValoresRegras => {
  const v: ValoresRegras = {}
  for (const f of CR_ALLF) v[f.k] = f.d
  return v
}

/** Normaliza valores vindos do banco/JSON importado: só chaves conhecidas, com tipo e limites válidos; o resto vira padrão 2.0. */
export function crNormalizar(raw: unknown): ValoresRegras {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = crDef()
  for (const f of CR_ALLF) {
    const x = r[f.k]
    if (x === undefined || x === null) continue
    if (f.t === 'bool') { if (typeof x === 'boolean') out[f.k] = x }
    else if (f.t === 'num') {
      const n = Number(x)
      if (Number.isFinite(n)) out[f.k] = Math.min(f.max ?? 1e6, Math.max(f.min ?? 0, n))
    } else if (f.t === 'sel') { if (f.o?.some((o) => o[0] === x)) out[f.k] = String(x) }
    else if (typeof x === 'string') out[f.k] = x.slice(0, 60)
  }
  return out
}

export const crMudou = (v: ValoresRegras, f: CampoRegra): boolean => JSON.stringify(v[f.k]) !== JSON.stringify(f.d)
export const crAlteradas = (v: ValoresRegras): CampoRegra[] => CR_ALLF.filter((f) => crMudou(v, f))

export const crFmt = (f: CampoRegra, v: unknown): string =>
  f.t === 'bool' ? (v ? 'ligado' : 'desligado') : f.t === 'sel' ? ((f.o?.find((o) => o[0] === v) ?? [, String(v)])[1] as string) : `${v}${f.u ? ' ' + f.u : ''}`

/** Minutos de PDFull: páginas ÷ ritmo (pág/h), arredondado PARA CIMA ao bloco (min). */
export const crMin = (pag: number, ritmo: number, bloco: number): number => {
  const b = bloco > 0 ? bloco : 30
  return pag > 0 && ritmo > 0 ? Math.ceil(((pag / ritmo) * 60) / b) * b : 0
}
export const crHm = (m: number): string => {
  const h = Math.floor(m / 60), r = Math.round(m % 60)
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`
}

/** Regra do protótipo → parâmetro equivalente do motor atual (ParamsAdaptativo). Só informativo: mostra "Motor atual". */
export const CR_MOTOR: Record<string, { param: string; escala?: number }> = {
  ritmoPadrao: { param: 'velPadrao' },
  tPdflash: { param: 'durFl' },
  tQuestoes: { param: 'durQu' },
  tLegproc: { param: 'durLp' },
  offPdflash: { param: 'offsetRevisao' },
  offQuestoes: { param: 'offsetQuestoes' },
  tEspPdflash: { param: 'durRf' },
  tEspQuestoes: { param: 'durRq' },
  limiarAcerto: { param: 'acertoMin' },
  limiteSemanas: { param: 'maxSemanas' },
  priMinHoras: { param: 'diaCurtoMin', escala: 1 / 60 },
}

/** Campos liga/desliga por disciplina (aba Disciplinas). */
export type CampoDisc = 'pdflash' | 'pdfight' | 'pdfull' | 'juris' | 'legproc' | 'ativa'
export const CAMPOS_DISC: CampoDisc[] = ['pdflash', 'pdfight', 'pdfull', 'juris', 'legproc', 'ativa']

/** Tipos de material que o admin pode bloquear no gerador (chave do motor → rótulo e efeito). */
export const CR_TIPOS_MATERIAL: Array<{ chave: string; rotulo: string; descricao: string }> = [
  { chave: 'pf', rotulo: 'PDFull', descricao: 'Leitura das aulas (PDFull). Bloqueado: o aluno não recebe PDFull e, sem leitura, também não nascem as revisões e questões ligadas a ela.' },
  { chave: 'fl', rotulo: 'PDFlash (revisão)', descricao: 'Revisão em PDFlash depois do PDFull e a revisão PDFlash da semana especial.' },
  { chave: 'qu', rotulo: 'Questões', descricao: 'Metas de questões depois do PDFull e as questões da semana especial.' },
  { chave: 'lp', rotulo: 'LegProc', descricao: 'Metas de lei seca (LegProc).' },
  { chave: 'jp', rotulo: 'Jurisprudência', descricao: 'Meta semanal de Jurisprudência.' },
]
