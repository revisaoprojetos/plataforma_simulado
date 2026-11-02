/**
 * dryrun-corte.mjs
 *
 * DRY-RUN (barato, SEM baixar .docx) do cortador de capa sobre TODOS os docs
 * publicados da Biblioteca. Usa os TRECHOS ja indexados (simulado_conteudo_trechos),
 * aplicando as MESMAS regras do cortador (acharKeepFrom) sobre o texto dos
 * primeiros ~40 trechos (ordem asc) de cada versao atual.
 *
 * Imprime contagem por motivo (legenda/roteiro/sumario/toc/PULAR) e, para PULAR,
 * lista ate 30 titulos + o texto do 1o trecho. Salva relatorio completo em:
 *   <scratchpad>/dryrun-corte.txt
 *
 * NAO escreve nada em producao.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { acharKeepFrom } from './cortar-capa-docx.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = 'C:/Users/joooa/AppData/Local/Temp/claude/c--Users-joooa-Downloads-Plataforma-Simulado/526b571b-6115-41c1-9720-26c054780cda/scratchpad';
const OUT = path.join(SCRATCH, 'dryrun-corte.txt');
const TENANT = '02195fa6-3db8-49d0-8c07-d21328a26a13';
const JANELA = 45; // alguns a mais que a janela de 40 por seguranca

function env() {
  const e = {};
  for (const line of fs.readFileSync(path.join(WEB, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line); if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return e;
}
const E = env();
const svc = createClient(E.NEXT_PUBLIC_SUPABASE_URL || E.SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

async function fetchDocs() {
  const out = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await svc
      .from('simulado_conteudo_documentos')
      .select('id,titulo,versao_atual_id')
      .eq('tenant_id', TENANT).eq('categoria', 'conteudo').eq('deletado', false)
      .eq('status', 'publicado').eq('tipo_origem', 'docx')
      .order('id', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error('fetchDocs: ' + error.message);
    out.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return out;
}

async function trechosDe(vid) {
  if (!vid) return [];
  const { data, error } = await svc
    .from('simulado_conteudo_trechos')
    .select('texto')
    .eq('versao_id', vid)
    .order('ordem', { ascending: true })
    .limit(JANELA);
  if (error) throw new Error('trechos ' + vid + ': ' + error.message);
  return (data || []).map((r) => norm(r.texto));
}

async function mapLimit(items, limit, fn) {
  const res = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      res[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return res;
}

async function main() {
  const docs = await fetchDocs();
  const linhas = [];
  const log = (s = '') => { linhas.push(s); };

  log('DRY-RUN corte de capa (via trechos) — ' + new Date().toISOString());
  log('tenant=' + TENANT + '  docs(docx/publicado/conteudo)=' + docs.length);
  log('regras: 1.legenda  2.roteiro  3.sumario(rotulado)  4.toc(sem rotulo)  -> senao PULAR');
  log('janela: primeiros ' + JANELA + ' trechos (ordem asc)');
  log('');

  const contagem = { legenda: 0, roteiro: 0, sumario: 0, toc: 0, PULAR: 0 };
  const pularRuleMiss = []; // {titulo, primeiro}
  const pularSemTrechos = []; // {titulo}
  const porMotivo = { legenda: [], roteiro: [], sumario: [], toc: [] };
  let processados = 0;

  await mapLimit(docs, 8, async (doc) => {
    let textos = [];
    try { textos = await trechosDe(doc.versao_atual_id); }
    catch (e) { textos = []; }
    processados++;
    if (textos.length === 0) {
      contagem.PULAR++;
      pularSemTrechos.push({ titulo: doc.titulo });
      return;
    }
    const { motivo } = acharKeepFrom(textos);
    if (motivo === null) {
      contagem.PULAR++;
      pularRuleMiss.push({ titulo: doc.titulo, primeiro: textos.find((t) => t) || '' });
    } else {
      contagem[motivo]++;
      porMotivo[motivo].push(doc.titulo);
    }
  });

  log('=== CONTAGEM POR MOTIVO ===');
  for (const k of ['legenda', 'roteiro', 'sumario', 'toc', 'PULAR']) {
    log('  ' + k.padEnd(8) + ': ' + contagem[k]);
  }
  log('  (PULAR detalhe: sem_trechos=' + pularSemTrechos.length + '  regra_nao_casou=' + pularRuleMiss.length + ')');
  log('  total=' + (contagem.legenda + contagem.roteiro + contagem.sumario + contagem.toc + contagem.PULAR));
  log('');

  // Amostra de titulos por motivo que CORTA (para conferencia)
  for (const k of ['legenda', 'roteiro', 'sumario', 'toc']) {
    log('--- ' + k.toUpperCase() + ' (' + porMotivo[k].length + ') [ate 15] ---');
    porMotivo[k].slice(0, 15).forEach((t) => log('   ' + t));
    log('');
  }

  log('=== PULAR — regra nao casou (' + pularRuleMiss.length + ') [TODOS] ===');
  pularRuleMiss.forEach((p) => log('   ' + p.titulo + '  ||1oTrecho: ' + JSON.stringify((p.primeiro || '').slice(0, 120))));
  log('');
  log('=== PULAR — sem trechos indexados (' + pularSemTrechos.length + ') [TODOS] ===');
  pularSemTrechos.forEach((p) => log('   ' + p.titulo));
  log('');

  fs.writeFileSync(OUT, linhas.join('\n'), 'utf8');

  // ---- resumo no console ----
  console.log('=== DRY-RUN — contagem por motivo (total ' + docs.length + ') ===');
  for (const k of ['legenda', 'roteiro', 'sumario', 'toc', 'PULAR']) console.log('  ' + k.padEnd(8) + ': ' + contagem[k]);
  console.log('  PULAR detalhe: sem_trechos=' + pularSemTrechos.length + '  regra_nao_casou=' + pularRuleMiss.length);
  console.log('');
  console.log('=== PULAR (regra nao casou) — ate 30 titulos + 1o trecho ===');
  pularRuleMiss.slice(0, 30).forEach((p) => console.log('  ' + p.titulo + '\n      1oTrecho: ' + JSON.stringify((p.primeiro || '').slice(0, 110))));
  if (pularRuleMiss.length > 30) console.log('  ... (+' + (pularRuleMiss.length - 30) + ' outros no arquivo)');
  console.log('');
  console.log('relatorio completo salvo em:', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
