import 'server-only'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import { DEFAULT_TEXTOS, nomeDoSlug } from '@/lib/conteudo/previa-compute'

// ── CONDIÇÃO com SEPARADOR `|` (modelo escolhido): `{<pct> | <faixa> | <texto-ou-var>}` → mostra a 3ª parte
// só quando o % satisfaz a condição. 3 partes separadas por `|` (estrutura clara, não texto solto):
//   1) a variável de % (ex.: ls_pct)  2) a faixa/condição  3) o que mostrar.
// Faixa: `LO-HI` (entre) ou operador `>=N` `>N` `<=N` `<N` `=N`.
// A 3ª parte: se for um IDENTIFICADOR puro (ex.: ls_texto_alto) → é uma VARIÁVEL de texto (editada na aba,
//   NÃO fica no .docx → nunca quebra, mesmo longo); senão → texto literal.
// Ex.: `{ls_pct | 80-100 | ls_texto_alto}`  ·  `{jur_pct | >=50 | jur_texto_medio}`.
// Compat: a forma antiga `{<pct>=LO-HI texto}` (texto inline) continua funcionando.
// As tags NORMAIS passam pelo parser PADRÃO (replicado inline; o docxtemplater anda no scopeList sozinho).
const RE_COND = /^([A-Za-z0-9_]+?_pct)\s*=\s*(\d{1,3})\s*-\s*(\d{1,3})\s+([\s\S]+)$/
function lerNumero(key: string, scope: any, context: any): number {
  const list: any[] = (context && context.scopeList) || [scope]
  let raw: any
  for (let i = list.length - 1; i >= 0; i--) { const s = list[i]; if (s != null && s[key] != null) { raw = s[key]; break } }
  const v = parseInt(String(raw ?? '').replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(v) ? v : 0
}
function resolveVar(name: string, scope: any, context: any): any {
  const list: any[] = (context && context.scopeList) || [scope]
  for (let i = list.length - 1; i >= 0; i--) { const s = list[i]; if (s != null && Object.prototype.hasOwnProperty.call(s, name)) return s[name] }
  return undefined
}
function avaliarCond(cond: string, v: number): boolean {
  // Word escapa < e > como &lt;/&gt; no XML — normaliza antes de interpretar os operadores.
  const c = cond.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&').trim()
  const r = /^=?\s*(\d{1,3})\s*-\s*(\d{1,3})$/.exec(c)
  if (r) { const lo = Math.min(+r[1], +r[2]), hi = Math.max(+r[1], +r[2]); return v >= lo && v <= hi }
  const o = /^(>=|<=|>|<|=)\s*(\d{1,3})$/.exec(c)
  if (o) { const n = +o[2]; return o[1] === '>=' ? v >= n : o[1] === '<=' ? v <= n : o[1] === '>' ? v > n : o[1] === '<' ? v < n : v === n }
  return false
}
// ── FÓRMULA SE()/IF() aninhada, estilo Excel (modelo escolhido): lê a variável de %/nota e mapeia o texto.
// Ex.: {SE(ls_pct>=80; "Excelente…"; SE(ls_pct>=50; "Intermediário…"; "Abaixo de 50%"))}
//      {SE(ls_pct>=80; ls_texto_alto; SE(ls_pct>=50; ls_texto_medio; ls_texto_baixo))}  ← texto em variável (robusto)
// Condições: >= > <= < = <> ou faixa LO-HI. Valor verdadeiro/falso: outro SE(), uma VARIÁVEL ou texto "entre aspas".
function dividirArgs(s: string): string[] {
  const out: string[] = []; let depth = 0, cur = '', q = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) { cur += ch; if (ch === q) q = ''; continue }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue }
    if (ch === '“') { q = '”'; cur += ch; continue }
    if (ch === '«') { q = '»'; cur += ch; continue }
    if (ch === '(') { depth++; cur += ch }
    else if (ch === ')') { depth--; cur += ch }
    else if ((ch === ';' || ch === ',') && depth === 0) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim())
}
function condVerdadeira(cond: string, scope: any, context: any): boolean {
  const c = cond.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&').trim()
  const op = /^([A-Za-z0-9_]+?_pct)\s*(>=|<=|<>|=|>|<)\s*(\d{1,3})$/.exec(c)
  if (op) { const v = lerNumero(op[1], scope, context), n = +op[3]; return op[2] === '>=' ? v >= n : op[2] === '<=' ? v <= n : op[2] === '>' ? v > n : op[2] === '<' ? v < n : op[2] === '<>' ? v !== n : v === n }
  const rg = /^([A-Za-z0-9_]+?_pct)\s*=?\s*(\d{1,3})\s*-\s*(\d{1,3})$/.exec(c)
  if (rg) { const v = lerNumero(rg[1], scope, context), lo = Math.min(+rg[2], +rg[3]), hi = Math.max(+rg[2], +rg[3]); return v >= lo && v <= hi }
  return false
}
function avaliarValor(expr: string, scope: any, context: any): string {
  const e = expr.trim()
  const se = /^=?\s*(SE|IF)\s*\(([\s\S]*)\)$/i.exec(e)
  if (se) return avaliarSE(se[2], scope, context)
  if (/^["'“«][\s\S]*["'”»]$/.test(e)) return e.replace(/^["'“«]|["'”»]$/g, '')
  if (/^[A-Za-z0-9_]+$/.test(e)) { const v = resolveVar(e, scope, context); return v == null ? '' : String(v) }
  return e
}
function avaliarSE(args: string, scope: any, context: any): string {
  const p = dividirArgs(args)
  if (p.length < 2) return ''
  return condVerdadeira(p[0], scope, context) ? avaliarValor(p[1], scope, context) : avaliarValor(p.length >= 3 ? p[2] : '""', scope, context)
}
// ── FORMATO PRINCIPAL (sem "SE", só as chaves): {<cond>; <valor>; <cond>; <valor>; … ; <padrão>} — lido de
// cima pra baixo; a 1ª condição verdadeira define o texto; o último item SOLTO (ímpar) é o padrão (senão vazio).
// Ex.: {ls_pct>=80; ls_texto_alto; ls_pct>=50; ls_texto_medio; ls_texto_baixo}
//      {ls_pct>=80; "Excelente…"; ls_pct>=50; "Intermediário…"; "Abaixo de 50%"}
function ehCondicao(s: string): boolean {
  const c = s.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').trim()
  return /^[A-Za-z0-9_]+?_pct\s*(>=|<=|<>|=|>|<)\s*\d{1,3}$/.test(c) || /^[A-Za-z0-9_]+?_pct\s*=?\s*\d{1,3}\s*-\s*\d{1,3}$/.test(c)
}
function avaliarLista(parts: string[], scope: any, context: any): string {
  let i = 0
  for (; i + 1 < parts.length; i += 2) if (condVerdadeira(parts[i], scope, context)) return avaliarValor(parts[i + 1], scope, context)
  return i < parts.length ? avaliarValor(parts[i], scope, context) : '' // sobra ímpar = padrão
}
function parserPrevia(tag: string): { get: (scope: any, context?: any) => unknown } {
  const t = String(tag), tt = t.trim()
  // 0) FORMATO PRINCIPAL (só chaves, sem "SE"): {<cond>; <valor>; … ; <padrão>}. Detecta pelo ';' no topo com
  //    a 1ª parte sendo uma condição de %.
  if (tt.includes(';')) {
    const parts = dividirArgs(tt)
    if (parts.length >= 2 && ehCondicao(parts[0])) return { get(scope: any, context: any) { return avaliarLista(parts, scope, context) } }
  }
  // 0b) Compat: fórmula SE()/IF() aninhada (estilo Excel).
  const mSE = /^=?\s*(SE|IF)\s*\(([\s\S]*)\)$/i.exec(tt)
  if (mSE) return { get(scope: any, context: any) { return avaliarSE(mSE[2], scope, context) } }
  // 1) CONDIÇÃO com | : estrutura {<pct><faixa> | <texto-ou-var>} (faixa COLADA ao pct) E a de
  //    3 partes {<pct> | <faixa> | <texto-ou-var>}. Ex.: {ls_pct=80-100 | texto: ls_texto_alto}.
  if (tt.includes('|')) {
    const parts = tt.split('|').map((s) => s.trim())
    let key = '', cond = '', alvoRaw = ''
    if (parts.length >= 3) { key = parts[0]; cond = parts[1]; alvoRaw = parts.slice(2).join('|').trim() }
    else if (parts.length === 2) { const mc = /^([A-Za-z0-9_]+?_pct)\s*([\s\S]*)$/.exec(parts[0]); if (mc) { key = mc[1]; cond = mc[2].trim(); alvoRaw = parts[1] } }
    if (/_pct$/.test(key) && cond) {
      // texto: rótulo opcional "texto:"/"text:" + VARIÁVEL (identificador) OU texto literal.
      const alvo = alvoRaw.replace(/^(texto|text)\s*:\s*/i, '').trim()
      const ehVar = /^[A-Za-z0-9_]+$/.test(alvo)
      return {
        get(scope: any, context: any) {
          if (!avaliarCond(cond, lerNumero(key, scope, context))) return ''
          if (ehVar) { const v = resolveVar(alvo, scope, context); return v == null ? '' : v }
          return alvo.replace(/^[“”"'«»\s]+|[“”"'«»\s]+$/g, '')
        },
      }
    }
  }
  // 2) Back-compat: {pct=LO-HI texto} (texto inline, 1 parágrafo)
  const m = RE_COND.exec(tt)
  if (m) {
    const key = m[1], lo = Math.min(+m[2], +m[3]), hi = Math.max(+m[2], +m[3])
    const txt = m[4].trim().replace(/^[“”"'«»\s]+|[“”"'«»\s]+$/g, '')
    return { get(scope: any, context: any) { const v = lerNumero(key, scope, context); return v >= lo && v <= hi ? txt : '' } }
  }
  // 3) Parser PADRÃO do docxtemplater (doc-utils.js): só olha o escopo dado; undefined faz o doc subir no scopeList.
  return {
    get(scope: any) {
      if (t === '.') return scope
      if (scope && Object.prototype.hasOwnProperty.call(scope, t)) return scope[t]
      return undefined
    },
  }
}

// nullGetter INTELIGENTE: garante que NENHUM bloco/variável do contrato apareça vazio no PDF, mesmo que a
// variável não tenha sido gerada (slug não presente no simulado, erro de digitação, pilar sem questões).
// Qualquer `{<slug>_pct|_acertos|_total|_faixa|_nivel|_texto|_f1|_f2|_f3}` cai num PADRÃO coerente em vez de
// branco; variáveis fora do padrão mantêm o comportamento antigo (vazio). Faixa: _f1 verdadeiro por padrão
// (0% → 0-49) e _f2/_f3 falsos → a faixa 0-49 aparece (nunca some o parágrafo).
function valorPadraoVar(tag: string): unknown {
  if (/_f1$/.test(tag)) return true
  if (/_f2$/.test(tag) || /_f3$/.test(tag)) return false
  if (/_pct$/.test(tag)) return '0%'
  if (/_(acertos|total)$/.test(tag)) return '0'
  if (/_faixa$/.test(tag)) return '0-49'
  if (/_nivel$/.test(tag)) return 'crítico'
  const mb = /_texto_f([123])$/.exec(tag)
  if (mb) { const banda = (`f${mb[1]}`) as 'f1' | 'f2' | 'f3'; return DEFAULT_TEXTOS[banda].replace(/\{nome\}/g, nomeDoSlug(tag.replace(/_texto_f[123]$/, ''))).replace(/\{pct\}/g, '0%') }
  const mn = /_texto_(baixo|medio|alto)$/.exec(tag)
  if (mn) { const banda = (mn[1] === 'baixo' ? 'f1' : mn[1] === 'medio' ? 'f2' : 'f3') as 'f1' | 'f2' | 'f3'; return DEFAULT_TEXTOS[banda].replace(/\{nome\}/g, nomeDoSlug(tag.replace(/_texto_(baixo|medio|alto)$/, ''))).replace(/\{pct\}/g, '0%') }
  if (/_texto$/.test(tag)) return DEFAULT_TEXTOS.f1.replace(/\{nome\}/g, nomeDoSlug(tag.replace(/_texto$/, ''))).replace(/\{pct\}/g, '0%')
  return '' // demais variáveis/laços desconhecidos → vazio/oculto (comportamento antigo)
}

// Merge NÃO-DESTRUTIVO de um .docx template com dados (docxtemplater) + auto-correção de marcadores de
// laço órfãos (mesma lógica da prévia do Teste — extraída para reusar na Biblioteca sem duplicar).
// É PURO (recebe os bytes do docx). Nunca toca no arquivo original.

function removerMarcadoresOrfaos(xml: string): { xml: string; removidos: number } {
  const nomes = new Set<string>()
  for (const m of xml.matchAll(/\{#([a-zA-Z0-9_]+)\}/g)) nomes.add(m[1])
  for (const m of xml.matchAll(/\{\/([a-zA-Z0-9_]+)\}/g)) nomes.add(m[1])
  // ops: trechos a REMOVER (text:'') e trechos a INSERIR (start===end). Aplicados do fim p/ o início.
  const ops: { start: number; end: number; text: string }[] = []
  // Fecha um `{#nome}` órfão no 1º limite estrutural após ele (fim da célula/linha/corpo) → o conteúdo volta
  // a ser CONDICIONAL (em vez de aparecer sempre). Parágrafo só-marcador é consumido pelo paragraphLoop.
  const fecharNoLimite = (nome: string, apos: number) => {
    const cands = ['</w:tc>', '</w:tr>', '</w:body>'].map((t) => xml.indexOf(t, apos)).filter((i) => i >= 0)
    if (!cands.length) { ops.push({ start: apos, end: apos, text: '' }); return false } // sem limite → não dá p/ fechar
    const pos = Math.min(...cands)
    ops.push({ start: pos, end: pos, text: `<w:p><w:r><w:t xml:space="preserve">{/${nome}}</w:t></w:r></w:p>` })
    return true
  }
  let orfaos = 0
  for (const nome of nomes) {
    const re = new RegExp(`\\{(#|/)${nome}\\}`, 'g')
    const ocorr: { start: number; end: number; abre: boolean }[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(xml))) ocorr.push({ start: m.index, end: m.index + m[0].length, abre: m[1] === '#' })
    let aberto: { start: number; end: number } | null = null
    for (const o of ocorr) {
      // Novo `{#}` com um anterior ainda aberto = DUPLICATA → remove o anterior (abertura duplicada).
      if (o.abre) { if (aberto) { ops.push({ start: aberto.start, end: aberto.end, text: '' }); orfaos++ }; aberto = { start: o.start, end: o.end } }
      // `{/}` sem abertura = fechamento órfão → remove.
      else { if (!aberto) { ops.push({ start: o.start, end: o.end, text: '' }); orfaos++ } else aberto = null }
    }
    // Abertura órfã final (sem fechamento) → FECHA no limite da célula (não remove) p/ preservar a condição.
    if (aberto) { orfaos++; fecharNoLimite(nome, aberto.end) }
  }
  if (!orfaos) return { xml, removidos: 0 }
  ops.sort((a, b) => b.start - a.start)
  let out = xml
  for (const op of ops) out = out.slice(0, op.start) + op.text + out.slice(op.end)
  return { xml: out, removidos: orfaos }
}

function lacosDesbalanceados(xml: string): { nome: string; abre: number; fecha: number }[] {
  const nomes = new Set<string>()
  for (const m of xml.matchAll(/\{#([a-zA-Z0-9_]+)\}/g)) nomes.add(m[1])
  for (const m of xml.matchAll(/\{\/([a-zA-Z0-9_]+)\}/g)) nomes.add(m[1])
  const out: { nome: string; abre: number; fecha: number }[] = []
  for (const nome of nomes) {
    const abre = (xml.match(new RegExp(`\\{#${nome}\\}`, 'g')) || []).length
    const fecha = (xml.match(new RegExp(`\\{/${nome}\\}`, 'g')) || []).length
    if (abre !== fecha) out.push({ nome, abre, fecha })
  }
  return out
}

async function docxAviso(linhas: { texto: string; forte?: boolean }[]): Promise<Buffer> {
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Prévia indisponível')] }),
    ...linhas.map((l) => new Paragraph({ children: [new TextRun({ text: l.texto, bold: l.forte })] })),
  ] }] })
  return Packer.toBuffer(doc)
}

/** Renderiza a prévia: auto-corrige laços órfãos, faz o merge com `dados` e devolve o .docx preenchido
 *  (ou um .docx de AVISO legível quando o template tem marcadores quebrados). */
export async function renderPreviaDocx(buf: Buffer, dados: Record<string, unknown>): Promise<Buffer> {
  try {
    const zip = new PizZip(buf)
    try {
      const f = zip.file('word/document.xml')
      if (f) { const { xml, removidos } = removerMarcadoresOrfaos(f.asText()); if (removidos) zip.file('word/document.xml', xml) }
    } catch { /* segue; o catch externo trata */ }
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, parser: parserPrevia, nullGetter: (part: any) => valorPadraoVar(String(part?.value ?? '')) })
    doc.render(dados)
    return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  } catch (e) {
    try {
      let xml = ''
      try { xml = new PizZip(buf).file('word/document.xml')?.asText() || '' } catch { /* ignore */ }
      const desb = xml ? lacosDesbalanceados(xml) : []
      const linhas: { texto: string; forte?: boolean }[] = [
        { texto: 'O documento tem um problema nos marcadores de laço e não pôde ser preenchido.' }, { texto: '' },
      ]
      if (desb.length) {
        linhas.push({ texto: 'Marcadores desbalanceados (abre ≠ fecha):', forte: true })
        for (const d of desb) linhas.push({ texto: `• {#${d.nome}} aparece ${d.abre}x  e  {/${d.nome}} aparece ${d.fecha}x` })
        linhas.push({ texto: '' }, { texto: 'Causa provável: o bloco foi inserido mais de uma vez, deixando um {#...} sem o {/...}.' }, { texto: 'Como resolver: deixe apenas UM de cada bloco e salve de novo.' })
      } else {
        linhas.push({ texto: `Detalhe técnico: ${(e as Error).message}` }, { texto: 'Verifique se não há uma chave { } aberta ou um laço {#...} sem fechar.' })
      }
      return await docxAviso(linhas)
    } catch { return buf }
  }
}
