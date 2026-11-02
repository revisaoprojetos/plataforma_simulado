// Lê relatorio-capas.txt (gerado pelo apply) + o template HTML e injeta os dados → relatorio-capas.html.
import { readFileSync, writeFileSync } from 'node:fs'
const S = 'C:\\Users\\joooa\\AppData\\Local\\Temp\\claude\\c--Users-joooa-Downloads-Plataforma-Simulado\\526b571b-6115-41c1-9720-26c054780cda\\scratchpad\\'
const txt = readFileSync(S + 'relatorio-capas.txt', 'utf8').split(/\r?\n/)
const data = { ts: '', resumo: {}, pastas: [], flutuante: [] }
let pasta = null, disc = null, modo = 'main'
for (const ln of txt) {
  let m
  if ((m = ln.match(/corte de capas.*?(\d{4}-\d\d-\d\dT[\d:.]+Z)/i))) data.ts = m[1].slice(0, 16).replace('T', ' ')
  else if ((m = ln.match(/^Total processado:\s*(\d+).*?cortados:\s*(\d+)\s+já-sem-capa:\s*(\d+)\s+pulados:\s*(\d+)\s+erros:\s*(\d+)/))) data.resumo = { total: +m[1], cortados: +m[2], jaok: +m[3], pulados: +m[4], erros: +m[5] }
  else if ((m = ln.match(/^■ PASTA:\s*(.+?)\s*\((\d+) docs\)/))) { pasta = { nome: m[1], total: +m[2], disciplinas: [] }; data.pastas.push(pasta); disc = null; modo = 'main' }
  else if (/^■ LEGENDA FLUTUANTE/.test(ln)) modo = 'flut'
  else if (/^■ ERROS/.test(ln)) modo = 'erros'
  else if (modo === 'main' && (m = ln.match(/^\s*▸\s*(.+?)\s*—\s*\d+ cortado/))) { disc = { nome: m[1], docs: [] }; pasta.disciplinas.push(disc) }
  else if (modo === 'main' && disc && (m = ln.match(/^\s*-\s*(.+?)\s*→\s*(.+)$/))) {
    const titulo = m[1].trim(), tag = m[2].trim()
    let status = 'pulado', motivo = null, rem = null, mm
    if ((mm = tag.match(/^cortado \[(\w+)\u2691?\]\s*-?(\d+)?/))) { status = 'cortado'; motivo = mm[1]; rem = mm[2] ? +mm[2] : 0 }
    else if (/cortado \[(\w+)/.test(tag)) { mm = tag.match(/cortado \[(\w+)/); status = 'cortado'; motivo = mm[1]; rem = (tag.match(/-(\d+)/) || [])[1] ? +tag.match(/-(\d+)/)[1] : 0 }
    else if (/já-sem-capa/.test(tag)) status = 'ja_ok'
    else if (/PULADO/.test(tag)) status = 'pulado'
    else if (/ERRO/.test(tag)) status = 'erro'
    disc.docs.push({ titulo, status, motivo, rem })
  } else if (modo === 'flut' && (m = ln.match(/^\s*-\s*(.+)$/))) data.flutuante.push(m[1].trim())
}
const tpl = readFileSync(S + 'relatorio-template.html', 'utf8')
const out = tpl.replace('window.DATA={};', 'window.DATA=' + JSON.stringify(data) + ';')
writeFileSync(S + 'relatorio-capas.html', out, 'utf8')
const nd = data.pastas.reduce((a, p) => a + p.disciplinas.reduce((b, d) => b + d.docs.length, 0), 0)
console.log(`OK → relatorio-capas.html | pastas=${data.pastas.length} docs=${nd} flutuante=${data.flutuante.length} resumo=${JSON.stringify(data.resumo)}`)
