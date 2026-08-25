/**
 * Verificação do motor do cronograma contra os casos da especificação.
 * Roda sem banco — o motor é puro. `npx tsx scripts/verificar-cronograma.ts`
 */
import { addDias, dow, offsetDesdeSegunda, proximaSegunda } from '../apps/web/lib/cronograma/datas'
import { compactarSemanas, gerarGrade, montarPauta } from '../apps/web/lib/cronograma/gerador'
import { faixaSemanal } from '../apps/web/lib/cronograma/faixa'
import { duracaoEmMinutos, fmtFaixa, somarDuracoes } from '../apps/web/lib/cronograma/duracao'
import { chaveAula, somarAula } from '../apps/web/lib/cronograma/aula'
import { rotuloConteudo } from '../apps/web/lib/cronograma/formato-meta'
import type { CronogramaFonte, MapaTipos, MetaFonte, TipoMeta, TipoMetaDef } from '../apps/web/lib/cronograma/tipos'

/**
 * Os seis tipos com o comportamento que o cadastro semeia — as regras R10–R21 em forma
 * tabular. O motor não conhece mais slug nenhum: lê estas flags.
 */
const def = (
  slug: string, nome: string, ordem: number,
  f: Partial<TipoMetaDef> = {},
): TipoMetaDef => ({
  id: slug, slug, nome, rotulo_docx: nome.toUpperCase(), ordem, cor: null,
  mostra_links: false, prefixo_aula: true, aula_no_titulo: false,
  quebra_conteudo: false, conta_atividade: true, destaque_docx: false, sempre_no_docx: true,
  ...f,
})

const TIPOS: MapaTipos = new Map([
  ['pdfull',   def('pdfull',   'PDFULL + Videoaula',    0, { destaque_docx: true })],
  ['flash',    def('flash',    'PDFlash / Flashcards',  1)],
  ['legproc',  def('legproc',  'Legproc',               2, { prefixo_aula: false, quebra_conteudo: true })],
  ['quest',    def('quest',    'Resolução de Questões', 3, { mostra_links: true, prefixo_aula: false, aula_no_titulo: true })],
  ['simulado', def('simulado', 'Simulado',              4, { conta_atividade: false, sempre_no_docx: false })],
  ['juris',    def('juris',    'Atividade Extra',       5, { conta_atividade: false, sempre_no_docx: false })],
].map(([k, v]) => [k as string, v as TipoMetaDef]))

let passou = 0
let falhou = 0
function ok(nome: string, cond: boolean, detalhe = '') {
  if (cond) { passou++; console.log(`  OK   ${nome}`) }
  else { falhou++; console.log(`  FALHA ${nome} ${detalhe}`) }
}
function eq(nome: string, a: unknown, b: unknown) {
  ok(nome, JSON.stringify(a) === JSON.stringify(b), `\n        esperado ${JSON.stringify(b)}\n        obtido   ${JSON.stringify(a)}`)
}

// ---------- Fixture: cronograma de 34 semanas, revisões na 12 e 24 (caso da spec R5) ----------
const meta = (semana: number, dia: number, tipo: TipoMeta, extra: Partial<MetaFonte> = {}): MetaFonte => ({
  id: `${semana}-${dia}-${tipo}`, semana, dia, tipo,
  disciplina: 'Direito Constitucional', aula: '01', conteudo: 'Princípios fundamentais',
  duracao: '3 - 4h', ordem: 0, simulado_id: null, simulado_externo_nome: null, simulado_externo_url: null,
  ...extra,
})

const cron34: CronogramaFonte = {
  id: 'c1', slug: '9-materias-4h', nome: '9 Matérias Essenciais (4 horas)',
  total_semanas: 34, dias_curso: [1, 2, 3, 4, 5, 6], dias_nome: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  semanas_revisao: [12, 24], carga_horaria: 4,
}
// 34 semanas; as 12 e 24 sem metas (são revisão original)
const metas34: MetaFonte[] = []
for (let s = 1; s <= 34; s++) {
  if (s === 12 || s === 24) continue
  metas34.push(meta(s, 0, 'pdfull'), meta(s, 1, 'quest'))
}

console.log('\n=== R1 — todo cronograma começa numa segunda ===')
eq('quarta 2026-09-23 → segunda seguinte', proximaSegunda('2026-09-23'), '2026-09-28')
eq('segunda continua a mesma (não empurra)', proximaSegunda('2026-09-28'), '2026-09-28')
eq('domingo → segunda do dia seguinte', proximaSegunda('2026-09-27'), '2026-09-28')
ok('nunca anda para trás', proximaSegunda('2026-09-23') > '2026-09-23')

console.log('\n=== R3 — dia é ÍNDICE em dias_curso, domingo é o ÚLTIMO ===')
eq('offset da segunda (1)', offsetDesdeSegunda(1), 0)
eq('offset do sábado (6)', offsetDesdeSegunda(6), 5)
eq('offset do domingo (0) = 6, último dia', offsetDesdeSegunda(0), 6)
const cronDom: CronogramaFonte = { ...cron34, dias_curso: [1, 2, 3, 4, 5, 6, 0], dias_nome: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], semanas_revisao: [] }
const gDom = gerarGrade(cronDom, [meta(1, 6, 'pdfull')], TIPOS, new Map(), { inicio: '2026-09-28', revisao: { ativo: false, cada: 12 }, recesso: { modo: 'nenhum' } })
if (gDom.ok && gDom.grade.semanas[0].kind === 'conteudo') {
  const m0 = gDom.grade.semanas[0].metas[0]
  eq('meta com dia=6 cai no domingo 04/10', m0.data, '2026-10-04')
  eq('  e o rótulo do dia é Dom', m0.diaNome, 'Dom')
  eq('  e 04/10/2026 é mesmo domingo', dow(m0.data), 0)
}

console.log('\n=== R5 — descarta revisões originais e renumera sem buracos ===')
const { blocos } = compactarSemanas(metas34, cron34.semanas_revisao)
eq('34 semanas com revisão em 12 e 24 → 32 blocos', blocos.length, 32)
const conflito = compactarSemanas([...metas34, meta(12, 0, 'pdfull')], cron34.semanas_revisao)
eq('semana de revisão COM metas continua descartada', conflito.blocos.length, 32)
ok('  e gera aviso para a equipe', conflito.avisos.length === 1 && conflito.avisos[0].includes('12'))

console.log('\n=== R6 — revisão periódica a cada K semanas de conteúdo ===')
const pauta = montarPauta(blocos, { ativo: true, cada: 12 })
const posRev = pauta.map((s, i) => (s.kind === 'revisao' ? i : -1)).filter((i) => i >= 0)
eq('32 blocos com K=12 → 2 revisões inseridas', posRev.length, 2)
eq('  entram DEPOIS do 12º e do 24º bloco', posRev, [12, 25])
eq('sem revisão pedida → nenhuma inserida', montarPauta(blocos, { ativo: false, cada: 12 }).filter((s) => s.kind === 'revisao').length, 0)
// Fidelidade ao legado: quando o total de blocos é MÚLTIPLO de K, o cronograma termina
// numa semana de revisão. 32 não é múltiplo de 12, por isso este caso usa 24 blocos.
const pauta24 = montarPauta(blocos.slice(0, 24), { ativo: true, cada: 12 })
eq('24 blocos com K=12 → 2 revisões', pauta24.filter((s) => s.kind === 'revisao').length, 2)
ok('  a ÚLTIMA posição da pauta é revisão (legado)', pauta24[pauta24.length - 1].kind === 'revisao')

console.log('\n=== R7/R8 — recesso empurra o conteúdo e adia a conclusão ===')
const base = { inicio: '2026-11-30', revisao: { ativo: false, cada: 12 as const } }
const semRecesso = gerarGrade(cron34, metas34, TIPOS, new Map(), { ...base, recesso: { modo: 'nenhum' } })
const comNatal = gerarGrade(cron34, metas34, TIPOS, new Map(), { ...base, recesso: { modo: 'natal' } })
if (semRecesso.ok && comNatal.ok) {
  eq('sem recesso: 32 semanas', semRecesso.grade.resumo.totalSemanas, 32)
  eq('com Natal: 33 semanas (1 de recesso inserida)', comNatal.grade.resumo.totalSemanas, 33)
  eq('  conteúdo permanece 32', comNatal.grade.resumo.semanasConteudo, 32)
  eq('  recesso contabilizado', comNatal.grade.resumo.semanasRecesso, 1)
  ok('  conclusão ADIADA em 7 dias', comNatal.grade.resumo.conclusao === addDias(semRecesso.grade.resumo.conclusao, 7),
     `\n        sem=${semRecesso.grade.resumo.conclusao} com=${comNatal.grade.resumo.conclusao}`)
  const rec = comNatal.grade.semanas.find((s) => s.kind === 'recesso')
  ok('  a semana de recesso contém 25/12', !!rec && rec.inicio <= '2026-12-25' && rec.fim >= '2026-12-25', `\n        ${rec?.inicio}..${rec?.fim}`)
  ok('  numeração é sequencial e sem buracos', comNatal.grade.semanas.every((s, i) => s.numero === i + 1))
}
const semDatas = gerarGrade(cron34, metas34, TIPOS, new Map(), { ...base, recesso: { modo: 'outras' } })
ok('recesso "outras" sem as 2 datas → não bloqueia nada', semDatas.ok && semDatas.grade.resumo.semanasRecesso === 0)

console.log('\n=== R16/R17 — os números do topo ===')
const cronCont: CronogramaFonte = { ...cron34, semanas_revisao: [] }
const metasCont = [meta(1, 0, 'pdfull'), meta(1, 1, 'quest'), meta(1, 2, 'simulado'), meta(1, 3, 'juris')]
const gCont = gerarGrade(cronCont, metasCont, TIPOS, new Map(), { inicio: '2026-09-28', revisao: { ativo: false, cada: 12 }, recesso: { modo: 'nenhum' } })
if (gCont.ok) {
  eq('atividades ignora simulado e juris (4 metas → 2)', gCont.grade.resumo.atividades, 2)
  eq('dias por semana = tamanho de dias_nome', gCont.grade.resumo.diasPorSemana, 6)
}

console.log('\n=== R10 — ordem dentro do dia: pdfull → flash → legproc → quest ===')
const gOrd = gerarGrade(cronCont, [meta(1, 0, 'quest'), meta(1, 0, 'pdfull'), meta(1, 0, 'legproc'), meta(1, 0, 'flash')], TIPOS, new Map(),
  { inicio: '2026-09-28', revisao: { ativo: false, cada: 12 }, recesso: { modo: 'nenhum' } })
if (gOrd.ok && gOrd.grade.semanas[0].kind === 'conteudo') {
  eq('ordem fixa aplicada', gOrd.grade.semanas[0].metas.map((m) => m.tipo), ['pdfull', 'flash', 'legproc', 'quest'])
}

console.log('\n=== R19 — faixa semanal lida de dias_curso, não do nome ===')
eq('[1..5] → Segunda - Sexta', faixaSemanal([1, 2, 3, 4, 5]), 'Segunda - Sexta')
eq('[1..6] → Segunda - Sábado', faixaSemanal([1, 2, 3, 4, 5, 6]), 'Segunda - Sábado')
eq('[1..6,0] → Semana Completa', faixaSemanal([1, 2, 3, 4, 5, 6, 0]), 'Semana Completa')

console.log('\n=== R12/R13/R15 — formatação do conteúdo ===')
eq('R15 quest com aula → "Disciplina: Aula N"', rotuloConteudo(meta(1, 0, 'quest'), TIPOS.get('quest')!).titulo, 'Direito Constitucional: Aula 01')
eq('R12 pdfull ganha prefixo "Aula NN -"', rotuloConteudo(meta(1, 0, 'pdfull'), TIPOS.get('pdfull')!).titulo, 'Direito Constitucional: Aula 01 - Princípios fundamentais')
eq('R12 zero à esquerda em 1 dígito', rotuloConteudo(meta(1, 0, 'pdfull', { aula: '7' }), TIPOS.get('pdfull')!).titulo, 'Direito Constitucional: Aula 07 - Princípios fundamentais')
eq('R13 "Atividade" não vira prefixo', rotuloConteudo(meta(1, 0, 'pdfull', { disciplina: 'Atividade', aula: null }), TIPOS.get('pdfull')!).titulo, 'Princípios fundamentais')

console.log('\n=== Guardas ===')
const gVazio = gerarGrade(cron34, [], TIPOS, new Map(), { inicio: '2026-09-28', revisao: { ativo: false, cada: 12 }, recesso: { modo: 'nenhum' } })
ok('cronograma sem metas devolve erro (não lança)', !gVazio.ok)
const gLoop = gerarGrade(cron34, metas34, TIPOS, new Map(), { inicio: '2026-09-28', revisao: { ativo: false, cada: 12 }, recesso: { modo: 'outras', de: '2026-01-01', ate: '2046-01-01' } })
ok('recesso absurdo é barrado pelo teto (não trava)', !gLoop.ok && gLoop.erro.includes('recesso'))

console.log('=== Duração — os 13 formatos que existem nas 16.697 metas reais ===')
/* Levantados direto do banco. A coluna é texto livre e vem da planilha da equipe: qualquer
   um destes que deixe de ser lido faz o calendário parar de somar as horas do dia. */
const DURACOES: [string | null, string | null][] = [
  ['30 min - 1h', '30min – 1h'],
  ['1:30', '1h30'],
  ['3 - 4h', '3h – 4h'],
  ['40 min - 1:30h', '40min – 1h30'],
  ['1h', '1h'],
  ['30m', '30min'],
  ['30 min', '30min'],
  ['3h', '3h'],
  ['30min - 1h', '30min – 1h'],
  ['2h - 3h', '2h – 3h'],
  ['1:30h - 2h', '1h30 – 2h'],
  ['2h', '2h'],
  [null, null],
]
for (const [entrada, esperado] of DURACOES) {
  const f = duracaoEmMinutos(entrada)
  eq(`duração ${JSON.stringify(entrada)}`, f ? fmtFaixa(f) : null, esperado)
}
eq('soma de um dia (3-4h + 30min-1h)', fmtFaixa(somarDuracoes(['3 - 4h', '30 min - 1h'])!), '3h30 – 5h')
ok('texto irreconhecível NÃO vira total parcial', somarDuracoes(['1h', 'até acabar']) === null)
eq('meta sem duração não impede a soma', fmtFaixa(somarDuracoes(['1h', null, '30m'])!), '1h30')

console.log('=== Aula — repetir semana preserva o formato (R11) ===')
/* "01" e "1" são aulas DIFERENTES para o banco, e o link casa por texto exato. Somar errado
   ao repetir uma semana quebraria o link de todas as semanas geradas, em silêncio. */
eq('01 + 1 mantém o zero', somarAula('01', 1), '02')
eq('09 + 1 cede a largura', somarAula('09', 1), '10')
eq('1 + 1 continua sem zero', somarAula('1', 1), '2')
eq('9 + 1', somarAula('9', 1), '10')
eq('01 + 0 não mexe', somarAula('01', 0), '01')
eq('007 + 1', somarAula('007', 1), '008')
eq('1.1 não é incrementável', somarAula('1.1', 1), '1.1')
eq('nulo continua nulo', somarAula(null, 1), null)
eq('não desce abaixo de zero', somarAula('01', -5), '01')
eq('chave junta 01 e 1', chaveAula('01'), chaveAula('1'))
eq('chave preserva 1.1', chaveAula('1.1'), '1.1')
eq('chave de vazio', chaveAula(null), '')

console.log(`\n${'='.repeat(50)}\nPASSOU: ${passou}   FALHOU: ${falhou}\n${'='.repeat(50)}`)
process.exit(falhou ? 1 : 0)
