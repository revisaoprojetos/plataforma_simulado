/* Bootstrap do Desafio de Jurisprudência: liga o jogo (jogo.js, INTOCADO) ao backend
   da plataforma. Prepara window.DESAFIO (conteúdo) e o localStorage (progresso) ANTES
   de injetar o motor, e sincroniza o progresso de volta via API a cada save do jogo. */
(() => {
'use strict';

// id do desafio (pasta) vindo da URL: ?desafio=<pastaId>
const ID = new URLSearchParams(location.search).get('desafio');

// injeta um <script> e resolve quando carregar
function injetar(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.body.appendChild(s);
  });
}

// conteúdo do backend -> window.DESAFIO; se falhar, usa o dados.js embutido (fallback)
async function carregarConteudo(){
  if(ID){
    try{
      const r = await fetch(`/api/jurisprudencia/conteudo?desafio=${encodeURIComponent(ID)}`, { credentials:'same-origin' });
      if(r.ok){
        const d = await r.json();
        if(d && d.CONFIG && d.DIAS){ window.DESAFIO = { CONFIG:d.CONFIG, MATERIAS:d.MATERIAS, FINAL:d.FINAL, DIAS:d.DIAS, APARENCIA:d.APARENCIA || null, IMAGENS:d.IMAGENS || {} }; return; }
      }
    }catch(e){ /* cai no fallback */ }
  }
  // fallback: dados.js seta window.DESAFIO sozinho
  await injetar('js/dados.js');
}

// pré-semeia o localStorage com o progresso do aluno (o que jogo.js lê no load())
async function semearProgresso(){
  const key = window.DESAFIO && window.DESAFIO.CONFIG && window.DESAFIO.CONFIG.storageKey;
  if(!key) return;
  if(!ID) return; // sem id não há progresso remoto; jogo usa o localStorage local como está
  try{
    const r = await fetch(`/api/jurisprudencia/progresso?desafio=${encodeURIComponent(ID)}`, { credentials:'same-origin' });
    if(!r.ok) return;
    const p = await r.json();
    if(p && p.perfil && window.DESAFIO) window.DESAFIO.PERFIL = p.perfil; // card do jogador (nome/cargo/nível/foto)
    const atual = JSON.parse(localStorage.getItem(key) || '{}');
    // servidor é a fonte de verdade de dom/best/recorde; mantém campos locais (muted, sel…)
    const semeado = Object.assign({}, atual, {
      dom: p.dom || {}, best: p.best || {}, recorde: p.recorde || 0,
    });
    localStorage.setItem(key, JSON.stringify(semeado));
  }catch(e){ /* mantém o que houver localmente */ }
}

// monkey-patch do setItem: ao salvar na chave do desafio, envia dom/best/recorde ao backend
function interceptarSalvar(){
  const key = window.DESAFIO && window.DESAFIO.CONFIG && window.DESAFIO.CONFIG.storageKey;
  if(!key || !ID) return;
  const original = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(k, v){
    original(k, v); // grava local sempre
    if(k === key){
      try{
        const o = JSON.parse(v) || {};
        // fire-and-forget: não bloqueia o jogo
        fetch('/api/jurisprudencia/progresso', {
          method:'POST', credentials:'same-origin',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ desafio:ID, dom:o.dom || {}, best:o.best || {}, recorde:o.recorde || 0 }),
          keepalive:true,
        }).catch(()=>{});
      }catch(e){ /* v não-JSON: ignora */ }
    }
  };
}

// aplica overrides de cor (CSS vars) definidos no admin — recolorir o chrome do jogo SEM tocar no
// motor nem no estilos.css (o jogo usa :root{--neon,--gold,...} em todo o CSS).
function aplicarAparencia(){
  const ap = window.DESAFIO && window.DESAFIO.APARENCIA;
  if(!ap || typeof ap !== 'object') return;
  const cores = (ap.cores && typeof ap.cores === 'object') ? ap.cores : {};
  let linhas = Object.entries(cores)
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([k, v]) => `--${k}:${v};`).join('');
  const glow = ap.efeitos && ap.efeitos.glow; // intensidade do brilho (multiplicador)
  if(glow != null && !isNaN(Number(glow))) linhas += `--glow:${Number(glow)};`;
  if(!linhas) return;
  const st = document.createElement('style');
  st.id = 'juris-aparencia';
  st.textContent = `:root{${linhas}}`;
  document.head.appendChild(st);
}

// ranking real (geral) -> window.__JURIS_RANK {rows, me} (iniciais/cargo/nível/avatar; privacidade por iniciais)
async function carregarRanking(){
  if(!ID) return;
  try{
    const r = await fetch(`/api/jurisprudencia/ranking?desafio=${encodeURIComponent(ID)}&tab=geral`, { credentials:'same-origin' });
    if(r.ok){ const d = await r.json(); if(d && Array.isArray(d.rows)) window.__JURIS_RANK = { rows:d.rows, me:d.me||null }; }
  }catch(e){ /* mantém SAMPLE */ }
}

(async () => {
  await carregarConteudo();     // window.DESAFIO pronto
  if(!window.DESAFIO){ await injetar('js/dados.js'); } // garantia extra
  aplicarAparencia();           // overrides de cor do admin (antes do motor pintar)
  await semearProgresso();      // localStorage pré-semeado + window.DESAFIO.PERFIL
  await carregarRanking();      // window.__JURIS_RANK (ranking real)
  interceptarSalvar();          // sync de saída armado
  await injetar('js/jogo.js');  // só então o motor inicia, com tudo pronto
})();

})();
