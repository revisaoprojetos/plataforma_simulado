/**
 * Verifica a leitura das PLANILHAS de importação contra os arquivos reais em
 * docs/cronograma. Não toca no banco.
 *
 *   pnpm --filter api exec tsx ../../scripts/verificar-planilhas.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// exceljs vive em apps/web (é dependência do app, não do root do monorepo).
import ExcelJS from '../apps/web/node_modules/exceljs'
import { abasXlsxParaListas, lerCsv, planilhaAchatadaParaListas, type AbasXlsx } from '../apps/web/lib/cronograma/importar-planilha'
import { montarPrevia, validarCronogramas, validarLinks, validarMetas } from '../apps/web/lib/cronograma/importar'
import { chaveLink } from '../apps/web/lib/cronograma/formato-meta'

// Ancorado ao próprio script: `pnpm --filter` roda a partir do diretório do pacote,
// então caminho relativo ao cwd não serve.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = path.join(RAIZ, 'docs', 'cronograma')
const TIPOS = new Set(['pdfull', 'flash', 'legproc', 'quest', 'simulado', 'juris'])

let passou = 0
let falhou = 0
const ok = (nome: string, cond: boolean, detalhe = '') => {
  if (cond) { passou++; console.log(`  OK   ${nome}`) }
  else { falhou++; console.log(`  FALHA ${nome} ${detalhe}`) }
}
const eq = (nome: string, a: unknown, b: unknown) =>
  ok(nome, JSON.stringify(a) === JSON.stringify(b), `\n        esperado ${JSON.stringify(b)}\n        obtido   ${JSON.stringify(a)}`)

async function lerXlsx(arq: string): Promise<AbasXlsx> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path.join(BASE, arq))
  const abas: AbasXlsx = {}
  for (const ws of wb.worksheets) {
    const cabecalho = ((ws.getRow(1).values as unknown[]) ?? []).slice(1).map((c) => String(c ?? '').trim())
    const linhas: Record<string, unknown>[] = []
    for (let i = 2; i <= ws.rowCount; i++) {
      const valores = ((ws.getRow(i).values as unknown[]) ?? []).slice(1)
      const linha: Record<string, unknown> = {}
      cabecalho.forEach((c, j) => { if (c) linha[c] = valores[j] })
      if (Object.values(linha).some((v) => v !== null && v !== undefined && String(v).trim())) linhas.push(linha)
    }
    abas[ws.name] = linhas
  }
  return abas
}

;(async () => {
  console.log('\n=== XLSX (cronogramas.xlsx) ===')
  const abas = await lerXlsx('cronogramas.xlsx')
  console.log(`  abas: ${Object.keys(abas).join(', ')}`)
  const x = abasXlsxParaListas(abas)
  eq('24 cronogramas', x.cronogramas.length, 24)
  eq('16.697 metas', x.metas.length, 16697)
  eq('405 links', x.links.length, 405)
  ok('avisa sobre os links órfãos', x.avisos.some((a) => /órf/i.test(a)), `\n        avisos: ${JSON.stringify(x.avisos)}`)

  const vcX = validarCronogramas(x.cronogramas)
  const mapaX = new Map(vcX.itens.map((c) => [c.slug, { total_semanas: c.total_semanas, dias_curso: c.dias_curso }]))
  const vmX = validarMetas(x.metas, mapaX, TIPOS)
  const vlX = validarLinks(x.links)
  eq('  cronogramas validam sem erro', vcX.erros.length, 0)
  if (vcX.erros.length) vcX.erros.slice(0, 3).forEach((e) => console.log(`        ${e.campo}: ${e.problema}`))
  eq('  metas validam sem erro', vmX.erros.length, 0)
  if (vmX.erros.length) vmX.erros.slice(0, 3).forEach((e) => console.log(`        linha ${e.linha} · ${e.campo}: ${e.problema}`))
  eq('  links validam sem erro', vlX.erros.length, 0)
  if (vlX.erros.length) vlX.erros.slice(0, 3).forEach((e) => console.log(`        linha ${e.linha} · ${e.campo}: ${e.problema}`))

  ok('  aula preservada como TEXTO', vmX.itens.every((m) => m.aula === null || typeof m.aula === 'string'))
  const grafias = [...new Set(vmX.itens.map((m) => m.aula).filter(Boolean))]
  ok('  "01" e "1" coexistem', grafias.includes('01') && grafias.includes('1'))
  ok('  semanas_revisao chegam do XLSX', vcX.itens.some((c) => c.semanas_revisao.length > 0),
     `\n        ex.: ${JSON.stringify(vcX.itens[0]?.semanas_revisao)}`)
  ok('  categoria chega do XLSX', vcX.itens.some((c) => !!c.categoria),
     `\n        ex.: ${JSON.stringify(vcX.itens.slice(0, 3).map((c) => c.categoria))}`)

  const qc = vlX.itens.filter((l) => l.urls.qc).length
  const tec = vlX.itens.filter((l) => l.urls.tec).length
  console.log(`       QC: ${qc} · TEC: ${tec}`)
  eq('  QC bate com a spec §2 (281)', qc, 281)
  eq('  TEC bate com a spec §2 (399)', tec, 399)

  console.log('\n=== CSV achatado (atividades-achatado.csv) ===')
  const { cabecalho, linhas } = lerCsv(fs.readFileSync(path.join(BASE, 'atividades-achatado.csv'), 'utf8'))
  console.log(`  colunas: ${cabecalho.length} · linhas: ${linhas.length.toLocaleString('pt-BR')}`)
  const c = planilhaAchatadaParaListas(cabecalho, linhas)
  eq('24 cronogramas consolidados por slug', c.cronogramas.length, 24)
  eq('16.696 metas', c.metas.length, linhas.length)
  ok('links extraídos das colunas embutidas', c.links.length > 0, `\n        obtidos: ${c.links.length}`)
  ok('avisa o que o CSV não carrega', c.avisos.some((a) => /revis/i.test(a)))

  const vcC = validarCronogramas(c.cronogramas)
  const mapaC = new Map(vcC.itens.map((k) => [k.slug, { total_semanas: k.total_semanas, dias_curso: k.dias_curso }]))
  const vmC = validarMetas(c.metas, mapaC, TIPOS)
  eq('  cronogramas validam sem erro', vcC.erros.length, 0)
  if (vcC.erros.length) vcC.erros.slice(0, 3).forEach((e) => console.log(`        linha ${e.linha} · ${e.campo}: ${e.problema}`))
  eq('  metas validam sem erro', vmC.erros.length, 0)
  if (vmC.erros.length) vmC.erros.slice(0, 3).forEach((e) => console.log(`        linha ${e.linha} · ${e.campo}: ${e.problema}`))
  ok('  aspas do CSV preservam "01"', vmC.itens.some((m) => m.aula === '01'))
  ok('  dias_nome reconstruídos e alinhados com dias_curso',
     vcC.itens.every((k) => k.dias_nome.length === k.dias_curso.length),
     `\n        ex.: ${JSON.stringify(vcC.itens[0]?.dias_nome)} vs ${JSON.stringify(vcC.itens[0]?.dias_curso)}`)
  ok('  conteúdo com vírgula não quebra colunas',
     vmC.itens.some((m) => (m.conteudo ?? '').includes(',')),
     '\n        (nenhum conteúdo com vírgula encontrado — parser não exercitado)')

  console.log('\n=== OS DOIS FORMATOS DÃO O MESMO RESULTADO? ===')
  eq('mesmo número de cronogramas', vcC.itens.length, vcX.itens.length)
  ok('mesmos slugs', JSON.stringify(vcC.itens.map((k) => k.slug).sort()) === JSON.stringify(vcX.itens.map((k) => k.slug).sort()))

  console.log('\n=== PRÉVIA (carga inicial, catálogo vazio) ===')
  const p = montarPrevia(vcX.itens, vmX.itens, vlX.itens, { cronogramas: [], linksChaves: new Set() }, [])
  eq('24 novos', p.cronogramas.filter((k) => k.situacao === 'novo').length, 24)
  eq('16.697 metas entram', p.totalMetas, 16697)
  eq('405 links novos', p.linksNovos, 405)

  console.log('\n=== REIMPORTAR É REPETÍVEL (spec §9.4) ===')
  const atual = {
    cronogramas: vcX.itens.map((k) => ({ slug: k.slug, nome: k.nome, status: 'liberado', metas: vmX.itens.filter((m) => m.cronograma_slug === k.slug).length })),
    linksChaves: new Set(vlX.itens.map((l) => chaveLink(l.disciplina, l.aula) as string)),
  }
  const p2 = montarPrevia(vcX.itens, vmX.itens, vlX.itens, atual, [])
  eq('nenhum novo', p2.cronogramas.filter((k) => k.situacao === 'novo').length, 0)
  eq('todos "igual"', p2.cronogramas.filter((k) => k.situacao === 'igual').length, 24)
  eq('nenhum link novo', p2.linksNovos, 0)

  console.log(`\n${'='.repeat(52)}\nPASSOU: ${passou}   FALHOU: ${falhou}\n${'='.repeat(52)}`)
  process.exit(falhou ? 1 : 0)
})()
