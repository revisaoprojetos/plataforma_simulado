/**
 * cortar-capa-docx.mjs
 *
 * Corta a capa / folhas iniciais (banner de titulo, aviso de direitos autorais,
 * "Novidades desta Versao", imagem de capa, etc.) de um arquivo .docx da
 * Biblioteca, ancorando o corte no TEXTO do proprio word/document.xml (robusto
 * a layout). Mantem a partir do "inicio util" (legenda lei-seca, roteiro de
 * estudos, sumario/indice rotulado ou um TOC sem rotulo).
 *
 * Uso como modulo:
 *   import { cortarCapaBuffer, acharKeepFrom } from './cortar-capa-docx.mjs'
 *   const r = cortarCapaBuffer(buf)
 *   // r = { out:Buffer|null, keepFrom, motivo, removidos, primeiroMantidoTexto, blocosTotais }
 *
 * Uso como CLI de PROVA (NAO faz upload):
 *   node scripts/cortar-capa-docx.mjs "<parte do titulo>" ["<outra>" ...]
 *   -> para cada titulo baixa o .docx da versao atual, corta e imprime
 *      motivo / blocos totais / removidos / textos dos 6 primeiros blocos MANTIDOS.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/**
 * Extrai os elementos de nivel SUPERIOR de um fragmento XML (filhos diretos),
 * respeitando aninhamento por tag. Devolve { tag, start, end, raw }.
 */
function topLevelElements(xml) {
  const els = [];
  const n = xml.length;
  let i = 0;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) break;
    // ignora comentarios / PIs / fecho solto
    if (xml.startsWith('<!--', lt)) { const e = xml.indexOf('-->', lt); i = e === -1 ? n : e + 3; continue; }
    if (xml.startsWith('<?', lt)) { const e = xml.indexOf('?>', lt); i = e === -1 ? n : e + 2; continue; }
    const tm = /^<([a-zA-Z0-9:_.-]+)/.exec(xml.slice(lt, lt + 120));
    if (!tm) { i = lt + 1; continue; }
    const tag = tm[1];
    const gt = xml.indexOf('>', lt);
    if (gt === -1) break;
    const selfClose = xml[gt - 1] === '/';
    if (selfClose) {
      els.push({ tag, start: lt, end: gt + 1, raw: xml.slice(lt, gt + 1) });
      i = gt + 1;
      continue;
    }
    const open = `<${tag}`;
    const close = `</${tag}>`;
    let depth = 1;
    let j = gt + 1;
    while (j < n && depth > 0) {
      const nextClose = xml.indexOf(close, j);
      if (nextClose === -1) { j = n; break; }
      let nextOpen = xml.indexOf(open, j);
      // garante que e realmente abertura do MESMO elemento (char seguinte delimitador)
      while (nextOpen !== -1 && nextOpen < nextClose) {
        const after = xml[nextOpen + open.length];
        if (after === ' ' || after === '>' || after === '/' || after === '\t' || after === '\n' || after === '\r') {
          depth++;
          j = nextOpen + open.length;
          nextOpen = xml.indexOf(open, j);
        } else {
          // falso positivo (ex.: <w:p vs <w:pPr): continua procurando apos ele
          nextOpen = xml.indexOf(open, nextOpen + open.length);
        }
      }
      if (nextOpen === -1 || nextOpen >= nextClose) {
        depth--;
        j = nextClose + close.length;
      }
    }
    els.push({ tag, start: lt, end: j, raw: xml.slice(lt, j) });
    i = j;
  }
  return els;
}

/**
 * Texto concatenado dos <w:t> dentro de um fragmento (paragrafo ou tabela).
 * Converte TAB de conteudo (<w:tab/>) e quebra (<w:br/>) em espaco — igual ao
 * pipeline de trechos — para que linhas de TOC "Titulo<tab>12" virem
 * "Titulo 12" (senao a regra de TOC, que exige \s antes do n. de pagina, falha).
 * Nao casa os <w:tab w:val=.../> de definicao de tab-stop (que tem atributos).
 */
function textoDoBloco(raw) {
  let out = '';
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\b[^>]*\/?>/g;
  let m;
  while ((m = re.exec(raw)) !== null) out += (m[1] !== undefined ? m[1] : ' ');
  return decodeXml(out).replace(/\s+/g, ' ').trim();
}

/**
 * Coleta os blocos (<w:p> e <w:tbl>) do corpo em ordem de documento, DESCENDO
 * por containers de bloco (<w:sdt>/<w:sdtContent>) — onde o Word costuma
 * embrulhar o Sumario/TOC. Nao desce em <w:tbl> (tabela = 1 bloco).
 *
 * Cada bloco carrega `safeCut`: o offset (em bodyInner) onde e seguro cortar
 * mantendo o XML balanceado = inicio do elemento de TOPO (filho direto do body)
 * que o contem. Assim, cortar num bloco dentro de um <w:sdt> preserva o <w:sdt>
 * inteiro (o TOC), e cortar num <w:p> de topo preserva esse paragrafo.
 *
 * @returns {Array<{text:string, safeCut:number, tag:string}>}
 */
function coletarBlocos(bodyInner) {
  const blocks = [];
  const DESCER = new Set(['w:sdt', 'w:sdtContent']);
  function walk(fragment, baseOffset, anchor) {
    const els = topLevelElements(fragment);
    for (const el of els) {
      const absStart = baseOffset + el.start;
      if (el.tag === 'w:p' || el.tag === 'w:tbl') {
        blocks.push({ text: textoDoBloco(el.raw), safeCut: anchor != null ? anchor : absStart, tag: el.tag });
      } else if (DESCER.has(el.tag)) {
        const innerAnchor = anchor != null ? anchor : absStart;
        const openEnd = el.raw.indexOf('>') + 1;
        const closeStart = el.raw.lastIndexOf('</' + el.tag + '>');
        if (closeStart > openEnd) {
          const inner = el.raw.slice(openEnd, closeStart);
          walk(inner, absStart + openEnd, innerAnchor);
        }
      }
      // demais elementos (w:sectPr, w:bookmarkStart, w:sdtPr...) nao geram bloco
    }
  }
  walk(bodyInner, 0, null);
  return blocks;
}

// ---------------------------------------------------------------------------
// Regra do corte (ancorada no texto) — compartilhada com o dry-run
// ---------------------------------------------------------------------------

const JANELA = 40; // busca so nos primeiros ~40 blocos

const RE_LEGENDA_1 = /legenda/i;
const RE_LEGENDA_2 = /(amarelo|verde|vermelh|n[uú]cleo do dispositivo|grifo|cores?)/i;
const RE_ROTEIRO = /roteiro de estudos/i;
const RE_SUMARIO = /^\s*(sum[áa]rio|[íi]ndice|conte[úu]do program[áa]tico)\b/i;
const RE_TOC_LINHA = /\S.*\s\d{1,3}\s*$/;

/**
 * Dado o array de textos dos blocos (ordem do corpo), acha o indice do PRIMEIRO
 * bloco a MANTER, aplicando as regras NESTA ORDEM de prioridade:
 *  1) legenda (lei seca)  2) roteiro  3) sumario rotulado  4) TOC sem rotulo
 * Retorna { keepFrom, motivo }. keepFrom=-1 e motivo=null => PULAR.
 */
export function acharKeepFrom(textos, extra = false) {
  const lim = Math.min(textos.length, JANELA);

  // 1) LEGENDA
  for (let i = 0; i < lim; i++) {
    const t = textos[i];
    if (RE_LEGENDA_1.test(t) && RE_LEGENDA_2.test(t)) return { keepFrom: i, motivo: 'legenda' };
  }
  // 2) ROTEIRO DE ESTUDOS
  for (let i = 0; i < lim; i++) {
    if (RE_ROTEIRO.test(textos[i])) return { keepFrom: i, motivo: 'roteiro' };
  }
  // 3) SUMARIO / INDICE / CONTEUDO PROGRAMATICO (rotulado)
  for (let i = 0; i < lim; i++) {
    if (RE_SUMARIO.test(textos[i])) return { keepFrom: i, motivo: 'sumario' };
  }
  // 4) TOC sem rotulo: >=4 blocos consecutivos terminando em n. de pagina e len<100
  for (let i = 0; i < lim; i++) {
    let run = 0;
    let j = i;
    while (j < lim) {
      const t = textos[j];
      if (t && t.length < 100 && RE_TOC_LINHA.test(t)) { run++; j++; } else break;
    }
    if (run >= 4) return { keepFrom: i, motivo: 'toc' };
  }
  // Âncoras EXTRAS (só na revisão dos "pulados" — não afetam o lote principal):
  if (extra) {
    // 5) título de lei (lei seca SEM caixa de legenda): mantém a partir do "LEI/DECRETO-LEI nº ..."
    for (let i = 0; i < lim; i++) {
      const t = textos[i];
      if (t && t.length < 120 && /^(lei|decreto-lei|decreto|lei\s+complementar|lc)\s+n?[º°o]?\s*[\d.]/i.test(t)) return { keepFrom: i, motivo: 'lei' };
    }
    // 5b) aviso de direitos ("Prezado aluno… uso exclusivo"): mantém a partir do 1º item de índice (TOC) após o aviso
    let av = -1;
    for (let i = 0; i < lim; i++) { if (/uso exclusivo do aluno|prezado aluno, antes de iniciar/i.test(textos[i])) { av = i; break; } }
    if (av >= 0) { for (let j = av + 1; j < lim; j++) { const t = textos[j]; if (t && t.length < 100 && RE_TOC_LINHA.test(t)) return { keepFrom: j, motivo: 'aviso-toc' }; } }
  }
  return { keepFrom: -1, motivo: null };
}

// ---------------------------------------------------------------------------
// Corte sobre o buffer .docx
// ---------------------------------------------------------------------------

/**
 * @param {Buffer} buf  conteudo do .docx
 * @returns {{out:Buffer|null, keepFrom:number, motivo:string|null,
 *            removidos:number, primeiroMantidoTexto:string, blocosTotais:number,
 *            blocos?:string[]}}
 */
export function cortarCapaBuffer(buf, { debug = false, pulados = false } = {}) {
  // import dinamico para permitir uso do modulo em contexto sem pizzip (dry-run)
  const PizZip = globalThis.__PizZip;
  if (!PizZip) throw new Error('PizZip nao carregado (use via CLI ou injete globalThis.__PizZip)');

  const zip = new PizZip(buf);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('word/document.xml ausente no .docx');
  const xml = docFile.asText();

  const bodyOpen = xml.search(/<w:body(?:\s[^>]*)?>/);
  if (bodyOpen === -1) throw new Error('<w:body> ausente');
  const bodyOpenEnd = xml.indexOf('>', bodyOpen) + 1;
  const bodyCloseStart = xml.lastIndexOf('</w:body>');
  if (bodyCloseStart === -1) throw new Error('</w:body> ausente');
  const bodyInner = xml.slice(bodyOpenEnd, bodyCloseStart);

  const blocos = coletarBlocos(bodyInner);
  const textos = blocos.map((b) => b.text);

  const { keepFrom, motivo } = acharKeepFrom(textos, pulados);

  const base = {
    keepFrom,
    motivo,
    removidos: keepFrom < 0 ? 0 : keepFrom,
    primeiroMantidoTexto: keepFrom < 0 ? '' : (textos[keepFrom] || ''),
    blocosTotais: blocos.length,
  };
  if (debug) base.blocos = textos;

  if (motivo === null) return { out: null, ...base };

  // corta: remove tudo (inner do body) ANTES do elemento de topo que contem o
  // bloco a manter (safeCut) — preserva o <w:sdt> do TOC inteiro e o <w:sectPr>.
  const cutAt = blocos[keepFrom].safeCut;
  let novoInner = bodyInner.slice(cutAt);

  // TRIM só no caso 'legenda' (lei seca): a "LEGENDA" costuma estar numa tabela, e no MESMO bloco
  // de topo sobram, ANTES dela, a frase "Nesta versão…" + parágrafos vazios que enchem a 1ª página.
  // Removemos os <w:p> completos que ficam ANTES da 1ª "LEGENDA" (dentro do bloco mantido). Parágrafos
  // não aninham, então o regex não-guloso é seguro; a <w:p> da própria legenda fica intacta (ela só
  // "fecha" depois da âncora). Reinjetamos <w:p/> em células que ficariam vazias (OOXML exige ≥1 <w:p>).
  if (motivo === 'legenda') {
    const ancora = novoInner.indexOf('LEGENDA');
    if (ancora > 0) {
      // TRIM SIMPLES: remove os <w:p> leftover (frase "Nesta versão…" + vazios) ANTES da "LEGENDA".
      // Funciona na maioria (legenda inline). Nos casos monolíticos (lei inteira dentro de tabela
      // flutuante, ex. 8.429) isto pode deixar a 1ª página em branco → por isso o re-apply das flutuantes
      // RENDERIZA e só comita quando a página não fica em branco (o resto é pulado e sinalizado).
      if (/w:vertAnchor="page"/.test(novoInner.slice(0, ancora))) base.legendaFlutuante = true;
      const head = novoInner.slice(0, ancora).replace(/<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, '');
      novoInner = head + novoInner.slice(ancora);
      // célula sem <w:p> → inválida; garante um parágrafo vazio
      novoInner = novoInner
        .replace(/(<\/w:tcPr>)(\s*)(<\/w:tc>)/g, '$1<w:p/>$3')
        .replace(/(<w:tc>)(\s*)(<\/w:tc>)/g, '$1<w:p/>$3');
    }
  }

  const novoXml = xml.slice(0, bodyOpenEnd) + novoInner + xml.slice(bodyCloseStart);

  zip.file('word/document.xml', novoXml);
  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { out, ...base };
}

// ---------------------------------------------------------------------------
// CLI de prova
// ---------------------------------------------------------------------------

function carregarEnv(webDir) {
  const env = {};
  const txt = fs.readFileSync(path.join(webDir, '.env.local'), 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function main() {
  const titulos = process.argv.slice(2);
  if (titulos.length === 0) {
    console.log('uso: node scripts/cortar-capa-docx.mjs "<parte do titulo>" ...');
    process.exit(0);
  }
  const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const env = carregarEnv(WEB);

  const { createClient } = await import('@supabase/supabase-js');
  const PizZip = (await import('pizzip')).default;
  globalThis.__PizZip = PizZip;

  const svc = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const TENANT = '02195fa6-3db8-49d0-8c07-d21328a26a13';

  for (const titulo of titulos) {
    console.log('\n==================================================================');
    console.log('TITULO busca:', JSON.stringify(titulo));
    const { data: docs, error } = await svc
      .from('simulado_conteudo_documentos')
      .select('id,titulo,versao_atual_id')
      .eq('tenant_id', TENANT).eq('categoria', 'conteudo').eq('deletado', false)
      .eq('status', 'publicado').eq('tipo_origem', 'docx')
      .ilike('titulo', `%${titulo}%`)
      .limit(5);
    if (error) { console.log('  erro busca:', error.message); continue; }
    if (!docs || docs.length === 0) { console.log('  nenhum doc encontrado'); continue; }
    if (docs.length > 1) console.log('  (', docs.length, 'matches; usando o 1o )', docs.map((d) => d.titulo));
    const doc = docs[0];
    console.log('  doc:', doc.titulo, doc.id);

    const { data: ver } = await svc
      .from('simulado_conteudo_versoes')
      .select('arquivo_key')
      .eq('id', doc.versao_atual_id).single();
    if (!ver?.arquivo_key) { console.log('  sem versao/arquivo_key'); continue; }

    const { data: blob, error: dlErr } = await svc.storage.from('pdfs').download(ver.arquivo_key);
    if (dlErr || !blob) { console.log('  erro download:', dlErr?.message); continue; }
    const buf = Buffer.from(await blob.arrayBuffer());

    let r;
    try { r = cortarCapaBuffer(buf, { debug: true }); }
    catch (e) { console.log('  erro corte:', e.message); continue; }

    console.log('  motivo        :', r.motivo || 'PULAR');
    console.log('  blocosTotais  :', r.blocosTotais);
    console.log('  removidos     :', r.removidos, '(keepFrom=' + r.keepFrom + ')');
    console.log('  out           :', r.out ? r.out.length + ' bytes' : 'null (nao cortado)');
    if (process.env.DEBUG_BLOCKS && r.blocos) {
      console.log('  --- primeiros', Math.min(r.blocos.length, 42), 'blocos ---');
      r.blocos.slice(0, 42).forEach((t, i) => console.log('   [' + i + ']', JSON.stringify(t.slice(0, 90))));
    }
    if (r.motivo) {
      const ini = r.keepFrom;
      console.log('  --- 6 primeiros blocos MANTIDOS (a partir de keepFrom) ---');
      for (let k = ini; k < Math.min(ini + 6, r.blocosTotais); k++) {
        console.log('   [' + k + ']', JSON.stringify((r.blocos[k] || '').slice(0, 110)));
      }
    }
  }
}

// so roda CLI quando invocado diretamente
const invokedDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirect) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
