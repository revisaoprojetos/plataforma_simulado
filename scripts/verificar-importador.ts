/**
 * Verifica o importador contra os JSONs REAIS do gerador legado.
 * Não toca no banco. `pnpm --filter api exec tsx ../../scripts/verificar-importador.ts`
 */
import fs from 'node:fs'
import path from 'node:path'
import { montarPrevia, validarCronogramas, validarLinks, validarMetas } from '../apps/web/lib/cronograma/importar'
import { chaveLink } from '../apps/web/lib/cronograma/formato-meta'

const BASE = path.resolve('C:/Users/jvict/.claude/www/revisao/cronograma/seed/dados')

let passou = 0
let falhou = 0
const ok = (nome: string, cond: boolean, detalhe = '') => {
  if (cond) { passou++; console.log(`  OK   ${nome}`) }
  else { falhou++; console.log(`  FALHA ${nome} ${detalhe}`) }
}
const eq = (nome: string, a: unknown, b: unknown) =>
  ok(nome, JSON.stringify(a) === JSON.stringify(b), `\n        esperado ${JSON.stringify(b)}\n        obtido   ${JSON.stringify(a)}`)

const ler = (arq: string) => JSON.parse(fs.readFileSync(path.join(BASE, arq), 'utf8'))

console.log('\n=== ARQUIVOS REAIS DO GERADOR LEGADO ===')
const brutoCron = ler('cronogramas.json')
const brutoMetas = ler('atividades.json')
const brutoLinks = ler('aulas-links.json')
console.log(`  cronogramas.json: ${brutoCron.length}`)
console.log(`  atividades.json : ${brutoMetas.length}`)
console.log(`  aulas-links.json: ${brutoLinks.length}`)

console.log('\n=== VALIDAÇÃO DOS CRONOGRAMAS ===')
const vc = validarCronogramas(brutoCron)
eq('24 cronogramas aceitos', vc.itens.length, 24)
eq('nenhum erro', vc.erros.length, 0)
if (vc.erros.length) vc.erros.slice(0, 5).forEach((e) => console.log(`        linha ${e.linha} · ${e.campo}: ${e.problema}`))
ok('carga horária lida do campo, não do nome', vc.itens.every((c) => c.carga_horaria > 0))
ok('dias_curso e dias_nome sempre do mesmo tamanho', vc.itens.every((c) => c.dias_curso.length === c.dias_nome.length))

console.log('\n=== VALIDAÇÃO DAS METAS (contra os cronogramas) ===')
const mapa = new Map(vc.itens.map((c) => [c.slug, { total_semanas: c.total_semanas, dias_curso: c.dias_curso }]))
const TIPOS_CADASTRADOS = new Set(['pdfull', 'flash', 'legproc', 'quest', 'simulado', 'juris'])
const vm = validarMetas(brutoMetas, mapa, TIPOS_CADASTRADOS)
eq('16.697 metas aceitas', vm.itens.length, 16697)
eq('nenhum erro', vm.erros.length, 0)
if (vm.erros.length) vm.erros.slice(0, 8).forEach((e) => console.log(`        linha ${e.linha} · ${e.campo}: ${e.problema}`))
ok('aula preservada como texto', vm.itens.every((m) => m.aula === null || typeof m.aula === 'string'))
const grafias = [...new Set(vm.itens.map((m) => m.aula).filter(Boolean))]
ok(`"01" e "1" coexistem como aulas distintas`, grafias.includes('01') && grafias.includes('1'),
   `\n        exemplos: ${grafias.slice(0, 6).map((g) => JSON.stringify(g)).join(' ')}`)
const tipos = [...new Set(vm.itens.map((m) => m.tipo))].sort()
console.log(`       tipos presentes: ${tipos.join(', ')}`)
ok('tipo `simulado` não aparece nos dados (armadilha da spec §7)', !tipos.includes('simulado'))

console.log('\n=== VALIDAÇÃO DOS LINKS ===')
const vl = validarLinks(brutoLinks)
eq('405 links aceitos', vl.itens.length, 405)
eq('nenhum erro', vl.erros.length, 0)
if (vl.erros.length) vl.erros.slice(0, 5).forEach((e) => console.log(`        linha ${e.linha} · ${e.campo}: ${e.problema}`))
const comQc = vl.itens.filter((l) => l.urls.qc).length
const comTec = vl.itens.filter((l) => l.urls.tec).length
console.log(`       url_qc  -> plataforma "qc" : ${comQc}`)
console.log(`       url_tec -> plataforma "tec": ${comTec}`)
ok('colunas fixas do legado viram links por plataforma', comQc > 0 && comTec > 0)
eq('  QC bate com a spec §2 (281 preenchidos)', comQc, 281)
eq('  TEC bate com a spec §2 (399 preenchidos)', comTec, 399)
const formatoNovo = validarLinks([{ disciplina: 'X', aula: '01', urls: { gran: 'https://gran.exemplo/1' } }])
ok('formato novo (urls por slug) também é aceito', formatoNovo.itens[0]?.urls.gran === 'https://gran.exemplo/1')

console.log('\n=== REJEIÇÃO DE PLANILHA COM AULA NUMÉRICA (o risco nº 1) ===')
const comNumero = [{ ...brutoMetas[0], aula: 1 }]
const vn = validarMetas(comNumero, mapa, TIPOS_CADASTRADOS)
ok('meta com aula numérica é REJEITADA, não coagida', vn.itens.length === 0 && vn.erros.length === 1)
ok('  e a mensagem explica o porquê', /texto/i.test(vn.erros[0]?.problema ?? ''), `\n        "${vn.erros[0]?.problema}"`)

console.log('\n=== OUTRAS REJEIÇÕES ===')
const cronTeste = new Map([['x', { total_semanas: 10, dias_curso: [1, 2, 3, 4, 5] }]])
const base = { cronograma_slug: 'x', semana: 1, dia: 0, tipo: 'pdfull', disciplina: 'D', aula: '01', ordem: 0 }
ok('semana fora do intervalo', validarMetas([{ ...base, semana: 11 }], cronTeste, TIPOS_CADASTRADOS).erros.length === 1)
ok('dia fora de dias_curso (5 dias → índice 5 inválido)', validarMetas([{ ...base, dia: 5 }], cronTeste, TIPOS_CADASTRADOS).erros.length === 1)
ok('tipo não cadastrado', validarMetas([{ ...base, tipo: 'xpto' }], cronTeste, TIPOS_CADASTRADOS).erros.length === 1)
ok('disciplina vazia', validarMetas([{ ...base, disciplina: '  ' }], cronTeste, TIPOS_CADASTRADOS).erros.length === 1)
const desconhecido = validarMetas([{ ...base, cronograma_slug: 'nao-existe' }], cronTeste, TIPOS_CADASTRADOS)
ok('cronograma inexistente vira UM erro agrupado', desconhecido.erros.length === 1 && /não existe/.test(desconhecido.erros[0].problema))

console.log('\n=== PRÉVIA (catálogo vazio — a carga inicial) ===')
const p1 = montarPrevia(vc.itens, vm.itens, vl.itens, { cronogramas: [], linksChaves: new Set() }, [])
eq('24 cronogramas, todos novos', p1.cronogramas.filter((c) => c.situacao === 'novo').length, 24)
eq('16.697 metas entram', p1.totalMetas, 16697)
eq('405 links, todos novos', p1.linksNovos, 405)
eq('nenhum cronograma fica intocado', p1.naoMencionados.length, 0)

console.log('\n=== PRÉVIA (reimportação — spec §9.4: repetível) ===')
const atual = {
  cronogramas: vc.itens.map((c) => ({
    slug: c.slug,
    nome: c.nome,
    status: 'liberado',
    metas: vm.itens.filter((m) => m.cronograma_slug === c.slug).length,
  })),
  linksChaves: new Set(vl.itens.map((l) => chaveLink(l.disciplina, l.aula) as string)),
}
const p2 = montarPrevia(vc.itens, vm.itens, vl.itens, atual, [])
eq('nenhum cronograma novo', p2.cronogramas.filter((c) => c.situacao === 'novo').length, 0)
eq('todos marcados como "igual"', p2.cronogramas.filter((c) => c.situacao === 'igual').length, 24)
eq('nenhum link novo', p2.linksNovos, 0)
eq('405 links atualizados', p2.linksAtualizados, 405)
ok('reimportar não muda contagem — a operação é repetível', p2.totalMetas === p1.totalMetas)

console.log('\n=== PRÉVIA (arquivo parcial não apaga o resto — spec §9.3) ===')
const p3 = montarPrevia([vc.itens[0]], vm.itens.filter((m) => m.cronograma_slug === vc.itens[0].slug), [], atual, [])
eq('1 cronograma mencionado', p3.cronogramas.length, 1)
eq('23 ficam intocados', p3.naoMencionados.length, 23)

console.log(`\n${'='.repeat(52)}\nPASSOU: ${passou}   FALHOU: ${falhou}\n${'='.repeat(52)}`)
process.exit(falhou ? 1 : 0)
