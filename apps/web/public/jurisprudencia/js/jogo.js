(() => {
'use strict';
const $ = s => document.querySelector(s);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

const { CONFIG, MATERIAS, FINAL, DIAS } = window.DESAFIO;

/* =========================================================
   ESTADO
   ========================================================= */
const DEF = {dom:{}, best:{}, recorde:0, demoAll:false, final:null, muted:false, volSfx:1, volMus:.5, sel:null};
let S = load();
// Regra: a cada entrada no desafio o som começa ATIVADO — EFEITOS no MÁXIMO e MÚSICA na METADE.
S.muted = false; S.volSfx = 1; S.volMus = .5;
function load(){ try{ const r = localStorage.getItem(CONFIG.storageKey); if(r) return Object.assign({}, DEF, JSON.parse(r)); }catch(e){} return JSON.parse(JSON.stringify(DEF)); }
function save(){ try{ localStorage.setItem(CONFIG.storageKey, JSON.stringify(S)); }catch(e){} }

/* ---- Modelo de dias DINÂMICO (chaves ESTÁVEIS + `ordem`; publicação por dia SUBSTITUI a liberação) ----
   - DIAS é { "<chaveEstável>": { titulo, teses, materia, ordem, pub } } — a chave nunca muda (preserva o
     progresso em S.dom/S.best). A ORDEM de exibição vem de `ordem`; o NÚMERO mostrado é a posição (1..N).
   - Publicação: rascunho = oculto; agendada/visualizável = aparece bloqueado; publicada = jogável.       */
const FINAL_ID = (FINAL && FINAL.id) || 'rg';
const ordemDe = k => { const d=DIAS[k]; return (d && typeof d.ordem==='number') ? d.ordem : Number(k); };
const ORD_ALL = Object.keys(DIAS||{}).map(Number).filter(k=>!isNaN(k)).sort((a,b)=>ordemDe(a)-ordemDe(b)||a-b);
function pubEstado(n){
  const p = DIAS[n] && DIAS[n].pub; const est = (p && p.estado) || 'publicada'; // legado sem pub = publicado
  if(p && p.publicarEm){ const t=Date.parse(p.publicarEm);
    if(!isNaN(t)){
      if(t>Date.now()) return est==='rascunho' ? 'rascunho' : 'agendada'; // antes da data: oculto OU bloqueado c/ data
      return 'publicada';                                                  // chegou a data → AUTO-LIBERA
    }
  }
  if(est==='rascunho') return 'rascunho';
  return est==='visualizavel' ? 'visualizavel' : 'publicada';
}
function dayVisible(n){ if(S.demoAll) return true; return pubEstado(n)!=='rascunho'; }
const VORD = ORD_ALL.filter(dayVisible);          // dias visíveis, na ordem (o que o aluno enxerga)
const NDAYS = VORD.length;
const pos = n => VORD.indexOf(Number(n))+1;        // número exibido (1..N) a partir da chave estável
const keyAt = p => VORD[p-1];                       // chave do dia na posição p
function matIdOf(n){
  const d=DIAS[n]; if(d && d.materia) return d.materia;
  const m=(MATERIAS||[]).find(x=>(x.dias||[]).includes(Number(n))); if(m) return m.id;  // fallback legado
  if(FINAL && (FINAL.dias||[]).includes(Number(n))) return FINAL_ID;
  return null;
}
const isFinalDay = n => matIdOf(n)===FINAL_ID;
const MAT_FALLBACK = { id:'_', nome:'', curto:'', icon:'doc' }; // dia sem matéria não quebra o render
const matOf = n => [...(MATERIAS||[]), FINAL].find(m=>m && m.id===matIdOf(n)) || FINAL || (MATERIAS||[])[0] || MAT_FALLBACK;
const diasDaMateria = m => VORD.filter(n=>matIdOf(n)===(m&&m.id));

function getTeses(n){
  if(!isFinalDay(n)) return (DIAS[n] && DIAS[n].teses) || [];
  if(!S.final){
    const pool=[]; VORD.filter(k=>!isFinalDay(k)).forEach(d=>((DIAS[d]&&DIAS[d].teses)||[]).forEach((_,i)=>pool.push([d,i])));
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    S.final = pool.slice(0,6); save();
  }
  return S.final.map(([d,i])=>DIAS[d].teses[i]);
}
const domOf = n => S.dom[n] || [];
const dayComplete = n => domOf(n).length >= getTeses(n).length;
// Jogável = publicada (demo/preview liberam tudo). Agendada/visualizável/rascunho = bloqueado.
function dayUnlocked(n){ if(S.demoAll) return true; return pubEstado(n)==='publicada'; }
// Data de liberação do dia AGENDADO (p/ exibir "BLOQUEADO - DD/MM/AAAA"). null se não agendado.
function dataLiberacao(n){
  const p = DIAS[n] && DIAS[n].pub; if(!(p && p.publicarEm)) return null;
  const d = new Date(p.publicarEm); if(isNaN(d.getTime())) return null;
  return `${dd(d.getDate())}/${dd(d.getMonth()+1)}/${d.getFullYear()}`;
}
function hoje(){ for(const n of VORD){ if(dayUnlocked(n) && !dayComplete(n)) return n; } return VORD[VORD.length-1] ?? keyAt(1); }
const matDone = m => { const ds=diasDaMateria(m); return ds.length>0 && ds.every(dayComplete); };
const totalPts = () => Object.values(S.best).reduce((a,b)=>a+b,0);
const selosCount = () => (MATERIAS||[]).filter(matDone).length;
const pad = (n,l=6) => String(Math.max(0,Math.floor(n))).padStart(l,'0');
const dd = n => String(n).padStart(2,'0');

/* =========================================================
   SOM 8-bit
   ========================================================= */
const SFX = {
  ac:null, w:0,
  init(){ if(this.ac) return; try{ this.ac = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} },
  tone(f, d=.08, type='square', v=.05, f2=null, delay=0){
    const vol = S.muted ? 0 : (typeof S.volSfx==='number' ? S.volSfx : .5); // volume dos EFEITOS
    if(!vol || !this.ac) return;
    const t = this.ac.currentTime + delay, o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type=type; o.frequency.setValueAtTime(f,t); if(f2) o.frequency.exponentialRampToValueAtTime(f2,t+d);
    g.gain.setValueAtTime(Math.max(.0002, v*vol),t); g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g).connect(this.ac.destination); o.start(t); o.stop(t+d+.02);
  },
  seq(notes, step=.09, type='square', v=.05){ notes.forEach((f,i)=>f && this.tone(f, step*.95, type, v, null, i*step)); },
  waka(){ this.w^=1; this.tone(this.w?520:380,.05,'triangle',.06); },
  click(){ this.tone(880,.04,'square',.03); },
  start(){ this.seq([523,659,784,1047,0,784,1047],.08); },
  tese(){ this.seq([988,1319],.07,'square',.05); },
  ok(){ this.seq([523,659,784,1047,1319],.07,'square',.06); },
  bad(){ this.tone(300,.35,'sawtooth',.06,90); },
  die(){ this.tone(700,.9,'square',.06,60); },
  power(){ this.seq([392,523,659,784,659,784,1047],.05,'triangle',.07); },
  eat(){ this.tone(200,.25,'square',.06,1400); },
  clear(){ this.seq([523,523,659,784,0,659,784,1047,1047],.1,'square',.06); },
  over(){ this.seq([392,370,349,330,0,262],.16,'triangle',.07); },
  locked(){ this.tone(140,.18,'square',.05); },
  selo(){ this.seq([784,988,1175,1568,1175,1568,2093],.08,'square',.05); },
  tick(){ this.tone(1200,.03,'square',.025); }
};

/* ---------- Música de fundo (opcional: assets/audio/musica-fundo.mp3) ----------
   O volume é o MESMO controle da regulagem (S.volume); mudo = pausa. Começa só após um gesto do
   usuário (política de autoplay). Se o arquivo não existir, play() falha e é ignorado. */
const BGM = {
  el:null, armed:false,
  init(){ this.el = $('#bgm');
    // Fonte vinda do admin (CONFIG.musicaFundo) tem prioridade; senão fica o <source> padrão do HTML.
    try{ const u = CONFIG && CONFIG.musicaFundo;
      if(this.el && u){ this.el.src = u; this.el.preload = 'auto'; this.el.load?.(); }
      if(this.el) this.el.loop = (CONFIG && CONFIG.musicaLoop !== false); // padrão: loop infinito (trecho curto)
    }catch(e){}
    // Tenta tocar assim que o áudio estiver pronto (além do apply imediato) — cobre o carregamento atrasado.
    if(this.el){ this.el.addEventListener('canplay', ()=>this.apply(), { once:true }); this.el.addEventListener('loadeddata', ()=>this.apply(), { once:true }); }
    this.apply();
  },
  vol(){ return S.muted ? 0 : (typeof S.volMus==='number' ? S.volMus : .5); },
  apply(){
    if(!this.el) return;
    try{ this.el.volume = Math.max(0, Math.min(1, this.vol())); }catch(e){}
    // Só toca DEPOIS de "armado" (carregamento chegou a 100% / 1º gesto) — nunca antes, nem no preview.
    if(this.armed && this.vol() > 0){ this.el.play?.().catch(()=>{}); } else { this.el.pause?.(); }
  },
  // chamado quando o carregamento chega a 100% (ou no 1º gesto) — a partir daí a música pode tocar
  arm(){ if(this.armed) return; this.armed=true; this.apply(); }
};

/* =========================================================
   PIXEL ART
   ========================================================= */
const ICON = {
 building:["...XXX...",".XXXXXXX.","XXXXXXXXX",".........",".X.X.X.X.",".X.X.X.X.",".X.X.X.X.",".........","XXXXXXXXX"],
 briefcase:["...XXX...","...X.X...","XXXXXXXXX","X.......X","XXXXXXXXX","X...X...X","X.......X","XXXXXXXXX","........."],
 doc:[".XXXXXX..",".X....XX.",".X.XX..X.",".X.....X.",".X.XXX.X.",".X.....X.",".X.XXX.X.",".X.....X.",".XXXXXXX."],
 umbrella:["....X....","..XXXXX..",".XXXXXXX.","XXXXXXXXX","X...X...X","....X....","....X....","..X.X....","...X....."],
 folder:["XXXX.....","X..XXXXXX","XXXXXXXXX","X.......X","X.......X","X.......X","X.......X","XXXXXXXXX","........."],
 hardhat:[".........","...XXX...","..XX.XX..",".XXX.XXX.",".XXXXXXX.",".XXXXXXX.","XXXXXXXXX","XXXXXXXXX","........."],
 dollar:["....X....","..XXXXX..",".XX.X....",".XX.X....","..XXXXX..","....X.XX.","....X.XX.","..XXXXX..","....X...."],
 rg:["XXX..XXX.","X..X.X...","X..X.X...","XXX..X.XX","X.X..X..X","X..X.X..X","X..X.XXX.",".........","........."],
 lock:["..XXXXX..",".X.....X.",".X.....X.","XXXXXXXXX","XXXX.XXXX","XXXX.XXXX","XXXXXXXXX","XXXXXXXXX","........."],
 check:["........X",".......XX","......XX.","X....XX..","XX..XX...",".XXXX....","..XX.....",".........","........."],
 play:["..X......","..XX.....","..XXX....","..XXXX...","..XXXXX..","..XXXX...","..XXX....","..XX.....","..X......"],
 star:["....X....","...XXX...","XXXXXXXXX",".XXXXXXX.","..XXXXX..","..XX.XX..",".XX...XX.","X.......X","........."],
 heart:[".XX.XX.","XXXXXXX","XXXXXXX",".XXXXX.","..XXX..","...X..."],
 book:["XXXXXXXX.","X......XX","X.XXXX.XX","X......XX","X.XXXX.XX","X......XX","X......XX","XXXXXXXXX",".XXXXXXXX"]
};
function pxPath(rows){ let d=''; rows.forEach((r,y)=>{ for(let x=0;x<r.length;x++) if(r[x]!=='.') d+=`M${x} ${y}h1v1h-1z`; }); return d; }
function pxSvg(name, color='currentColor'){ const r=ICON[name]; return `<svg viewBox="0 0 ${r[0].length} ${r.length}" shape-rendering="crispEdges" aria-hidden="true"><path fill="${color}" d="${pxPath(r)}"/></svg>`; }

const SPR_ROWS = {
 hero1:["........A.......",".....LLLAA......","...LLLLLAAA.....","..LLLDDDAADRR...",".LLDDDDDADDDRR..",".LLDDDDDDDDDDRR.","LLDDDWWDDWWDDDRR","LLDDDWPDDWPDDDRR","LLDDDWPDDWPDDDRR","RRDDDDDDDDDDDDRR",".RRDDDDDDDDDDRR.",".RRDDDDDDDDDDRR.","..RRRDDDDDDRRR..","...RRRRRRRRRR...",".....RRRRRR.....",".....O....O.....","....OO....OO....","................"],
 hero2:["........A.......",".....LLLAA......","...LLLLLAAA.....","..LLLDDDAADRR...",".LLDDDDDADDDRR..",".LLDDDDDDDDDDRR.","LLDDDWWDDWWDDDRR","LLDDDWPDDWPDDDRR","LLDDDWPDDWPDDDRR","RRDDDDDDDDDDDDRR",".RRDDDDDDDDDDRR.",".RRDDDDDDDDDDRR.","..RRRDDDDDDRRR..","...RRRRRRRRRR...",".....RRRRRR.....","......O..O......",".....OO..OO.....","................"],
 heroBlink:["........A.......",".....LLLAA......","...LLLLLAAA.....","..LLLDDDAADRR...",".LLDDDDDADDDRR..",".LLDDDDDDDDDDRR.","LLDDDDDDDDDDDDRR","LLDDDPPDDPPDDDRR","RRDDDDDDDDDDDDRR","RRDDDDDDDDDDDDRR",".RRDDDDDDDDDDRR.",".RRDDDDDDDDDDRR.","..RRRDDDDDDRRR..","...RRRRRRRRRR...",".....RRRRRR.....",".....O....O.....","....OO....OO....","................"],
 peg:["XXXXXXXXXXX","XDDDDDDDDDX","XDWWDDDWWDX","XDWPDDDWPDX","XDDDDDDDDDX","XDXXXXXXXDX","XDXDXDXDXDX","XDDDDDDDDDX","XXXXXXXXXXX",".X.......X.","XX.......XX"],
 sum:[".XXXXXXX...",".XDDDDDXX..",".XDWPDWPXX.",".XDDDDDDDX.",".XDXXXXXDX.",".XDDDDDDDX.",".XDXXXXXDX.",".XDDDDDDDX.",".XXXXXXXXX.","..X.....X..",".XX.....XX."],
 inf:["XXXXXXXXXXX","XDDXXXXXDDX","XDXXDDDXXDX","XDDDDDDXXDX","XDDDDDXXDDX","XDDDDXXDDDX","XDDDDXXDDDX","XDDDDDDDDDX","XDDDDXXDDDX","XXXXXXXXXXX",".X.......X."]
};
const HERO_PAL = {R:'#6d4dff', L:'#b48cff', A:'#e2d8ff', D:'#120c40', W:'#ffffff', P:'#1b1054', O:'#b48cff'};
const TRAP_DEF = {
  peg:{nome:'Pegadinha', cor:'#ff4f9a', desc:'A alternativa “quase certa”. Rápida e insistente: vai direto atrás de você.'},
  sum:{nome:'Súmula superada', cor:'#3fd5ff', desc:'Entendimento que já caiu e ainda assombra. Lenta, mas vagueia pelo labirinto.'},
  inf:{nome:'Informativo esquecido', cor:'#b48cff', desc:'Some e reaparece. Tenta cortar seu caminho pela frente.'}
};
function makeSprite(rows, pal){
  const c=document.createElement('canvas'); c.width=rows[0].length; c.height=rows.length;
  const x=c.getContext('2d'); rows.forEach((r,y)=>{ for(let i=0;i<r.length;i++){ const ch=r[i]; if(ch!=='.' && pal[ch]){ x.fillStyle=pal[ch]; x.fillRect(i,y,1,1);} } }); return c;
}
const SPR = {
  hero:[makeSprite(SPR_ROWS.hero1,HERO_PAL), makeSprite(SPR_ROWS.hero2,HERO_PAL)],
  fright: {}, white:{}
};
['peg','sum','inf'].forEach(k=>{
  SPR[k]=makeSprite(SPR_ROWS[k],{X:TRAP_DEF[k].cor, D:'#14072e', W:'#fff', P:'#120a3a'});
  SPR.fright[k]=makeSprite(SPR_ROWS[k],{X:'#3446ff', D:'#0b0f45', W:'#fff', P:'#fff'});
  SPR.white[k]=makeSprite(SPR_ROWS[k],{X:'#ffffff', D:'#3446ff', W:'#ff4f9a', P:'#ff4f9a'});
});

/* =========================================================
   MASCOTE JURISCLUB — sprite simples, mesma linguagem das armadilhas
   Corpo = anel da logo com a seta · olhos 2×2 · perninhas na diagonal
   ========================================================= */
const MASC_ROWS={
  base:[
   "....XXXXA....",
   "..XXXXXXAA...",
   ".XXDDDDDA..X.",
   ".XDDDDDDDDXX.",
   "XXDDWWDWWDDXX",
   "XXDDWPDWPDDXX",
   "XXDDDDDDDDDXX",
   "XXDDDDDDDDDXX",
   ".XXDDDDDDDXX.",
   "..XXXDDDXXX..",
   "....XXXXX...."],
  legsA:["...X.....X...","..XX.....XX.."],
  legsB:["..X.......X..",".XX.......XX."]
};
const MASC_PAL={
  normal:{X:'#9b7bff',A:'#e6ddff',D:'#14072e',W:'#ffffff',P:'#120a3a'},
  power:{X:'#3fd5ff',A:'#e6fbff',D:'#07203a',W:'#ffffff',P:'#120a3a'},
  dead:{X:'#9b7bff',A:'#e6ddff',D:'#14072e',W:'#ff4f9a',P:'#ff4f9a'}
};
const MW=13, MH=14, MCX=6.5, MCY=5.5, MTOP=1;
const MASC_CACHE={};
function mascotSprite(legs, eyes, pal){
  const key=legs+eyes+pal; if(MASC_CACHE[key]) return MASC_CACHE[key];
  let rows=MASC_ROWS.base.slice();
  if(eyes==='blink'){ rows[4]="XXDDDDDDDDDXX"; rows[5]="XXDDWWDWWDDXX"; }
  if(eyes==='up'){ rows[4]="XXDDWPDWPDDXX"; rows[5]="XXDDWWDWWDDXX"; }
  if(eyes==='happy'){ rows[4]="XXDDWWDWWDDXX"; rows[5]="XXDDDDDDDDDXX"; }
  rows=rows.concat(MASC_ROWS[legs]);
  return MASC_CACHE[key]=makeSprite(rows, MASC_PAL[pal]);
}
let __mascImg=null; // imagem anexada do mascote (IMAGENS.personagens.mascote) — substitui a pixel art quando definida
function drawMascot(c, o={}){
  if(__mascImg){ c.clearRect(0,0,MW,MH); try{ c.drawImage(__mascImg,0,0,MW,MH); }catch(e){} return; }
  const t=o.t||0;
  c.clearRect(0,0,MW,MH);
  const walking=o.walk!=null, f=walking?Math.floor(((o.walk%1)+1)%1*2):0;
  const oy = MTOP + (walking ? (f?-1:0) : (Math.sin(t*3.2)>.6?-1:0)) + (o.jump?-1:0);
  const eyes = o.dead?'base' : o.blink?'blink' : o.happy?'happy' : (o.look?.y<0?'up':'base');
  const pal = o.dead?'dead' : o.power?'power' : 'normal';
  c.drawImage(mascotSprite(f?'legsB':'legsA', eyes, pal), 0, Math.max(0,oy));
}
function mascotCanvas(o){ const cv=document.createElement('canvas'); cv.width=MW; cv.height=MH; drawMascot(cv.getContext('2d'),o); return cv; }
SPR.hero=[mascotCanvas({}), mascotCanvas({blink:true})];
/* Integração plataforma: imagens anexadas de personagens (IMAGENS.personagens) entram no lugar da pixel art.
   Traps: troca o sprite NORMAL por uma imagem (estados vulnerável/piscando seguem a pixel art).
   Mascote: a imagem é desenhada pelo drawMascot. Fallback = pixel art original (nenhuma imagem = jogo à risca). */
(function(){
  try{
    const P=(window.DESAFIO&&window.DESAFIO.IMAGENS&&window.DESAFIO.IMAGENS.personagens)||{};
    const mapTrap={pegadinha:'peg', sumula:'sum', informativo:'inf'};
    Object.keys(mapTrap).forEach(function(k){ const url=P[k]; if(url){ const im=new Image(); im.onload=function(){ SPR[mapTrap[k]]=im; }; im.src=url; } });
    if(P.mascote){ const im=new Image(); im.onload=function(){ __mascImg=im; try{ SPR.hero=[mascotCanvas({}), mascotCanvas({blink:true})]; }catch(e){} }; im.src=P.mascote; }
  }catch(e){}
})();
const MASC=document.createElement('canvas'); MASC.width=MW; MASC.height=MH; const MASCX=MASC.getContext('2d');

function spriteURL(c, scale=4){ const o=document.createElement('canvas'); o.width=c.width*scale; o.height=c.height*scale; const x=o.getContext('2d'); x.imageSmoothingEnabled=false; x.drawImage(c,0,0,o.width,o.height); return o.toDataURL(); }

/* Medalhas (selos) */
// Integração plataforma: se o admin anexou uma imagem (IMAGENS.selos[id]), ela tem prioridade sobre o SVG.
// Aceita string (1 imagem; cinza quando bloqueado) OU objeto {conquistado,bloqueado} (arte própria por estado).
function seloImg(id, won){ try{
  const s=window.DESAFIO&&window.DESAFIO.IMAGENS&&window.DESAFIO.IMAGENS.selos&&window.DESAFIO.IMAGENS.selos[id];
  if(!s) return null;
  if(typeof s==='string') return { url:s, gray:!won };
  const url = won ? s.conquistado : (s.bloqueado||s.conquistado);
  return url ? { url, gray: (!won && !s.bloqueado) } : null;
}catch(e){ return null; } }
function medal(m, won, opts={}){
  const _ci=seloImg(m&&m.id, won); if(_ci) return `<img src="${_ci.url}" alt="Selo ${m?m.nome:''}" style="width:100%;height:100%;object-fit:contain;${_ci.gray?'filter:grayscale(1);opacity:.55':''}"/>`;
  const ring = won ? '#ffc83d' : '#3a3f9a', ic = won ? '#ffc83d' : '#5c61c4', rib = won ? '#7c3aed' : '#1a2070', txt = won ? '#fff' : '#7f84d6';
  const r = ICON[m.icon]; const s = 2.6, w = r[0].length*s, h = r.length*s;
  const lock = won ? '' : `<g transform="translate(62 50)"><circle cx="5" cy="5" r="8" fill="#0b1150" stroke="#3a3f9a" stroke-width="1.5"/><g transform="translate(1 1) scale(.9)"><path fill="#7f84d6" d="${pxPath(ICON.lock)}"/></g></g>`;
  const _dds = diasDaMateria(m); const dias = _dds.length>1 ? `DIAS ${pos(_dds[0])} E ${pos(_dds[_dds.length-1])}` : `DIA ${pos(_dds[0] ?? keyAt(1))}`;
  return `<svg viewBox="0 0 100 112" role="img" aria-label="Selo ${m.nome}${won?' conquistado':' bloqueado'}">
    <circle cx="50" cy="44" r="34" fill="#0b1150" stroke="${ring}" stroke-width="2" opacity=".9"/>
    ${arcArrow(50,44,30,-25,262,4,ring)}
    <text x="50" y="22" text-anchor="middle" font-family="VT323,monospace" font-size="7" fill="${txt}" letter-spacing=".5">MATÉRIA ${String(MATERIAS.indexOf(m)+1).padStart(2,'0')}</text>
    <g transform="translate(${50-w/2} ${46-h/2}) scale(${s})"><path fill="${ic}" d="${pxPath(r)}" shape-rendering="crispEdges"/></g>
    ${lock}
    <path d="M10 78 h80 l-5 6 5 6 h-80 l5 -6z" fill="${rib}" stroke="${ring}" stroke-width="1"/>
    <text x="50" y="86.5" text-anchor="middle" font-family="Montserrat,sans-serif" font-weight="800" font-size="${m.nome.length>18?4.6:6}" fill="${txt}" letter-spacing=".3">${m.nome.toUpperCase()}</text>
    <text x="50" y="102" text-anchor="middle" font-family="VT323,monospace" font-size="9" fill="${txt}" opacity=".8">${dias}</text>
  </svg>`;
}
function arcArrow(cx,cy,r,a0,a1,w,col,headCol,head=1.7,extra=''){
  const R=Math.PI/180, P=a=>[cx+r*Math.cos(a*R), cy+r*Math.sin(a*R)];
  const [x0,y0]=P(a0),[x1,y1]=P(a1), large=(a1-a0)>180?1:0;
  const t=[-Math.sin(a1*R),Math.cos(a1*R)], n=[Math.cos(a1*R),Math.sin(a1*R)], hw=w*head, bx=x1-t[0]*.4, by=y1-t[1]*.4;
  const f=v=>v.toFixed(2);
  return `<path d="M${f(x0)} ${f(y0)}A${r} ${r} 0 ${large} 1 ${f(x1)} ${f(y1)}" fill="none" stroke="${col}" stroke-width="${w}" ${extra}/>`+
         `<path d="M${f(bx+n[0]*hw)} ${f(by+n[1]*hw)}L${f(x1+t[0]*hw*1.5)} ${f(y1+t[1]*hw*1.5)}L${f(bx-n[0]*hw)} ${f(by-n[1]*hw)}Z" fill="${headCol||col}" ${extra}/>`;
}
let FMID=0;
function finalMedal(won){
  const _ci=seloImg(typeof FINAL!=='undefined'&&FINAL?FINAL.id:'rg', won); if(_ci) return `<img src="${_ci.url}" alt="Selo final" style="width:100%;height:100%;object-fit:contain;${_ci.gray?'filter:grayscale(1);opacity:.55':''}"/>`;
  const id='fm'+(FMID++);
  // cópia do selo final: anel grosso aberto no alto à direita, seta no topo, logo JurisClub dentro, cadeado quando bloqueado
  const ring = won ? '#ffc83d' : '#6c66c4', txt = won ? '#ffffff' : '#6c66c4', word = won ? '#ffffff' : '#5f5aab',
        pill = won ? '#3b82f6' : '#283489', pillT = won ? '#ffffff' : '#8d86d8', sf = won ? '#ffd86b' : '#7b74d0';
  return `<svg viewBox="0 0 160 160" role="img" aria-label="Selo final JurisClub${won?' conquistado':' bloqueado'}">
    <defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${won?'#a855f7':'#3a238f'}"/><stop offset="1" stop-color="${won?'#3b82f6':'#25358f'}"/></linearGradient></defs>
    <circle cx="80" cy="80" r="77" fill="#070b3c"/>
    <circle cx="80" cy="80" r="64" fill="#140f4c"/>
    ${arcArrow(80,80,68,-20,266,7.5,ring,ring,1.45)}
    <text x="80" y="35" text-anchor="middle" font-family="VT323,monospace" font-size="10" letter-spacing="1.6" fill="${sf}">SELO FINAL</text>
    ${arcArrow(82,96,49,192,262,3,`url(#${id})`,won?'#3b82f6':'#25358f',1.9)}
    <path d="M44 103 A45 45 0 0 1 52 66" fill="none" stroke="${won?'#7c3aed':'#2c1f7a'}" stroke-width="1.4"/>
    <path d="M92 131 A37 37 0 0 0 116 109" fill="none" stroke="${won?'#7c3aed':'#2c1f7a'}" stroke-width="1.6"/>
    <rect x="47.5" y="65.5" width="49.5" height="10" rx="5" fill="${pill}"/>
    <text x="72.2" y="73.3" text-anchor="middle" font-family="Montserrat,sans-serif" font-weight="900" font-size="6.6" textLength="37" lengthAdjust="spacingAndGlyphs" fill="${pillT}">REVISÃO</text>
    <text x="49" y="91.5" font-family="Montserrat,sans-serif" font-weight="900" font-style="italic" font-size="20" textLength="86" lengthAdjust="spacingAndGlyphs" fill="${word}">JurisClub</text>
    <text x="49.5" y="102.3" font-family="Montserrat,sans-serif" font-weight="500" font-size="9" textLength="62" lengthAdjust="spacingAndGlyphs" fill="${txt}">O seu Clube de</text>
    <text x="49.5" y="112.3" font-family="Montserrat,sans-serif" font-weight="800" font-size="9" textLength="58" lengthAdjust="spacingAndGlyphs" fill="${txt}">Atualizações</text>
    <text x="49.5" y="126.5" font-family="Montserrat,sans-serif" font-weight="900" font-size="16" textLength="40.5" lengthAdjust="spacingAndGlyphs" fill="${txt}">2026</text>
    ${won?'':`<g fill="#7b74d0"><path d="M74.5 89 v-4.2 a5.5 5.5 0 0 1 11 0 v4.2 h-2.6 v-4.2 a2.9 2.9 0 0 0 -5.8 0 v4.2z"/><rect x="71" y="88.5" width="18" height="15" rx="1"/></g><rect x="78.2" y="94" width="3.6" height="3" fill="#140f4c"/>`}
  </svg>`;
}

/* =========================================================
   LABIRINTO
   ========================================================= */
function rng(seed){ let a=seed>>>0; return ()=>{ a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const D4 = [[1,0],[-1,0],[0,1],[0,-1]];
function genMaze(cols, rows, seed, extra=.07){
  const R=rng(seed), g=Array.from({length:rows},()=>Array(cols).fill(1));
  const cw=(cols-1)/2, ch=(rows-1)/2, vis=Array.from({length:ch},()=>Array(cw).fill(false));
  const st=[[0,ch-1]]; vis[ch-1][0]=true; g[2*(ch-1)+1][1]=0;
  while(st.length){
    const [cx,cy]=st[st.length-1];
    const n=D4.map(([dx,dy])=>[cx+dx,cy+dy,dx,dy]).filter(([x,y])=>x>=0&&y>=0&&x<cw&&y<ch&&!vis[y][x]);
    if(!n.length){ st.pop(); continue; }
    const [x,y,dx,dy]=n[Math.floor(R()*n.length)];
    vis[y][x]=true; g[2*cy+1+dy][2*cx+1+dx]=0; g[2*y+1][2*x+1]=0; st.push([x,y]);
  }
  for(let cy=0;cy<ch;cy++) for(let cx=0;cx<cw;cx++){
    const x=2*cx+1, y=2*cy+1;
    if(D4.filter(([dx,dy])=>g[y+dy][x+dx]===0).length===1){
      const c=D4.filter(([dx,dy])=>{const wx=x+dx,wy=y+dy; return g[wy][wx]===1&&wx>0&&wy>0&&wx<cols-1&&wy<rows-1;});
      if(c.length){ const [dx,dy]=c[Math.floor(R()*c.length)]; g[y+dy][x+dx]=0; }
    }
  }
  for(let y=1;y<rows-1;y++) for(let x=1;x<cols-1;x++) if(g[y][x]===1 && ((x%2===0)!==(y%2===0)) && R()<extra) g[y][x]=0;
  return g;
}
function drawWalls(ctx, g, T, {neon='#6d3cff', inner='#060a33', glow='#8b5cf6', w=.36}={}){
  const rows=g.length, cols=g[0].length; ctx.beginPath();
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
    if(!g[y][x]) continue;
    const cx=(x+.5)*T, cy=(y+.5)*T; let any=false;
    if(x+1<cols&&g[y][x+1]){ ctx.moveTo(cx,cy); ctx.lineTo(cx+T,cy); any=true; }
    if(y+1<rows&&g[y+1][x]){ ctx.moveTo(cx,cy); ctx.lineTo(cx,cy+T); any=true; }
    if(!any && !(x>0&&g[y][x-1]) && !(y>0&&g[y-1][x])){ ctx.moveTo(cx,cy); ctx.lineTo(cx+.01,cy); }
  }
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.strokeStyle=neon; ctx.lineWidth=T*w; ctx.shadowColor=glow; ctx.shadowBlur=T*.7; ctx.stroke();
  ctx.shadowBlur=0; ctx.stroke();
  ctx.strokeStyle=inner; ctx.lineWidth=Math.max(1, T*w - Math.max(2, T*.1)*2); ctx.stroke();
}

/* =========================================================
   JOGO
   ========================================================= */
const COLS=27, ROWS=15;
const canvas=$('#game'), ctx=canvas.getContext('2d');
const wallLayer=document.createElement('canvas');
let TS=24;
const DIRS={up:{dx:0,dy:-1},down:{dx:0,dy:1},left:{dx:-1,dy:0},right:{dx:1,dy:0}};
const G = {mode:'attract', day:1, t:0, maze:null, dots:null, dotsLeft:0, teses:[], player:null, traps:[], want:null,
  lives:CONFIG.vidas, score:0, parts:{lab:0,tese:0,vida:0}, fright:0, shake:0, readyT:0, dieT:0, overT:0, particles:[], floats:[], replay:false, distCache:null, distKey:''};

const open = (x,y) => x>=0&&y>=0&&x<COLS&&y<ROWS&&G.maze[y][x]===0;
function mkEnt(x,y,speed){ return {x,y,nx:x,ny:y,p:0,moving:false,dir:null,speed,face:1}; }
const posE = e => ({x:e.x+(e.nx-e.x)*e.p, y:e.y+(e.ny-e.y)*e.p});
function bfs(sx,sy){
  const d=new Int16Array(COLS*ROWS).fill(-1), q=[sx+sy*COLS]; d[q[0]]=0;
  for(let h=0;h<q.length;h++){ const i=q[h], x=i%COLS, y=(i/COLS)|0;
    for(const [dx,dy] of D4){ const nx=x+dx, ny=y+dy; if(open(nx,ny) && d[nx+ny*COLS]<0){ d[nx+ny*COLS]=d[i]+1; q.push(nx+ny*COLS);} } }
  return d;
}

function loadDay(n){
  n=Number(n); if(!DIAS[n]){ n=hoje(); if(n==null) return; } // dia removido/ausente: cai no dia atual
  G.day=n; S.sel=n; save(); stageSel=n;
  G.maze=genMaze(COLS,ROWS,1000+n*7919);
  G.replay=dayComplete(n);
  buildWallLayer();
  resetBoard(true);
  setMode('attract');
  $('#atTitle').textContent=`DIA ${dd(pos(n))}`; $('#atTitle').dataset.t=`DIA ${dd(pos(n))}`;
  $('#atSub').textContent=((DIAS[n]&&DIAS[n].titulo)||'').toUpperCase();
  const left = getTeses(n).length - (G.replay?0:domOf(n).length);
  $('#atDesc').textContent = G.replay
    ? `Dia concluído. Jogue de novo para revisar as ${getTeses(n).length} teses e melhorar sua pontuação.`
    : `${left} ${left===1?'tese':'teses'} para dominar: pegue os pontos dourados e responda. Fuja das armadilhas.`;
  renderAll();
}
function resetBoard(full){
  const R=rng(Date.now()&0xffff);
  if(full){
    G.dots=new Uint8Array(COLS*ROWS); G.dotsLeft=0;
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(open(x,y)){ G.dots[x+y*COLS]=1; G.dotsLeft++; }
    const P=[[13,1],[13,ROWS-2]]; P.forEach(([x,y])=>{ if(open(x,y)){ if(G.dots[x+y*COLS]===1) G.dotsLeft--; G.dots[x+y*COLS]=2; } });
    G.dots[1+(ROWS-2)*COLS]=0; G.dotsLeft--;
    // teses
    const all=getTeses(G.day), dom=domOf(G.day);
    const pend = all.map((_,i)=>i).filter(i=>G.replay || !dom.includes(i));
    G.teses=[]; const d0=bfs(1,ROWS-2);
    const cand=[]; for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(open(x,y) && d0[x+y*COLS]>=8 && G.dots[x+y*COLS]!==2) cand.push([x,y]);
    for(let i=cand.length-1;i>0;i--){ const j=Math.floor(R()*(i+1)); [cand[i],cand[j]]=[cand[j],cand[i]]; }
    let minD=9;
    while(G.teses.length<pend.length && minD>=0){
      for(const [x,y] of cand){ if(G.teses.length>=pend.length) break;
        if(G.teses.every(t=>Math.abs(t.x-x)+Math.abs(t.y-y)>=minD)) G.teses.push({x,y,idx:pend[G.teses.length]}); }
      minD-=2;
    }
  }
  G.player=mkEnt(1,ROWS-2,6.4); G.want=null;
  const lvl=1+(G.day-1)*.025;
  const spawns=[[COLS-2,1,'peg',0],[COLS-2,ROWS-2,'sum',2.5],[1,1,'inf',5],[13,7,'peg',8]];
  const count = G.day<=2?2 : G.day<=8?3 : 4;
  G.traps=spawns.slice(0,count).map(([x,y,k,w])=>{
    const sp = {peg:5.6,sum:4.1,inf:5.0}[k]*lvl;
    const e=mkEnt(x,y,sp); e.k=k; e.sx=x; e.sy=y; e.wait=w; e.out=0; return e;
  });
  G.fright=0; G.distKey='';
}

function buildWallLayer(){
  wallLayer.width=COLS*TS; wallLayer.height=ROWS*TS;
  const c=wallLayer.getContext('2d'); c.fillStyle='#03061f'; c.fillRect(0,0,wallLayer.width,wallLayer.height);
  if(G.maze) drawWalls(c,G.maze,TS,{neon:'#5b2fe0',inner:'#04082a',glow:'#7c4dff',w:.34});
}
function resize(){
  const w=canvas.clientWidth||600, dpr=Math.min(2,window.devicePixelRatio||1);
  TS=Math.max(6,Math.floor(w*dpr/COLS)); canvas.width=COLS*TS; canvas.height=ROWS*TS; buildWallLayer();
}

const IC_PAUSE='<svg viewBox="0 0 10 10" aria-hidden="true"><path fill="currentColor" d="M2 1h2.2v8H2zM5.8 1h2.2v8H5.8z"/></svg>';
const IC_PLAY='<svg viewBox="0 0 10 10" aria-hidden="true"><path fill="currentColor" d="M2.5 1 L9 5 L2.5 9 Z"/></svg>';
function setMode(m){
  G.mode=m;
  $('#ovAttract').hidden = m!=='attract';
  $('#ovReady').hidden = m!=='ready';
  $('#ovPause').hidden = m!=='paused';
  $('#ovOver').hidden = m!=='gameover';
  $('#ovClear').hidden = m!=='clear';
  document.querySelectorAll('#leds i').forEach((l,i)=>l.classList.toggle('on', m==='play' ? true : i===0));
  // Botão PAUSA mostra ▶ (play) quando o jogo está pausado; senão as 2 barrinhas de pause.
  const cp=$('#capPause'); if(cp) cp.innerHTML = (m==='paused') ? IC_PLAY : IC_PAUSE;
}
function startRun(){
  SFX.init(); if(G.mode!=='attract') return;
  G.lives=CONFIG.vidas; G.score=0; G.parts={lab:0,tese:0,vida:0};
  resetBoard(true); SFX.start(); ready(1.6);
}
function ready(t){ G.readyT=t; $('#readyTxt').textContent='PRONTO?'; setMode('ready'); renderHud(); }

function setWant(name){
  const d=DIRS[name]; if(!d) return; G.want=d;
  const p=G.player;
  if(G.mode==='play' && p.moving && p.dir && d.dx===-p.dir.dx && d.dy===-p.dir.dy){
    [p.x,p.nx]=[p.nx,p.x]; [p.y,p.ny]=[p.ny,p.y]; p.p=1-p.p; p.dir=d; if(d.dx) p.face=d.dx;
  }
}
function tryGo(e,d){ if(d && open(e.x+d.dx,e.y+d.dy)){ e.dir=d; e.nx=e.x+d.dx; e.ny=e.y+d.dy; e.moving=true; if(d.dx) e.face=d.dx; return true; } return false; }

function updPlayer(dt){
  const p=G.player;
  if(!p.moving){ p.p=0; tryGo(p,G.want); return; }
  p.p+=p.speed*dt;
  while(p.p>=1){
    p.p-=1; p.x=p.nx; p.y=p.ny; arrive();
    if(G.mode!=='play'){ p.moving=false; p.p=0; return; }
    if(!(G.want && tryGo(p,G.want)) && !tryGo(p,p.dir)){ p.moving=false; p.p=0; break; }
  }
}
function arrive(){
  const p=G.player, i=p.x+p.y*COLS;
  if(G.dots[i]===1){ G.dots[i]=0; G.dotsLeft--; addPts(CONFIG.pontos.ponto,'lab'); SFX.waka(); G.chompT=.12;
    if(G.dotsLeft<=0){ addPts(CONFIG.pontos.labirintoLimpo,'lab'); float(p.x,p.y,'LABIRINTO LIMPO +500','#3fd5ff'); SFX.power(); } }
  else if(G.dots[i]===2){ G.dots[i]=0; addPts(CONFIG.pontos.vadeMecum,'lab'); G.fright=7; SFX.power();
    float(p.x,p.y,'VADE MECUM!','#3fd5ff'); burst(p.x,p.y,'#3fd5ff',18);
    G.traps.forEach(t=>{ if(t.moving){ [t.x,t.nx]=[t.nx,t.x]; [t.y,t.ny]=[t.ny,t.y]; t.p=1-t.p; t.dir={dx:-t.dir.dx,dy:-t.dir.dy}; } t.eaten=false; }); }
  const ti=G.teses.findIndex(t=>t.x===p.x&&t.y===p.y);
  if(ti>=0){ G.happyT=1; SFX.tese(); burst(p.x,p.y,'#ffc83d',22); openQuestion(ti); }
}
function addPts(v,part){ G.score+=v; G.parts[part]+=v; }

function chooseTrap(t){
  const opts=D4.filter(([dx,dy])=>open(t.x+dx,t.y+dy));
  let c = opts.length>1 && t.dir ? opts.filter(([dx,dy])=>!(dx===-t.dir.dx&&dy===-t.dir.dy)) : opts;
  if(!c.length) c=opts; if(!c.length) return;
  let pick;
  const pl=G.player, R=Math.random;
  const dist = d => (x,y)=>{ const v=d[x+y*COLS]; return v<0?999:v; };
  if(G.mode==='attract'){ pick=c[Math.floor(R()*c.length)]; }
  else if(G.fright>0){
    const dp=dist(playerDist()); c.sort((a,b)=>dp(t.x+b[0],t.y+b[1])-dp(t.x+a[0],t.y+a[1]));
    pick = R()<.75 ? c[0] : c[Math.floor(R()*c.length)];
  } else {
    let dm;
    if(t.k==='peg') dm=dist(playerDist());
    else if(t.k==='sum') dm = R()<.35 ? dist(playerDist()) : null;
    else { const d=G.player.dir||{dx:0,dy:0}; let tx=pl.x+d.dx*4, ty=pl.y+d.dy*4; if(!open(tx,ty)){tx=pl.x;ty=pl.y;} dm=dist(bfs(tx,ty)); }
    if(dm){ c.sort((a,b)=>dm(t.x+a[0],t.y+a[1])-dm(t.x+b[0],t.y+b[1])); pick=c[0]; }
    else pick=c[Math.floor(R()*c.length)];
  }
  tryGo(t,{dx:pick[0],dy:pick[1]});
}
function playerDist(){ const k=G.player.x+','+G.player.y; if(k!==G.distKey){ G.distKey=k; G.distCache=bfs(G.player.x,G.player.y);} return G.distCache; }
function updTraps(dt){
  for(const t of G.traps){
    if(t.wait>0){ t.wait-=dt; continue; }
    if(t.out>0){ t.out-=dt; if(t.out<=0){ t.x=t.nx=t.sx; t.y=t.ny=t.sy; t.p=0; t.moving=false; t.dir=null; } continue; }
    const sp = t.speed * (G.mode==='attract'?.55 : (G.fright>0 && !t.eaten ? .55 : 1));
    if(!t.moving){ t.p=0; chooseTrap(t); if(!t.moving) continue; }
    t.p+=sp*dt;
    while(t.p>=1){ t.p-=1; t.x=t.nx; t.y=t.ny; t.moving=false; chooseTrap(t); if(!t.moving){t.p=0;break;} }
  }
}
function collide(){
  const a=posE(G.player);
  for(const t of G.traps){
    if(t.wait>0||t.out>0) continue;
    const b=posE(t); if(Math.hypot(a.x-b.x,a.y-b.y)<.62){
      if(G.fright>0 && !t.eaten){ t.eaten=true; t.out=3.5; addPts(CONFIG.pontos.armadilha,'lab'); SFX.eat(); burst(b.x,b.y,TRAP_DEF[t.k].cor,20); float(b.x,b.y,`${TRAP_DEF[t.k].nome.toUpperCase()} SUPERADA +200`,'#fff'); }
      else { die(); return; }
    }
  }
}
function die(){ setMode('dying'); G.dieT=1.4; SFX.die(); shake(); const p=posE(G.player); burst(p.x,p.y,'#ffc83d',30); }
function loseLife(){
  G.lives--; renderHud();
  if(G.lives<=0){ gameOver(); return true; }
  return false;
}
function gameOver(){
  G.best_save(); setMode('gameover'); G.overT=9.99; SFX.over(); renderAll();
}
G.best_save = function(){
  if(G.score > (S.best[G.day]||0)) S.best[G.day]=G.score;
  if(G.score > S.recorde) S.recorde=G.score;
  save();
};
function continueRun(){
  SFX.init(); SFX.start();
  G.lives=CONFIG.vidas; G.replay=dayComplete(G.day) && G.replay;
  resetBoard(true); ready(1.4);
}
function dayClear(){
  const bonus=G.lives*CONFIG.pontos.vida; G.parts.vida=bonus; G.score+=bonus;
  const before=new Set(MATERIAS.filter(matDone).map(m=>m.id));
  G.best_save();
  setMode('clear'); SFX.clear(); shake(.4);
  for(let i=0;i<5;i++) setTimeout(()=>burst(Math.random()*COLS,Math.random()*ROWS*.6,['#ffc83d','#c08cff','#3fd5ff'][i%3],26),i*220);
  const isFinal = isFinalDay(G.day);
  $('#clTitle').textContent = isFinal ? 'DESAFIO CONCLUÍDO!' : `DIA ${dd(pos(G.day))} CONCLUÍDO`;
  const rows=[['Pontos no labirinto',G.parts.lab],[`Teses dominadas ×${CONFIG.pontos.tese}`,G.parts.tese],[`Vidas restantes ×${CONFIG.pontos.vida}`,bonus],['TOTAL',G.score]];
  const tl=$('#clTally'); tl.innerHTML=rows.map(([l],i)=>`<span class="${i===3?'tot':''}">${l}</span><b class="${i===3?'tot':''}" data-v="${rows[i][1]}">000000</b>`).join('');
  tl.querySelectorAll('b').forEach((b,i)=>{ const v=+b.dataset.v; let k=0; const st=Math.max(1,Math.ceil(v/24));
    setTimeout(()=>{ const iv=setInterval(()=>{ k=Math.min(v,k+st); b.textContent=pad(k); SFX.tick(); if(k>=v) clearInterval(iv); },30); }, i*450); });
  const won = MATERIAS.find(m=>matDone(m) && !before.has(m.id));
  const cs=$('#clSelo');
  if(isFinal && dayComplete(G.day)){ cs.innerHTML=`<div class="selo-won">${finalMedal(true)}</div>`; setTimeout(()=>SFX.selo(),1900); }
  else if(won){ cs.innerHTML=`<div class="selo-won">${medal(won,true)}</div><p>Selo ${won.nome} conquistado!</p>`; setTimeout(()=>SFX.selo(),1900); }
  else cs.innerHTML='';
  const _ci=VORD.indexOf(G.day), next = _ci>=0 && _ci<VORD.length-1 ? VORD[_ci+1] : null;
  $('#btnNext').hidden = !next || !dayUnlocked(next);
  renderAll();
}

/* ---------- perguntas ---------- */
let Q=null;
function openQuestion(ti){
  setMode('question');
  const t=G.teses[ti], all=getTeses(G.day), q=all[t.idx];
  Q={ti, q, idx:t.idx, time:CONFIG.tempoResposta, done:false};
  $('#qTag').textContent=`TESE ${t.idx+1} · DIA ${dd(pos(G.day))} · ${matOf(G.day).curto}`;
  $('#qText').textContent=q.q;
  $('#qOpts').innerHTML=q.o.map((o,i)=>`<button class="opt" data-i="${i}"><span class="k">${'ABC'[i]}</span><span>${o}</span></button>`).join('');
  $('#qRes').hidden=true; $('#qBar').classList.remove('hot');
  $('#qModal').hidden=false;
  setTimeout(()=>$('#qOpts .opt')?.focus(),50);
}
function answer(i){
  if(!Q||Q.done) return; Q.done=true;
  const ok = i===Q.q.a;
  document.querySelectorAll('#qOpts .opt').forEach((b,k)=>{ b.disabled=true; if(k===Q.q.a) b.classList.add('right'); if(k===i && !ok) b.classList.add('wrong'); });
  const h=$('#qResT');
  if(ok){
    h.textContent=`TESE DOMINADA! +${CONFIG.pontos.tese}`; h.className='ok'; SFX.ok(); addPts(CONFIG.pontos.tese,'tese');
    const d=S.dom[G.day]||(S.dom[G.day]=[]); if(!d.includes(Q.idx)){ d.push(Q.idx); save(); }
  } else {
    h.textContent = i<0 ? 'TEMPO ESGOTADO! −1 VIDA' : 'A PEGADINHA TE PEGOU! −1 VIDA'; h.className='bad'; SFX.bad(); shake();
  }
  Q.ok=ok;
  $('#qRef').textContent=Q.q.ref+' · '+Q.q.tema;
  $('#qTese').textContent=Q.q.tese;
  $('#qRes').hidden=false; $('#qNext').focus();
  renderAll();
}
function closeQuestion(){
  if(!Q||!Q.done) return;
  $('#qModal').hidden=true;
  const t=G.teses[Q.ti];
  if(Q.ok){ G.happyT=1.4; G.teses.splice(Q.ti,1); float(t.x,t.y,'+100','#ffc83d'); }
  else {
    const d=bfs(G.player.x,G.player.y), c=[];
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(open(x,y)&&d[x+y*COLS]>=7&&!G.teses.some(o=>o.x===x&&o.y===y)) c.push([x,y]);
    if(c.length){ const [x,y]=c[Math.floor(Math.random()*c.length)]; t.x=x; t.y=y; }
  }
  const wasOk=Q.ok; Q=null;
  if(wasOk && G.teses.length===0){ dayClear(); return; }
  if(!wasOk && loseLife()) return;
  ready(.9);
}

/* ---------- efeitos ---------- */
function burst(x,y,color,n=16){ if(RM) n=Math.min(n,6); for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2, s=2+Math.random()*6; G.particles.push({x:x+.5,y:y+.5,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.6+Math.random()*.5,c:color}); } }
function float(x,y,txt,c){ G.floats.push({x:x+.5,y:y+.2,txt,c,life:1.2}); }
function shake(v=.5){ if(RM) return; G.shake=v; const s=$('#screen'); s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); }

/* ---------- loop ---------- */
let last=performance.now();
function loop(ts){
  const dt=Math.min(.05,(ts-last)/1000); last=ts; G.t+=dt;
  update(dt); render();
  requestAnimationFrame(loop);
}
function update(dt){
  switch(G.mode){
    case 'attract': updTraps(dt); break;
    case 'ready':
      G.readyT-=dt; if(G.readyT<.45) $('#readyTxt').textContent='VAI!';
      if(G.readyT<=0) setMode('play'); break;
    case 'play':
      updPlayer(dt); if(G.mode!=='play') break;
      updTraps(dt); collide();
      if(G.fright>0){ G.fright-=dt; if(G.fright<=0) G.fright=0; }
      break;
    case 'dying':
      G.dieT-=dt; if(G.dieT<=0){ if(!loseLife()){ resetBoard(false); ready(1.2); } } break;
    case 'gameover':{
      const before=Math.ceil(G.overT); G.overT-=dt; const now=Math.max(0,Math.ceil(G.overT));
      if(now!==before){ $('#overCount').textContent=now; if(now>0) SFX.tick(); }
      if(G.overT<=0) loadDay(G.day);
      break; }
    case 'question':
      if(Q && !Q.done){ Q.time-=dt; $('#qTime').textContent=Math.ceil(Math.max(0,Q.time));
        $('#qBar i').style.transform=`scaleX(${Math.max(0,Q.time/CONFIG.tempoResposta)})`;
        if(Q.time<6) $('#qBar').classList.add('hot');
        if(Q.time<=0) answer(-1); }
      break;
  }
  G.shake=Math.max(0,G.shake-dt);
  G.happyT=Math.max(0,(G.happyT||0)-dt); G.chompT=Math.max(0,(G.chompT||0)-dt);
  { const mv=G.player?.moving && G.mode==='play'; G.walkPh=((G.walkPh||0)+dt*(mv?4:0))%1; G.spin=((G.spin||0)+dt*(mv?140:35))%360; }
  G.particles=G.particles.filter(p=>{ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=.92; p.vy*=.92; p.life-=dt; return p.life>0; });
  G.floats=G.floats.filter(f=>{ f.y-=dt*1.2; f.life-=dt; return f.life>0; });
  $('#vmBar i').style.width = (G.fright/7*100)+'%';
  if(G.mode==='play'||G.mode==='ready') renderHudLive();
}
function render(){
  const T=TS; ctx.setTransform(1,0,0,1,0,0); ctx.imageSmoothingEnabled=false;
  ctx.drawImage(wallLayer,0,0);
  if(G.shake>0){ ctx.setTransform(1,0,0,1,(Math.random()-.5)*T*.5*G.shake,(Math.random()-.5)*T*.5*G.shake); }
  // pontos
  const t=G.t;
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
    const v=G.dots?.[x+y*COLS]; if(!v) continue;
    if(v===1){ const s=Math.max(2,T*.14); ctx.fillStyle='#b9b4ff'; ctx.fillRect((x+.5)*T-s/2,(y+.5)*T-s/2,s,s); }
    else { // Vade Mecum
      if(Math.floor(t*4)%2===0){ const r=ICON.book, s=T*.75/9; ctx.fillStyle='#3fd5ff'; ctx.shadowColor='#3fd5ff'; ctx.shadowBlur=T*.6;
        r.forEach((row,yy)=>{ for(let xx=0;xx<row.length;xx++) if(row[xx]!=='.') ctx.fillRect(x*T+T*.125+xx*s, y*T+T*.125+yy*s, Math.ceil(s), Math.ceil(s)); }); ctx.shadowBlur=0; }
    }
  }
  // teses (pontos dourados)
  for(const g of G.teses){
    const pul=.5+.5*Math.sin(t*5+g.x), s=T*(.38+.08*pul), cx=(g.x+.5)*T, cy=(g.y+.5)*T;
    ctx.shadowColor='#ffc83d'; ctx.shadowBlur=T*(.6+.5*pul); ctx.fillStyle='#ffc83d'; ctx.fillRect(cx-s/2,cy-s/2,s,s); ctx.shadowBlur=0;
    ctx.fillStyle='#fff6d0'; ctx.fillRect(cx-s/2,cy-s/2,s*.35,s*.35);
    const sp=(t*2+g.y)%2; if(sp<1){ ctx.fillStyle=`rgba(255,255,255,${1-sp})`; const a=T*.5*sp+T*.3; ctx.fillRect(cx-1,cy-a,2,a*.3); ctx.fillRect(cx+a*.7,cy-1,a*.3,2); }
  }
  // armadilhas
  for(const tr of G.traps){
    if(tr.wait>0 && G.mode!=='attract'){ // ainda “nascendo”
      const p=posE(tr); ctx.globalAlpha=.25+.2*Math.sin(t*10); drawSpr(SPR[tr.k],p.x,p.y,T*.86,1); ctx.globalAlpha=1; continue; }
    if(tr.out>0){ const p=posE(tr); ctx.globalAlpha=.5; ctx.fillStyle='#fff'; const s=T*.12; ctx.fillRect((p.x+.35)*T,(p.y+.4)*T,s,s); ctx.fillRect((p.x+.55)*T,(p.y+.4)*T,s,s); ctx.globalAlpha=1; continue; }
    const p=posE(tr); let img=SPR[tr.k];
    if(G.fright>0 && !tr.eaten) img = (G.fright<2 && Math.floor(t*6)%2) ? SPR.white[tr.k] : SPR.fright[tr.k];
    let a=1; if(tr.k==='inf' && !(G.fright>0)){ const c=t%3.2; a = c<2 ? 1 : c<2.2 ? (Math.random()<.5?.15:.8) : .08; }
    ctx.globalAlpha=a; const bob=Math.sin(t*8+tr.sx)*T*.04;
    drawSpr(img,p.x,p.y+bob/T,T*.86,1); ctx.globalAlpha=1;
  }
  // jogador
  if(G.player){
    const p=posE(G.player), f=G.player.face||1;
    const pl=G.player, dir=pl.dir||{dx:0,dy:0}, dying=G.mode==='dying';
    drawMascot(MASCX,{t, walk: (pl.moving&&G.mode==='play')?G.walkPh:null, look:{x:dir.dx?1:0,y:dir.dy}, blink:(t%3.4)<.12, happy:G.happyT>0, mouth:G.chompT>0, dead:dying, power:G.fright>0 && !(G.fright<2 && Math.floor(t*8)%2), spin:(G.spin||0)});
    const sc=T*.92/11, w=MW*sc, h=MH*sc, cx=(p.x+.5)*T, cy=(p.y+.5)*T;
    ctx.save(); ctx.translate(cx,cy);
    if(dying){ const k=Math.max(0,G.dieT/1.4); ctx.rotate((1-k)*7); ctx.scale(k,k); }
    if(f<0) ctx.scale(-1,1);
    ctx.shadowColor=G.fright>0?'#3fd5ff':'#9b7bff'; ctx.shadowBlur=T*.35;
    ctx.drawImage(MASC,-MCX*sc,-(MCY+MTOP)*sc-T*.04,w,h);
    ctx.restore(); ctx.shadowBlur=0;
  }
  // partículas
  for(const q of G.particles){ ctx.globalAlpha=Math.min(1,q.life*2); ctx.fillStyle=q.c; const s=Math.max(2,T*.12); ctx.fillRect(q.x*T-s/2,q.y*T-s/2,s,s); }
  ctx.globalAlpha=1;
  ctx.textAlign='center'; ctx.font=`${Math.round(T*.85)}px VT323, monospace`;
  for(const f of G.floats){ ctx.globalAlpha=Math.min(1,f.life*1.5); ctx.fillStyle='#000'; ctx.fillText(f.txt,f.x*T+2,f.y*T+2); ctx.fillStyle=f.c; ctx.fillText(f.txt,f.x*T,f.y*T); }
  ctx.globalAlpha=1;
}
function drawSpr(img,x,y,size,flip){
  const T=TS, cx=(x+.5)*T, cy=(y+.5)*T;
  const ww = img.height>img.width ? size*img.width/img.height : size, hh = img.height>img.width ? size : size*img.height/img.width;
  if(flip<0){ ctx.save(); ctx.translate(cx,cy); ctx.scale(-1,1); ctx.drawImage(img,-ww/2,-hh/2,ww,hh); ctx.restore(); }
  else ctx.drawImage(img,cx-ww/2,cy-hh/2,ww,hh);
}

/* =========================================================
   PAINÉIS
   ========================================================= */
const heart = (lost) => `<svg viewBox="0 0 7 6" shape-rendering="crispEdges" class="${lost?'lost':''}"><path fill="#ff4f9a" d="${pxPath(ICON.heart)}"/></svg>`;
let hudLast='';
function renderHudLive(){
  const all=getTeses(G.day).length, got = G.replay ? all-G.teses.length : domOf(G.day).length;
  const k=G.score+'|'+got+'|'+G.lives+'|'+G.day;
  if(k===hudLast) return; hudLast=k;
  $('#hudScore').textContent=pad(G.score);
  $('#hudDay').textContent=G.day;
  $('#hudTeses').textContent=`${got}/${all}`;
  $('#hudLives').innerHTML=Array.from({length:CONFIG.vidas},(_,i)=>heart(i>=G.lives)).join('');
}
function renderHud(){ hudLast=''; renderHudLive(); }

function stateOf(n){ const done=dayComplete(n), un=dayUnlocked(n), cur=hoje(); return done?'done' : (n===cur?'current' : un?'avail':'locked'); }
const STAT_TXT={done:'CONCLUÍDO',current:'HOJE',avail:'DISPONÍVEL',locked:'BLOQUEADO'};
const MCOL={adm:'#a78bfa',civ:'#3fd5ff',con:'#ff6fae',pre:'#4ef0a0',pc:'#ffa53d',tra:'#ff7a59',tri:'#ffd84d',rg:'#ffc83d'};
// Integração: cor configurável por matéria (MATERIAS[].cor) e pelo selo final (FINAL.cor) sobrescreve o padrão.
try{ (MATERIAS||[]).forEach(m=>{ if(m&&m.id&&m.cor) MCOL[m.id]=m.cor; }); if(typeof FINAL!=='undefined'&&FINAL&&FINAL.cor) MCOL[FINAL.id]=FINAL.cor; }catch(e){}
// Ícone: imagem própria por matéria (MATERIAS[].iconeImg) tem prioridade sobre a pixel art (pxSvg).
function iconHtml(m){ const u=m&&m.iconeImg; return u?`<img src="${u}" alt="" style="width:100%;height:100%;object-fit:contain">`:pxSvg(m.icon); }
let stageSel=null;
function renderStages(){
  if(stageSel==null) stageSel=G.day;
  const groups=[...MATERIAS, FINAL];
  $('#stages').innerHTML=groups.map((m,gi)=>{
    const _dias=diasDaMateria(m);
    const sts=_dias.map(stateOf);
    const won = matDone(m);
    const cst = won?'won' : sts.includes('current')?'current' : (sts.length && sts.every(x=>x==='locked'))?'locked':'avail';
    const badge = {won:'CLEAR ★',current:'NEW!',locked:'LOCKED',avail:'READY'}[cst];
    const hasSel=_dias.includes(stageSel);
    const btns=_dias.map(n=>{ const st=stateOf(n); return `<button class="cs ${st} ${n===stageSel?'sel':''}" data-day="${n}" aria-label="Dia ${pos(n)}: ${(DIAS[n]&&DIAS[n].titulo)||''}, ${STAT_TXT[st].toLowerCase()}" title="${(DIAS[n]&&DIAS[n].titulo)||''}">${dd(pos(n))}<i></i></button>`; }).join('');
    return `<div class="cart-wrap">${hasSel?'<span class="cart-cursor">▼ P1</span>':''}<div class="cart ${cst} ${hasSel?'sel':''}" data-cart="${gi}" style="--cc:${MCOL[m.id]}">
      <span class="cart-badge">${badge}</span><div class="cart-grip"></div>
      <div class="cart-label"><span class="cart-ic">${iconHtml(m)}</span><span class="cart-name">${((m.curto||m.nome)||({adm:'ADMINIST.',civ:'CIVIL',con:'CONSTITUC.',pre:'PREVIDENC.',pc:'PROC. CIVIL',tra:'TRABALHO',tri:'TRIBUTÁRIO',rg:'SELO FINAL'})[m.id]||'').toUpperCase()}</span></div>
      <div class="cart-stages">${btns}</div><div class="cart-pins"></div></div></div>`;
  }).join('');
  renderPreview();
}
function renderPreview(flick){
  const n=stageSel, m=matOf(n), st=stateOf(n), all=getTeses(n).length, dom=Math.min(all,domOf(n).length);
  const pv=$('#stPreview');
  // Dia bloqueado: se houver data de liberação (modo calendário), mostra "BLOQUEADO - DD/MM/AAAA" ao lado.
  const libData = st==='locked' ? dataLiberacao(n) : null;
  const tagTxt = libData ? `BLOQUEADO - ${libData}` : STAT_TXT[st];
  const tagStyle = libData ? ' style="font-size:11.5px"' : '';
  const btnTxt = st==='locked'
    ? (libData ? `ABRE EM ${libData}` : 'BLOQUEADO')
    : (st==='done'?'JOGAR DE NOVO ▸':'JOGAR ▸');
  pv.innerHTML=`<div class="pv-screen ${st} ${flick?'flick':''}" style="--cc:${MCOL[m.id]}">
      <div class="pv-top"><span>STAGE ${dd(pos(n))}</span><span class="tag ${st}"${tagStyle}>${tagTxt}</span></div>
      <div class="pv-main"><div class="pv-icon">${iconHtml(m)}</div><div><div class="pv-mat">${m.nome||(m===FINAL?'Selo final':'')}</div><div class="pv-title">${(DIAS[n]&&DIAS[n].titulo)||''}</div></div></div>
      <div class="pv-stats"><span>TESES <b>${dom}/${all}</b></span><span>MELHOR <b>${pad(S.best[n]||0)}</b></span></div>
      ${st==='locked'?`<div class="pv-lock">LOCKED</div>`:''}
    </div>
    <button class="btn-w pv-play" id="pvPlay" ${st==='locked'?'disabled':''}>${btnTxt}</button>`;
  $('#pvPlay').onclick=()=>{ if(!dayUnlocked(n)) return; if(G.day!==n||G.mode!=='attract') loadDay(n); $('#screen').scrollIntoView({behavior:RM?'auto':'smooth',block:'center'}); setTimeout(startRun, RM?0:350); };
}
function selectStage(n, opts={}){
  n=Number(n); if(!DIAS[n]) return;
  SFX.init(); stageSel=n;
  if(dayUnlocked(n)){ SFX.tone(660,.06,'square',.04); SFX.tone(990,.06,'square',.04,null,.06); if(G.day!==n && ['attract','gameover','clear'].includes(G.mode)) loadDay(n); else renderStages(); }
  else { SFX.locked(); renderStages(); }
  renderPreview(true);
  const c=document.querySelector(`.cs[data-day="${n}"]`)?.closest('.cart');
  if(c){ c.classList.remove('insert'); void c.offsetWidth; c.classList.add('insert'); c.scrollIntoView({behavior:RM?'auto':'smooth',block:'nearest',inline:'center'}); }
  if(!dayUnlocked(n)){ const b=document.querySelector(`.cs[data-day="${n}"]`); if(b){ b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); } }
}
const NIVEIS=['CONCURSEIRO(A)','ESTUDANTE DE SÚMULAS','ESTUDANTE DE SÚMULAS','ANALISTA DE TESES','ANALISTA DE TESES','PROCURADOR(A) EM FORMAÇÃO','PROCURADOR(A) EM FORMAÇÃO','MESTRE DA JURISPRUDÊNCIA'];
// Perfil real do aluno (backend via bootstrap) p/ o card do jogador e o ranking. Privacidade: iniciais.
function perfilJog(){ try{ return (window.DESAFIO && window.DESAFIO.PERFIL) || null; }catch(e){ return null; } }
// Foto de perfil = CAPIVARA (igual AvatarEstudante do app): a escolhida OU uma capi padrão determinística.
// Fundo = avatarCor; a capi usa object-contain com foco inferior (center 82%) p/ enquadrar bem.
const CAPI_POOL=['feliz','joinha','satisfeita','ideia','concluido','estudante','coracao','cafe','escrevendo','pensando','meditando','procurando'].map(id=>`/mascote/${id}.png`);
function capiHash(s){ let h=2166136261; s=String(s==null?'aluno':s)||'aluno'; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
function capiPadrao(seed){ return CAPI_POOL[capiHash(seed)%CAPI_POOL.length]; }
function avImg(r, cls){
  const url = (r && r.avatar) || capiPadrao(r && (r.ini||r.iniciais||r.nome));
  const bg = (r && r.avatarCor) ? `background:${r.avatarCor};` : '';
  return `<span class="${cls}" style="${bg}padding:0;overflow:hidden"><img src="${url}" alt="" style="width:100%;height:100%;object-fit:contain;object-position:center 82%;display:block"></span>`;
}
function renderPlayer(){
  const sc=selosCount(), lvl = matDone(FINAL) ? 'LENDA JURISCLUB' : NIVEIS[Math.min(sc, NIVEIS.length-1)];
  const pf = perfilJog(); const nomeJ = (pf && pf.nome) || 'Você'; const cargoJ = (pf && pf.cargo) || lvl; const cargoIc = (pf && pf.cargoIcone) || '';
  let totT=0, domT=0; for(const n of VORD){ const t=getTeses(n).length; totT+=t; domT+=Math.min(t,domOf(n).length); }
  const rows=rankRows('geral'), me=rows.find(r=>r.you)||{pos:99,pts:0,selos:0,you:true}, cur=hoje();
  const cells=VORD.map(n=>`<i class="${dayComplete(n)?'done':n===cur?'cur':''}" title="Dia ${pos(n)}"></i>`).join('');
  $('#p1').innerHTML=`
    <div class="p1-top"><span class="up">1UP</span>${avImg(pf,'avatar')}<div><b>${nomeJ}</b><small class="p1-cargo">${cargoIc}<span>${cargoJ}</span></small></div></div>
    <div class="p1-score"><small>PONTOS TOTAIS</small><span class="px">${pad(totalPts())}</span></div>
    <div class="p1-stats">
      <div><small>POSIÇÃO</small><span class="px">${me.pts?dd(me.pos)+'º':'--'}</span></div>
      <div><small>SELOS</small><span class="px">${sc}/${(MATERIAS||[]).length}</span></div>
      <div><small>TESES</small><span class="px">${domT}/${totT}</span></div>
    </div>
    <div class="p1-prog"><small><span>PROGRESSO</span><span>${VORD.filter(dayComplete).length}/${NDAYS} DIAS</span></small><div class="p1-cells">${cells}</div></div>`;
}
function medalBig(m, won){
  const _ci=seloImg(m&&m.id, won); if(_ci) return `<img src="${_ci.url}" alt="Selo ${m?m.nome:''}" style="width:100%;height:100%;object-fit:contain;${_ci.gray?'filter:grayscale(1);opacity:.55':''}"/>`;
  const col=MCOL[m.id], ring=won?'#ffc83d':'#3a3f9a', r=ICON[m.icon], sc=4.2, w=r[0].length*sc, h=r.length*sc;
  return `<svg viewBox="0 0 100 100" role="img" aria-label="Selo ${m.nome}${won?' conquistado':' bloqueado'}">
    <circle cx="50" cy="50" r="44" fill="${won?'#1d1638':'#0b1150'}" stroke="${ring}" stroke-width="2.5"/>
    ${arcArrow(50,50,36,-25,262,6,won?'#ffc83d':col,null,1.55,won?'':'opacity=".6"')}
    <circle cx="50" cy="50" r="27" fill="${col}" fill-opacity="${won?.18:.08}"/>
    <g transform="translate(${50-w/2} ${50-h/2}) scale(${sc})" shape-rendering="crispEdges"><path fill="${won?'#ffc83d':col}" fill-opacity="${won?1:.8}" d="${pxPath(r)}"/></g>
    ${won?`<g transform="translate(68 66)"><circle cx="9" cy="9" r="10" fill="#ffc83d"/><g transform="translate(3.5 3.5) scale(1.25)"><path fill="#1a1240" d="${pxPath(ICON.star)}"/></g></g>`
         :`<g transform="translate(68 66)"><circle cx="9" cy="9" r="10" fill="#0b1150" stroke="#5c61c4" stroke-width="1.5"/><g transform="translate(3.5 3.5) scale(1.25)"><path fill="#8f93e6" d="${pxPath(ICON.lock)}"/></g></g>`}
  </svg>`;
}
function renderSelos(){
  $('#selosCount').textContent=`${selosCount()}/${(MATERIAS||[]).length}`;
  $('#selos').innerHTML=MATERIAS.map((m,i)=>{
    const _d=diasDaMateria(m), tot=_d.length, k=_d.filter(dayComplete).length, won=matDone(m);
    return `<div class="sb ${won?'won':'locked'}" data-selo="${i}" role="button" tabindex="0" aria-label="Ampliar selo ${m.nome}" style="--d:${(i*.07).toFixed(2)}s;--cc:${MCOL[m.id]}"><span class="zoom-ic">⤢</span>
      <div class="sb-medal">${medalBig(m,won)}</div><b>${m.nome}</b>
      <small>${won?'★ CONQUISTADO':`${k}/${tot||0} dia(s)`}</small>
      <div class="sb-bar"><i style="width:${tot?k/tot*100:0}%"></i></div></div>`;
  }).join('');
  const done=VORD.filter(dayComplete).length, fw=matDone(FINAL);
  $('#seloFinal').innerHTML=`<div class="sfinal" data-selo="final" role="button" tabindex="0" aria-label="Ampliar selo final"><span class="zoom-ic">⤢</span>${finalMedal(fw)}<div><b>SELO FINAL<br>JURISCLUB</b><p>${fw?'Desafio concluído. Você é lenda!':`Conclua os ${NDAYS} dias para conquistar.`}</p><div class="sb-bar" style="--cc:#ffc83d"><i style="width:${NDAYS?done/NDAYS*100:0}%"></i></div><span class="px">${done}/${NDAYS} DIAS</span></div></div>`;
}
let lastDom='';
function renderTeses(){
  const all=getTeses(G.day), dom=domOf(G.day), key=G.day+':'+dom.join(',');
  const fresh = lastDom.startsWith(G.day+':') ? dom.filter(i=>!lastDom.split(':')[1].split(',').includes(String(i))) : [];
  lastDom=key;
  $('#tesesCount').textContent=`${Math.min(all.length,dom.length)}/${all.length}`;
  $('#tesesList').innerHTML = all.map((q,i)=>{
    const d=dom.includes(i);
    return d ? `<div class="tese dom ${fresh.includes(i)?'new':''}">${pxSvg('star','#ffc83d')}<div><div class="lb">DOMINADA</div><div class="nm">${q.tema}</div><div class="rf">${q.ref}</div></div><span class="no">${dd(i+1)}</span></div>`
             : `<div class="tese">${pxSvg('lock','#7f84d6')}<div><div class="lb">A DOMINAR</div><div class="nm">Pegue o ponto dourado</div></div><span class="no">${dd(i+1)}</span></div>`;
  }).join('');
}
function renderTraps(){
  const pips=n=>`<span class="pips">${[0,1,2,3,4].map(i=>`<i class="${i<n?'on':''}"></i>`).join('')}</span>`;
  const enemies=BESTS;
  const card=(o,i)=>{ const d=TRAP_DEF[o.k]; return `<div class="bx" data-bx="${o.k}" role="button" tabindex="0" aria-label="Ampliar ${d.nome}" style="--c:${d.cor};--d:${(i*.08).toFixed(2)}s"><span class="zoom-ic">⤢</span>
      <div class="bx-sprite ${o.k}"><img alt="" src="${spriteURL(SPR[o.k])}"></div>
      <div><div class="bx-name"><b>${d.nome}</b><span class="bx-chip">${o.chip}</span></div><p>${d.desc}</p>
      <div class="bx-stats"><span>VELOC.</span>${pips(o.vel)}<span>PERIGO</span>${pips(o.per)}</div>
      <small>APARECE: ${o.quando}</small></div></div>`; };
  const item=(cls,img,c,nome,chip,desc,extra,i)=>`<div class="bx" data-bx="${cls}" role="button" tabindex="0" aria-label="Ampliar ${nome}" style="--c:${c};--d:${(i*.08).toFixed(2)}s"><span class="zoom-ic">⤢</span>
      <div class="bx-sprite ${cls}"><img alt="" src="${img}"></div>
      <div><div class="bx-name"><b>${nome}</b><span class="bx-chip">${chip}</span></div><p>${desc}</p><small>${extra}</small></div></div>`;
  $('#trapsList').innerHTML =
    `<div class="bx-sec">INIMIGOS</div>`+enemies.map(card).join('')+
    `<div class="bx-sec">ITENS</div>`+
    item('gold',spriteURL(makeSprite(['XXX','XXX','XXX'],{X:'#ffc83d'}),9),'#ffc83d','Ponto dourado','TESE','Uma tese escondida no labirinto. Pegue e responda para dominar.',`+${CONFIG.pontos.tese} AO ACERTAR · ERRO CUSTA 1 VIDA`,3)+
    item('vm',spriteURL(makeSprite(ICON.book,{X:'#3fd5ff'}),4),'#3fd5ff','Vade Mecum','PODER','Por 7 segundos as armadilhas ficam azuis e fogem: encoste nelas para superá-las.',`2 POR LABIRINTO · +${CONFIG.pontos.armadilha} POR ARMADILHA`,4);
}

const SAMPLE=[['Lucas P.',1720,0],['Beatriz L.',1560,0],['Pedro H.',1530,0],['Fernanda V.',1470,0],['Camila R.',1460,0],['Rafael T.',1330,0],['Isabela D.',1290,0],['Larissa C.',1280,0],['Paula E.',1280,0],['Marina A.',1210,0]];
const ini = n => n.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
// Avatares de EXEMPLO p/ o preview do Designer quando ainda não há dados reais: usa as CAPIVARAS (capis)
// que são as fotos de perfil da plataforma (/mascote/<pose>.png). No aluno real, cada linha traz a capi
// de verdade (r.avatar). "pode deixar uns aleatórios" no designer.
const SAMPLE_GRAD=[['#8b5cf6','#3b82f6'],['#ec4899','#8b5cf6'],['#f59e0b','#ef4444'],['#10b981','#3b82f6'],['#06b6d4','#6366f1'],['#f43f5e','#f59e0b'],['#a855f7','#ec4899'],['#14b8a6','#22c55e'],['#eab308','#f97316'],['#3b82f6','#06b6d4']];
const SAMPLE_CARGOS=['Aprendiz','Estagiário','Júnior','Pleno','Sênior','Procurador'];
const SAMPLE_CAPIS=['feliz','satisfeita','joinha','ideia','pensando','concluido','coracao','escrevendo','estudante','meditando','procurando','cafe','balanca','atencao','chorando'].map(id=>`/mascote/${id}.png`);
function sampleAvatar(i){ return SAMPLE_CAPIS[i%SAMPLE_CAPIS.length]; }
function hashN(s){ let h=2166136261; for(const c of s){ h^=c.charCodeAt(0); h=Math.imul(h,16777619);} return h>>>0; }
let RT={tab:'geral', mat:'adm'};
function rankRows(tab, mat){
  // Dados REAIS do backend (privacidade: só iniciais; + cargo/nível/foto). Fallback = SAMPLE de exemplo.
  const R = (typeof window!=='undefined' && window.__JURIS_RANK) || null;
  if(R && Array.isArray(R.rows) && R.rows.length){
    const rr=R.rows.map((r,i)=>({ ini:r.ini||'?', iniciais:r.ini||'?', cargo:r.cargo||'', cargoIcone:r.cargoIcone||'', nivel:r.nivel||1, avatar:r.avatar||null, avatarCor:r.avatarCor||null, nome:r.you?'Você':(r.ini||'?'), pts:+r.pts||0, selos:+r.selos||0, you:!!r.you, ord:i }));
    rr.sort((a,b)=>b.pts-a.pts || a.ord-b.ord); rr.forEach((r,i)=>r.pos=i+1); return rr;
  }
  const rows=SAMPLE.map(([n,p,s],i)=>{
    let pts=p; if(tab==='dia') pts=Math.round(p*.58/10)*10; else if(tab==='mat') pts=Math.round((300+hashN(n+mat)%900)/10)*10;
    return {nome:n, ini:ini(n), iniciais:ini(n), pts, selos:s, ord:i,
      avatar:sampleAvatar(i), avatarCor:SAMPLE_GRAD[i%SAMPLE_GRAD.length][0],
      cargo:SAMPLE_CARGOS[i%SAMPLE_CARGOS.length], cargoIcone:'', nivel:2+(hashN(n)%9)};
  });
  const m=MATERIAS.find(x=>x.id===mat);
  const my = tab==='geral' ? totalPts() : tab==='dia' ? (S.best[hoje()]||0) : diasDaMateria(m).reduce((a,d)=>a+(S.best[d]||0),0);
  const _pf=perfilJog(); rows.push({nome:'Você', ini:(_pf&&_pf.iniciais)||'VC', iniciais:(_pf&&_pf.iniciais)||'VC', cargo:(_pf&&_pf.cargo)||'', cargoIcone:(_pf&&_pf.cargoIcone)||'', nivel:(_pf&&_pf.nivel)||1, avatar:(_pf&&_pf.avatar)||null, avatarCor:(_pf&&_pf.avatarCor)||null, pts:my, selos:selosCount(), you:true, ord:99});
  rows.sort((a,b)=>b.pts-a.pts || a.ord-b.ord);
  rows.forEach((r,i)=>r.pos=i+1);
  return rows;
}
function renderRankMini(){
  const rows=rankRows('geral'), me=rows.find(r=>r.you)||{pos:99,pts:0,selos:0,you:true};
  $('#rankDay').textContent=`ATÉ O DIA ${dd(pos(hoje()))}`;
  const li=r=>`<li class="${r.you?'you':''}"><span class="p">${r.you&&r.pts===0?'–':r.pos}</span>${avImg(r,'a')}<span>${r.you?'Você':r.ini}</span><span class="s">${pad(r.pts)}</span></li>`;
  const list = me.pos<=7 ? rows.slice(0,8).map(li) : [...rows.filter(r=>!r.you).slice(0,7).map(li), '<li class="sep">· · ·</li>', li(me)];
  $('#rankMini').innerHTML=list.join('');
}
const PODPAL={1:{X:'#ffc83d',A:'#fff3c4',D:'#2a1800',W:'#ffffff',P:'#2a1800'},2:{X:'#d3d9ff',A:'#ffffff',D:'#161a4a',W:'#ffffff',P:'#161a4a'},3:{X:'#f0965a',A:'#ffe0c8',D:'#2a1206',W:'#ffffff',P:'#2a1206'}};
const CROWN=["X...X...X","XX.XXX.XX","XXXXXXXXX","XXXXXXXXX",".XXXXXXX."];
function countUp(root){ root.querySelectorAll('[data-v]').forEach(el=>{ const v=+el.dataset.v, delay=+el.dataset.delay||0; el.textContent=pad(0);
  setTimeout(()=>{ let k=0; const st=Math.max(1,Math.ceil(v/28)); const iv=setInterval(()=>{ k=Math.min(v,k+st); el.textContent=pad(k); if(k>=v) clearInterval(iv); },28); }, delay); }); }
function renderRank(){
  const cur=hoje();
  $('#rSub').textContent = RT.tab==='geral' ? `ACUMULADO ATÉ O DIA ${dd(pos(cur))} · OBJETIVO: SELO JURISCLUB` : RT.tab==='dia' ? `MELHORES DO DIA ${dd(pos(cur))}` : `RANKING DE ${((MATERIAS.find(m=>m.id===RT.mat)||{}).nome||'').toUpperCase()}`;
  document.querySelectorAll('.tab').forEach(b=>b.setAttribute('aria-selected', b.dataset.tab===RT.tab));
  const ch=$('#rChips'); ch.hidden = RT.tab!=='mat';
  ch.innerHTML=MATERIAS.map(m=>`<button class="chip" data-mat="${m.id}" aria-pressed="${m.id===RT.mat}">${m.curto}</button>`).join('');
  const rows=rankRows(RT.tab,RT.mat), me=rows.find(r=>r.you)||{pos:99,pts:0,selos:0,you:true};
  // pódio (ordem visual 2 · 1 · 3)
  const H={1:150,2:112,3:84}, D={1:.45,2:.2,3:0};
  const pod=[2,1,3].map(p=>{ const r=rows[p-1];
    // Foto de perfil = CAPIVARA (escolhida ou padrão) com fundo da cor — nunca o boneco pixel nem iniciais.
    const _url = (r && r.avatar) || capiPadrao(r && (r.ini||r.iniciais||r.nome));
    const pm = `<img class="pod-masc" alt="" src="${_url}" style="object-fit:contain;object-position:center 82%;border-radius:50%;background:${(r&&r.avatarCor)||'#3a2f9a'}">`;
    return `<div class="pod p${p}" style="--d:${D[p]}s">
      <div class="pod-player">${p===1?`<svg class="pod-crown" viewBox="0 0 9 5" shape-rendering="crispEdges"><path fill="#ffc83d" d="${pxPath(CROWN)}"/></svg>`:''}
        ${pm}
        <span class="pod-name">${r.you?'Você':r.ini}</span>${r.cargo?`<span class="pod-cargo">${r.cargoIcone||''}<span>${r.cargo}</span></span>`:''}${r.you?'<span class="pod-you">VOCÊ</span>':''}
        <span class="pod-score" data-v="${r.pts}" data-delay="${(D[p]+.9)*1000}">000000</span></div>
      <div class="pod-block" style="--h:${H[p]}px"><span class="pod-num">${p}</span><small>${p}º LUGAR</small></div></div>`; }).join('');
  // Confete do Hall da Fama — pode ser desativado no Designer (aparencia.efeitos.confete === false).
  const confAtivo = !(window.DESAFIO && window.DESAFIO.APARENCIA && window.DESAFIO.APARENCIA.efeitos && window.DESAFIO.APARENCIA.efeitos.confete === false);
  const conf = confAtivo ? Array.from({length:22},(_,i)=>`<i style="left:${(i*4.6+Math.random()*3).toFixed(1)}%;--c:${['#ffc83d','#ff4f9a','#3fd5ff','#b48cff','#4ef0a0'][i%5]};--t:${(2+Math.random()*1.6).toFixed(2)}s;--d:${(-Math.random()*3).toFixed(2)}s"></i>`).join('') : '';
  $('#rPodium').innerHTML=`<span class="spot l"></span><span class="spot r"></span>${pod}<div class="confetti">${conf}</div>`;
  // lista 4º ao 10º
  const rest=rows.slice(3,10), show = me.pos<=10 ? rest : [...rows.filter(r=>!r.you).slice(3,10),'gap',me];
  $('#rTable').innerHTML=show.map((r,i)=>{ if(r==='gap') return `<div class="hl-gap">· · ·</div>`;
    return `<div class="hl-row ${r.you?'you':''}" style="--d:${(1.1+i*.07).toFixed(2)}s"><span class="pos">${r.you&&r.pts===0?'–':r.pos+'º'}</span>${avImg(r,'av')}<span class="nm">${r.you?'Você':r.ini}${r.you?'<span class="yt">VOCÊ</span>':''}${(r.cargo||r.nivel)?`<small class="hl-cargo" style="display:flex;align-items:center;gap:3px;opacity:.72;font-size:10px;letter-spacing:.02em">${r.cargo?(r.cargoIcone||''):''}<span>${r.cargo||''}${r.nivel?`${r.cargo?' · ':''}Nv ${r.nivel}`:''}</span></small>`:''}</span><span class="sl">${Array.from({length:7},(_,k)=>`<i class="${k<r.selos?'on':''}"></i>`).join('')}</span><span class="pt" data-v="${r.pts}" data-delay="${(1.2+i*.07)*1000}">000000</span></div>`; }).join('');
  countUp($('#rankModal'));
  SFX.seq([523,659,784,1047,784,1047,1319],.07,'square',.04);
}
function renderHeader(){
  const el=$('#recorde'), target=S.recorde, from=+el.textContent||0;
  if(from===target){ el.textContent=pad(target); return; }
  let k=from; const st=Math.max(1,Math.ceil((target-from)/20));
  const iv=setInterval(()=>{ k=Math.min(target,k+st); el.textContent=pad(k); if(k>=target) clearInterval(iv); },35);
}
function renderAll(){ renderHud(); renderStages(); renderPlayer(); renderSelos(); renderTeses(); renderRankMini(); renderHeader(); if(!$('#rankModal').hidden) renderRank(); }

/* ---------- mapa ---------- */
/* Mapa em grade: 43×25 tiles. Nós ficam em células abertas (x,y ímpares).
   O objetivo final ocupa os tiles x 15..27, y 7..15 e tem a entrada pela esquerda (14,11). */
const MC=43, MR=25, BOX={x0:15,x1:27,y0:7,y1:15}, ENTRY=[14,11];
const MAPNODES={0:[1,23],1:[5,21],2:[3,15],3:[3,9],4:[9,3],5:[15,3],6:[21,3],7:[27,3],8:[33,3],9:[39,9],10:[39,15],11:[37,21],12:[29,21],13:[21,21],14:[13,21],15:[9,13]};
function genMapMaze(){
  const R=rng(2026), g=Array.from({length:MR},()=>Array(MC).fill(1));
  const cw=(MC-1)/2, ch=(MR-1)/2;
  const masked=(cx,cy)=>{ const x=2*cx+1,y=2*cy+1; return x>=BOX.x0&&x<=BOX.x1&&y>=BOX.y0&&y<=BOX.y1; };
  const vis=Array.from({length:ch},(_,cy)=>Array.from({length:cw},(_,cx)=>masked(cx,cy)));
  const st=[[0,ch-1]]; vis[ch-1][0]=true; g[MR-2][1]=0;
  while(st.length){
    const [cx,cy]=st[st.length-1];
    const n=D4.map(([dx,dy])=>[cx+dx,cy+dy,dx,dy]).filter(([x,y])=>x>=0&&y>=0&&x<cw&&y<ch&&!vis[y][x]);
    if(!n.length){ st.pop(); continue; }
    const [x,y,dx,dy]=n[Math.floor(R()*n.length)];
    vis[y][x]=true; g[2*cy+1+dy][2*cx+1+dx]=0; g[2*y+1][2*x+1]=0; st.push([x,y]);
  }
  const inBox=(x,y)=>x>=BOX.x0-1&&x<=BOX.x1+1&&y>=BOX.y0-1&&y<=BOX.y1+1;
  for(let cy=0;cy<ch;cy++) for(let cx=0;cx<cw;cx++){
    if(masked(cx,cy)) continue; const x=2*cx+1,y=2*cy+1;
    if(D4.filter(([dx,dy])=>g[y+dy][x+dx]===0).length===1){
      const c=D4.filter(([dx,dy])=>{const wx=x+dx,wy=y+dy; return g[wy][wx]===1&&wx>0&&wy>0&&wx<MC-1&&wy<MR-1&&!inBox(wx,wy);});
      if(c.length){ const [dx,dy]=c[Math.floor(R()*c.length)]; g[y+dy][x+dx]=0; }
    }
  }
  for(let y=1;y<MR-1;y++) for(let x=1;x<MC-1;x++) if(g[y][x]===1&&((x%2===0)!==(y%2===0))&&!inBox(x,y)&&R()<.1) g[y][x]=0;
  // estrada principal: corredores em L entre as paradas, para a trilha seguir o labirinto sem desvios
  const FIRST={1:'h',2:'v',3:'h',4:'h',5:'h',6:'h',7:'h',8:'h',9:'h',10:'v',11:'v',12:'h',13:'h',14:'h',15:'v',16:'v'};
  const stops=[...Array(16).keys()].map(k=>MAPNODES[k]).concat([ENTRY]);
  const carve=(x,y)=>{ if(x>0&&y>0&&x<MC-1&&y<MR-1&&!(x>=BOX.x0&&x<=BOX.x1&&y>=BOX.y0&&y<=BOX.y1)) g[y][x]=0; };
  for(let k=1;k<stops.length;k++){
    let [x,y]=stops[k-1]; const [tx,ty]=stops[k];
    const stepH=()=>{ while(x!==tx){ x+=Math.sign(tx-x); carve(x,y);} }, stepV=()=>{ while(y!==ty){ y+=Math.sign(ty-y); carve(x,y);} };
    if(FIRST[k]==='h'){ stepH(); stepV(); } else { stepV(); stepH(); }
  }
  g[ENTRY[1]][ENTRY[0]]=0;
  return g;
}
let MAPG=null;
function mapPath(g,[sx,sy],[tx,ty]){
  const prev=new Int32Array(MC*MR).fill(-2), q=[sx+sy*MC]; prev[q[0]]=-1;
  for(let h=0;h<q.length;h++){ const i=q[h]; if(i===tx+ty*MC) break; const x=i%MC,y=(i/MC)|0;
    for(const [dx,dy] of D4){ const nx=x+dx,ny=y+dy; if(nx>=0&&ny>=0&&nx<MC&&ny<MR&&!g[ny][nx]&&prev[nx+ny*MC]===-2){ prev[nx+ny*MC]=i; q.push(nx+ny*MC);} } }
  const out=[]; let k=tx+ty*MC; if(prev[k]===-2) return out;
  while(k!==-1){ out.push([k%MC,(k/MC)|0]); k=prev[k]; } return out.reverse();
}
function renderMap(){
  const map=$('#map'), cv=$('#mapCanvas'), w=map.clientWidth, dpr=Math.min(2,devicePixelRatio||1);
  const T=(w/MC)*dpr;
  cv.width=Math.round(MC*T); cv.height=Math.round(MR*T);
  const c=cv.getContext('2d'); c.fillStyle='#050a33'; c.fillRect(0,0,cv.width,cv.height);
  if(!MAPG) MAPG=genMapMaze();
  const g=MAPG.map(r=>r.slice()); for(let y=BOX.y0;y<=BOX.y1;y++) for(let x=BOX.x0;x<=BOX.x1;x++) g[y][x]=0; // não desenha paredes sob o objetivo
  drawWalls(c,g,T,{neon:'#7c3aed',inner:'#050a33',glow:'#8b5cf6',w:.16});
  // trilhas em bolinhas, seguindo os corredores
  const cur=hoje(); let svg='';
  const NMAP=Math.min(NDAYS,15);                 // nº de nós no mapa (o mapa artesanal comporta até 15)
  const seq=[MAPNODES[0]]; for(let p=1;p<=NMAP;p++) seq.push(MAPNODES[p]); seq.push([BOX.x0,ENTRY[1]]);
  for(let k=1;k<seq.length;k++){
    const lastSeg = k===seq.length-1;
    const dayKey = lastSeg ? null : keyAt(k);
    const done = lastSeg ? matDone(FINAL) : dayComplete(dayKey);
    const live = !lastSeg && !done && dayKey===cur && dayUnlocked(dayKey);
    const p=mapPath(MAPG, seq[k-1], lastSeg?ENTRY:seq[k]);
    if(lastSeg) p.push([BOX.x0,ENTRY[1]]);
    const pts=p.slice(1, lastSeg?undefined:-1);
    pts.forEach(([x,y],i)=>{
      const cls = done?'pd done': live?'pd live':'pd';
      svg+=`<circle class="${cls}" cx="${x+.5}" cy="${y+.5}" r="${done?.17:.13}" style="animation-delay:${(i*.08).toFixed(2)}s"/>`;
    });
  }
  const tr=$('#mapTrail'); tr.setAttribute('viewBox',`0 0 ${MC} ${MR}`); tr.setAttribute('preserveAspectRatio','none'); tr.innerHTML=svg;
  map.querySelectorAll('.node,.objective,.start-lbl').forEach(n=>n.remove());
  const heroURL=spriteURL(SPR.hero[0],3);
  const pct=([x,y])=>[(x+.5)/MC*100,(y+.5)/MR*100];
  for(let p=1;p<=NMAP;p++){
    const nkey=keyAt(p), m=matOf(nkey), done=dayComplete(nkey), un=dayUnlocked(nkey), isCur=nkey===cur&&!done, isFim=isFinalDay(nkey);
    const b=document.createElement('button');
    b.className='node '+(done?'done':isCur?'current':un?'avail':'locked')+(p===NMAP?' last':'');
    const [lx,ly]=pct(MAPNODES[p]); b.style.left=lx+'%'; b.style.top=ly+'%';
    b.dataset.day=nkey; b.setAttribute('aria-label',`Dia ${p}, ${m.nome}`);
    const col = done?'#ffc83d': (un?'#c9c6ff':'#5c61c4');
    b.innerHTML=`<svg class="ic" viewBox="0 0 54 54"><circle cx="27" cy="27" r="20" fill="${done?'#2a1f12':'#0b1150'}" stroke="${col}" stroke-width="3"/>${arcArrow(27,27,23.5,-160,-62,3,col,null,1.5)}<g transform="translate(16.2 16.2) scale(2.4)" shape-rendering="crispEdges"><path fill="${col}" d="${pxPath(ICON[m.icon])}"/></g>${!un?`<g transform="translate(36 34)"><circle cx="6" cy="6" r="7" fill="#0b1150" stroke="${col}" stroke-width="1.5"/><g transform="translate(2 2) scale(.9)"><path fill="${col}" d="${pxPath(ICON.lock)}"/></g></g>`:''}${done?`<g transform="translate(36 34)"><circle cx="6" cy="6" r="7" fill="#ffc83d"/><g transform="translate(2 2) scale(.9)"><path fill="#1a1240" d="${pxPath(ICON.check)}"/></g></g>`:''}</svg><span class="lbl">DIA ${dd(p)}</span><span class="mt">${isFim?'FINAL · RG':m.curto}</span>${isCur?`<img class="hero" alt="" src="${heroURL}">`:''}`;
    map.appendChild(b);
  }
  const o=document.createElement('div'); o.className='objective'+(matDone(FINAL)?' won':'');
  o.style.left=BOX.x0/MC*100+'%'; o.style.top=BOX.y0/MR*100+'%'; o.style.width=(BOX.x1-BOX.x0+1)/MC*100+'%'; o.style.height=(BOX.y1-BOX.y0+1)/MR*100+'%';
  o.innerHTML=`<span class="ot">OBJETIVO FINAL</span>${finalMedal(matDone(FINAL))}<span class="door" style="top:${(ENTRY[1]-BOX.y0+.5)/(BOX.y1-BOX.y0+1)*100}%"></span>`; map.appendChild(o);
  const s=document.createElement('span'); s.className='start-lbl'; const [sx,sy]=pct(MAPNODES[0]); s.style.left=sx+'%'; s.style.top=sy+'%'; s.textContent='START'; map.appendChild(s);
}

/* ---------- UI ---------- */
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast.h); toast.h=setTimeout(()=>t.hidden=true,2400); }
function openModal(id){ SFX.init(); SFX.click(); if(G.mode==='play') pause(true); $('#'+id).hidden=false; if(id==='mapModal') requestAnimationFrame(renderMap); if(id==='rankModal') renderRank(); }
function closeModal(id){ $('#'+id).hidden=true; SFX.click(); }
function pause(on){ if(on && G.mode==='play') setMode('paused'); else if(!on && G.mode==='paused') setMode('play'); }
function pickDay(n){
  SFX.init();
  if(!dayUnlocked(n)){ SFX.locked(); const _dt=dataLiberacao(n); toast(_dt?`Este dia abre em ${_dt}.`:'Dia ainda não liberado.');
    const el=document.querySelector(`.cs[data-day="${n}"]`); if(el){ el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } return false; }
  SFX.click(); loadDay(n);
  if(!document.body.classList.contains('theater')) $('#screen').scrollIntoView({behavior:RM?'auto':'smooth',block:'center'});
  return true;
}



/* ---------- detalhe ampliado ---------- */
const BESTS=[
  {k:'peg', chip:'CAÇADORA', vel:4, per:5, quando:'DIA 1 · UMA 2ª A PARTIR DO DIA 9',
   comp:'Persegue você pelo caminho mais curto do labirinto, sem descanso. É a mais rápida das três.',
   dica:'Não fique muito tempo em linha reta: use os cruzamentos para virar e guarde o Vade Mecum para quando ela estiver colada em você.'},
  {k:'sum', chip:'ERRANTE', vel:2, per:3, quando:'A PARTIR DO DIA 1',
   comp:'Vagueia ao acaso e só de vez em quando vem atrás de você. Lenta, mas costuma bloquear corredores.',
   dica:'Observe para onde ela está indo antes de entrar num corredor longo. Ela raramente muda de ideia no meio do caminho.'},
  {k:'inf', chip:'EMBOSCADA', vel:3, per:4, quando:'A PARTIR DO DIA 3',
   comp:'Mira quatro casas à sua frente para cortar o seu caminho e, de tempos em tempos, fica quase invisível.',
   dica:'Quando ela sumir, mude de direção: ela calcula para onde você vai, não onde você está.'}];
function openInfo(html, cc){ const b=$('#infoBody'); b.innerHTML=html; b.parentElement.style.setProperty('--cc',cc); openModal('infoModal'); SFX.tone(440,.08,'square',.04); SFX.tone(880,.1,'square',.04,null,.08); }
function openSelo(key){
  const isF=key==='final', m=isF?FINAL:MATERIAS[+key], won=matDone(m), cc=isF?'#ffc83d':MCOL[m.id];
  const days=isF?VORD.slice():diasDaMateria(m);
  const doneN=days.filter(dayComplete).length;
  const mk=w=>isF?finalMedal(w):medalBig(m,w);
  const next=days.find(d=>dayUnlocked(d)&&!dayComplete(d));
  const dayRows=isF?'' : days.map(n=>{ const st=stateOf(n), t=getTeses(n).length, d=Math.min(t,domOf(n).length);
      return `<div class="id-day"><span class="n">${dd(pos(n))}</span><div><b>${(DIAS[n]&&DIAS[n].titulo)||''}</b><div class="sb-bar" style="--cc:${cc}"><i style="width:${t?d/t*100:0}%"></i></div></div><span class="st ${st}">${STAT_TXT[st]} · ${d}/${t}</span></div>`; }).join('');
  const teses=isF?'' : `<div class="id-sub">TESES DESTE SELO</div><ul class="id-teses">${days.flatMap(n=>getTeses(n).map((q,i)=>domOf(n).includes(i)?`<li><small>${q.ref}</small>${q.tema}</li>`:`<li class="mys">? ? ? ? ?</li>`)).join('')}</ul>`;
  const finalCells=isF?`<div class="p1-cells" style="margin-bottom:16px">${days.map(n=>`<i class="${dayComplete(n)?'done':n===hoje()?'cur':''}" title="Dia ${pos(n)}"></i>`).join('')}</div>`:'';
  openInfo(`
    <div class="id-head"><div><small>${isF?`SELO FINAL · ${NDAYS} DIAS`:`SELO · MATÉRIA ${dd(MATERIAS.indexOf(m)+1)}`}</small><h3 id="infoTitle">${m.nome||(isF?'JurisClub 2026':'')}</h3></div>
      <span class="id-state ${won?'on':'off'}">${won?'★ CONQUISTADO':'BLOQUEADO'}</span></div>
    <div class="id-compare">
      <figure class="${won?'':'on'}"><div class="idm">${mk(false)}</div><figcaption>BLOQUEADO<span>${won?'como era':'como está agora'}</span></figcaption></figure>
      <span class="id-arrow">▶</span>
      <figure class="${won?'on':''}"><div class="idm">${mk(true)}</div><figcaption>CONQUISTADO<span>${won?'seu selo':'o que você vai ganhar'}</span></figcaption></figure>
    </div>
    <p class="id-msg">${won?(isF?`Você concluiu os ${NDAYS} dias do desafio. Lenda JurisClub!`:`Você domina ${m.nome}. Selo garantido na sua coleção!`):(isF?`Conclua os ${NDAYS} dias para conquistar o selo final. Progresso: ${doneN}/${NDAYS}.`:`Conclua ${days.length} dia(s) para conquistar este selo. Progresso: ${doneN}/${days.length}.`)}</p>
    ${finalCells}${dayRows?`<div class="id-days">${dayRows}</div>`:''}${teses}
    ${next?`<div class="id-actions"><button class="btn-w" id="infoGo">JOGAR DIA ${dd(pos(next))} ▸</button></div>`:''}`, cc);
  if(next) $('#infoGo').onclick=()=>{ closeModal('infoModal'); selectStage(next); $('#screen').scrollIntoView({behavior:RM?'auto':'smooth',block:'center'}); };
}
function openBest(k){
  const pips=(n)=>`<span class="pips">${[0,1,2,3,4].map(i=>`<i class="${i<n?'on':''}"></i>`).join('')}</span>`;
  const b=BESTS.find(x=>x.k===k);
  if(b){ const d=TRAP_DEF[k];
    openInfo(`
      <div class="id-head"><div><small>INIMIGO · ${b.chip}</small><h3 id="infoTitle">${d.nome}</h3></div><span class="id-state off" style="color:${d.cor}">PERIGO ${b.per}/5</span></div>
      <div class="id-compare" style="--c:${d.cor}">
        <figure class="on"><div class="id-sprite bx-sprite ${k}"><img alt="" src="${spriteURL(SPR[k],8)}"></div><figcaption>NORMAL<span>caçando teses</span></figcaption></figure>
        <span class="id-arrow">▶</span>
        <figure class="on" style="--cc:#3446ff"><div class="id-sprite fr" style="--cc:#3446ff"><img alt="" src="${spriteURL(SPR.fright[k],8)}"></div><figcaption>VULNERÁVEL<span>com o Vade Mecum</span></figcaption></figure>
      </div>
      <div class="id-stats" style="--c:${d.cor}"><span>VELOCIDADE</span>${pips(b.vel)}<span>PERIGO</span>${pips(b.per)}</div>
      <div class="id-box"><h4>COMPORTAMENTO</h4><p>${b.comp}</p></div>
      <div class="id-box"><h4>COMO ESCAPAR</h4><p>${b.dica}</p></div>
      <div class="id-box"><h4>APARECE</h4><p>${b.quando.charAt(0)+b.quando.slice(1).toLowerCase()}. Superar com o Vade Mecum vale +${CONFIG.pontos.armadilha}.</p></div>`, d.cor);
    return;
  }
  const gold=k==='gold';
  const img=gold?spriteURL(makeSprite(['XXX','XXX','XXX'],{X:'#ffc83d'}),24):spriteURL(makeSprite(ICON.book,{X:'#3fd5ff'}),8);
  const cc=gold?'#ffc83d':'#3fd5ff';
  openInfo(`
    <div class="id-head"><div><small>ITEM · ${gold?'TESE':'PODER'}</small><h3 id="infoTitle">${gold?'Ponto dourado':'Vade Mecum'}</h3></div><span class="id-state on" style="color:${cc}">${gold?'+'+CONFIG.pontos.tese:'7 SEG'}</span></div>
    <div class="id-compare"><figure class="on" style="grid-column:1/-1"><div class="id-sprite bx-sprite ${k}" style="--c:${cc}"><img alt="" src="${img}" style="width:${gold?'34%':'62%'}"></div><figcaption>${gold?'NO LABIRINTO':'NO LABIRINTO'}<span>${gold?'pulsando e brilhando':'piscando em azul'}</span></figcaption></figure></div>
    <div class="id-box"><h4>O QUE FAZ</h4><p>${gold?'Cada ponto dourado guarda uma tese do dia. Ao pegar, abre uma pergunta com '+CONFIG.tempoResposta+' segundos para responder.':'Por 7 segundos as armadilhas ficam azuis, mais lentas e fogem de você. Encoste nelas para superá-las.'}</p></div>
    <div class="id-box"><h4>${gold?'ACERTOU OU ERROU':'FIQUE DE OLHO'}</h4><p>${gold?'Acertou: tese dominada e +'+CONFIG.pontos.tese+' pontos. Errou ou o tempo acabou: −1 vida e a tese muda de lugar no labirinto.':'Quando as armadilhas começam a piscar em branco, o efeito está acabando. Cada armadilha superada vale +'+CONFIG.pontos.armadilha+' e volta ao ponto de partida.'}</p></div>
    <div class="id-box"><h4>QUANTIDADE</h4><p>${gold?'Um por tese ainda não dominada no dia.':'Dois por labirinto, em lados opostos.'}</p></div>`, cc);
}
const onCard=(sel,fn)=>e=>{ const c=e.target.closest(sel); if(!c) return; if(e.type==='keydown' && !['Enter',' '].includes(e.key)) return; e.preventDefault(); e.stopPropagation(); SFX.init(); fn(c); };
['click','keydown'].forEach(t=>{
  $('#selos').addEventListener(t,onCard('.sb',c=>openSelo(c.dataset.selo)));
  $('#seloFinal').addEventListener(t,onCard('.sfinal',()=>openSelo('final')));
  $('#trapsList').addEventListener(t,onCard('.bx',c=>openBest(c.dataset.bx)));
});

/* ---------- tela expandida ---------- */
function theater(on){
  if(on===document.body.classList.contains('theater')) return;
  SFX.init(); SFX.tone(on?300:900, .25, 'square', .04, on?1200:200);
  document.body.classList.toggle('theater', on);
  const b=$('#btnExpand'); b.setAttribute('aria-pressed',String(on)); b.querySelector('small').textContent = on ? 'SAIR' : 'TELA';
  try{
    if(on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
    if(!on && document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  }catch(e){}
  requestAnimationFrame(()=>{ resize(); });
}
$('#btnExpand').onclick=()=>theater(!document.body.classList.contains('theater'));
$('#btnExitTheater').onclick=()=>theater(false);
$('#abPause').onclick=()=>{ SFX.init(); SFX.click(); if(G.mode==='play') pause(true); else if(G.mode==='paused') pause(false); else toast('A pausa funciona durante a partida.'); };
$('#abSound').onclick=()=>snd.click();
document.addEventListener('fullscreenchange',()=>{ if(!document.fullscreenElement && document.body.classList.contains('theater')) theater(false); });

$('#stages').addEventListener('click',e=>{ const b=e.target.closest('.cs'); if(b){ selectStage(+b.dataset.day); return; } const c=e.target.closest('.cart'); if(c){ const m=[...MATERIAS,FINAL][+c.dataset.cart]; const ds=diasDaMateria(m); const n=ds.find(d=>!dayComplete(d)&&dayUnlocked(d))||ds[0]; if(n!=null) selectStage(n); } });
$('#stPrev').onclick=()=>{ const p=pos(stageSel||keyAt(1)); const k=keyAt(Math.max(1,p-1)); if(k!=null) selectStage(k); };
$('#stNext').onclick=()=>{ const p=pos(stageSel||keyAt(1)); const k=keyAt(Math.min(NDAYS,p+1)); if(k!=null) selectStage(k); };
$('#stages').addEventListener('mouseover',e=>{ const c=e.target.closest('.cart'); if(c && c!==window.__hc){ window.__hc=c; SFX.tone(1400,.02,'square',.015); } });
function showPane(k){ document.querySelectorAll('.ptab').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.pt===k))); document.querySelectorAll('.pane').forEach(p=>p.hidden=p.dataset.pane!==k); }
document.querySelector('.ptabs').addEventListener('click',e=>{ const t=e.target.closest('.ptab'); if(t){ SFX.init(); SFX.click(); showPane(t.dataset.pt); } });
$('#map').addEventListener('click',e=>{ const b=e.target.closest('.node'); if(b && pickDay(+b.dataset.day)) closeModal('mapModal'); });
$('#btnMap').onclick=()=>openModal('mapModal');
$('#btnRank').onclick=$('#btnRank2').onclick=()=>openModal('rankModal');
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{ if(e.target===m && m.id!=='qModal') closeModal(m.id); }));
document.querySelector('.tabs').addEventListener('click',e=>{ const b=e.target.closest('.tab'); if(b){ RT.tab=b.dataset.tab; SFX.click(); renderRank(); } });
$('#rChips').addEventListener('click',e=>{ const b=e.target.closest('.chip'); if(b){ RT.mat=b.dataset.mat; SFX.click(); renderRank(); } });
$('#btnStart').onclick=startRun;
$('#btnContinue').onclick=continueRun;
$('#btnReplay').onclick=()=>{ SFX.click(); loadDay(G.day); };
$('#btnNext').onclick=()=>{ const _ci=VORD.indexOf(G.day); const nx=_ci>=0&&_ci<VORD.length-1?VORD[_ci+1]:null; if(nx!=null) pickDay(nx); };
$('#qOpts').addEventListener('click',e=>{ const b=e.target.closest('.opt'); if(b) answer(+b.dataset.i); });
$('#qNext').onclick=closeQuestion;
$('#screen').addEventListener('click',e=>{ if(G.mode==='attract' && !e.target.closest('button')) startRun(); });
const snd=$('#btnSound');
const volSfx=$('#volSfx'), volMus=$('#volMus');
const clampVol = el => Math.max(0, Math.min(1, (parseInt(el.value,10)||0)/100));
// Canais independentes: efeitos (volSfx) e música (volMus). `muted` = mudo GERAL (header ♪ SOM).
const sfxOff = () => S.muted || !((typeof S.volSfx==='number'?S.volSfx:0) > 0);
const musOff = () => S.muted || !((typeof S.volMus==='number'?S.volMus:0) > 0);
function setBar(el, val, off){ if(!el) return; const pct=Math.round((typeof val==='number'?val:.5)*100); el.value=String(pct); el.style.setProperty('--vp',pct+'%'); el.classList.toggle('off', off); }
function syncSound(){
  snd.setAttribute('aria-pressed', String(!S.muted));
  $('#abSound')?.classList.toggle('off', sfxOff());   // botão SOM da TV = EFEITOS
  $('#abMusic')?.classList.toggle('off', musOff());   // botão MÚSICA da TV
  setBar(volSfx, S.volSfx, sfxOff());
  setBar(volMus, S.volMus, musOff());
  BGM.apply();
}
// Header ♪ SOM = mudo GERAL (efeitos + música). Ao reativar totalmente mudo, volta na metade.
snd.onclick=()=>{
  if(S.muted){ S.muted=false; if(!((S.volSfx||0)>0) && !((S.volMus||0)>0)){ S.volSfx=1; S.volMus=.5; } }
  else S.muted=true;
  save(); SFX.init(); BGM.arm(); syncSound(); if(!S.muted) SFX.click();
};
// Botão SOM da TV = liga/desliga EFEITOS; botão MÚSICA = liga/desliga a música.
$('#abSound') && ($('#abSound').onclick=()=>{ S.volSfx = (S.volSfx>0)?0:1; if(S.volSfx>0) S.muted=false; save(); SFX.init(); syncSound(); if(S.volSfx>0) SFX.click(); });
$('#abMusic') && ($('#abMusic').onclick=()=>{ S.volMus = (S.volMus>0)?0:.5; if(S.volMus>0) S.muted=false; save(); SFX.init(); BGM.arm(); syncSound(); });
if(volSfx) volSfx.oninput=()=>{ S.volSfx=clampVol(volSfx); if(S.volSfx>0) S.muted=false; save(); SFX.init(); syncSound(); };
if(volMus) volMus.oninput=()=>{ S.volMus=clampVol(volMus); if(S.volMus>0) S.muted=false; save(); SFX.init(); BGM.arm(); syncSound(); };
// A música só é "armada" quando o carregamento chega a 100% (intro.finish → BGM.arm). Aqui só RE-TENTAMOS
// tocar em gestos posteriores caso o navegador tenha bloqueado o autoplay no 100% — nunca inicia antes.
['pointerdown','keydown'].forEach(ev=>addEventListener(ev, ()=>{ if(BGM.armed && !S.muted) BGM.apply(); }));
BGM.init();
// Não vazar áudio entre páginas: pausa ao sair/ocultar a página; retoma ao voltar (se armado e com volume).
addEventListener('pagehide', ()=>{ try{ BGM.el?.pause(); }catch(e){} });
addEventListener('beforeunload', ()=>{ try{ BGM.el?.pause(); }catch(e){} });
document.addEventListener('visibilitychange', ()=>{ if(document.hidden){ try{ BGM.el?.pause(); }catch(e){} } else if(BGM.armed){ BGM.apply(); } });
$('#demoAll').checked=!!S.demoAll;
$('#demoAll').onchange=e=>{ S.demoAll=e.target.checked; save(); renderAll(); toast(S.demoAll?'Todos os dias liberados (demonstração).':'Liberação por progresso.'); };
$('#btnReset').onclick=e=>{
  const b=e.currentTarget;
  if(!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent='CLIQUE DE NOVO PARA CONFIRMAR'; setTimeout(()=>{ b.classList.remove('armed'); b.textContent='ZERAR PROGRESSO'; },3000); return; }
  const muted=S.muted; S=JSON.parse(JSON.stringify(DEF)); S.muted=muted; save(); $('#demoAll').checked=false;
  b.classList.remove('armed'); b.textContent='ZERAR PROGRESSO'; $('#recorde').textContent='000000'; loadDay(1); toast('Progresso zerado.');
};

// teclado
const KEYMAP={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right',W:'up',S:'down',A:'left',D:'right'};
addEventListener('keydown',e=>{
  if(!$('#qModal').hidden){
    const k=e.key.toLowerCase(); const map={a:0,b:1,c:2,'1':0,'2':1,'3':2};
    if(Q && !Q.done && k in map && map[k]<Q.q.o.length){ e.preventDefault(); answer(map[k]); }
    else if(Q && Q.done && (e.key==='Enter'||e.key===' ')){ e.preventDefault(); closeQuestion(); }
    return;
  }
  const openM=[...document.querySelectorAll('#mapModal,#rankModal,#infoModal')].find(m=>!m.hidden);
  if(openM){ if(e.key==='Escape') closeModal(openM.id); return; }
  if(e.key==='Escape' && document.body.classList.contains('theater')){ theater(false); return; }
  if((e.key==='f'||e.key==='F') && !e.target.closest('input,textarea')){ const fb=$('#btnExpand'); fb.classList.add('pressed'); setTimeout(()=>fb.classList.remove('pressed'),140); theater(!document.body.classList.contains('theater')); return; }
  if(e.target.closest('input,textarea')) return;
  if(KEYMAP[e.key] && ['play','ready','paused'].includes(G.mode)){ e.preventDefault(); setWant(KEYMAP[e.key]); return; }
  if(e.key==='Enter'){ if(G.mode==='attract'){ e.preventDefault(); startRun(); } else if(G.mode==='gameover'){ e.preventDefault(); continueRun(); } else if(G.mode==='clear' && !$('#btnNext').hidden && document.activeElement?.tagName!=='BUTTON'){ e.preventDefault(); $('#btnNext').click(); } }
  if(['1','2','3'].includes(e.key) && G.mode!=='play'){ showPane(['rank','selos','arm'][+e.key-1]); SFX.click(); }
  const flashBtn={p:'abPause',P:'abPause',m:'abSound',M:'abSound',f:'btnExpand',F:'btnExpand'}[e.key]; if(flashBtn){ const fb=$('#'+flashBtn); fb.classList.add('pressed'); setTimeout(()=>fb.classList.remove('pressed'),140); }
  if(e.key==='p'||e.key==='P'){ if(G.mode==='play') pause(true); else if(G.mode==='paused') pause(false); }
  if(e.key==='m'||e.key==='M'){ snd.click(); }
});
// d-pad e toques
$('#dpad').addEventListener('pointerdown',e=>{ const b=e.target.closest('button'); if(!b) return; e.preventDefault(); SFX.init();
  if(b.dataset.d){ if(G.mode==='attract') startRun(); setWant(b.dataset.d); }
  else { if(G.mode==='attract') startRun(); else if(G.mode==='gameover') continueRun(); else if(G.mode==='play') pause(true); else if(G.mode==='paused') pause(false); } });
let tStart=null;
canvas.addEventListener('touchstart',e=>{ const t=e.touches[0]; tStart=[t.clientX,t.clientY]; },{passive:true});
canvas.addEventListener('touchend',e=>{ if(!tStart) return; const t=e.changedTouches[0], dx=t.clientX-tStart[0], dy=t.clientY-tStart[1]; tStart=null;
  if(Math.max(Math.abs(dx),Math.abs(dy))<20) return; setWant(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up')); },{passive:true});
document.addEventListener('visibilitychange',()=>{ if(document.hidden) pause(true); });

/* =========================================================
   ABERTURA — carregamento animado antes de entrar na área
   ========================================================= */
const INTRO = { on:true, p:0, seg:-1, done:false };
(function intro(){
  const el=$('#intro'); if(!el){ INTRO.on=false; return; }
  // mascote
  const mc=$('#inMascotCv').getContext('2d'); const mt0=performance.now(); let mHappy=false, mJump=0;
  (function mloop(now){
    if(!INTRO.on) return;
    const t=(now-mt0)/1000;
    mJump = mHappy ? Math.max(0,mJump-.05) : 0;
    drawMascot(mc,{t, walk: mHappy?null:(t*2.2)%1, look:{x:1,y:0}, blink:(t%2.6)<.12, happy:mHappy, jump:mJump>0, spin: t*(mHappy?360:120)});
    requestAnimationFrame(mloop);
  })(mt0);
  const blinkIv=0;

  const MSG=[[0,'LIGANDO O GABINETE'],[14,'CARREGANDO AS TESES'],[34,'MONTANDO O LABIRINTO'],[54,'SOLTANDO AS ARMADILHAS'],[74,'POLINDO OS SELOS'],[90,'SINCRONIZANDO O RANKING']];
  const arc=$('#inArc'), head=$('#inHead'), segs=[...document.querySelectorAll('#inBar span')], st=$('#inStatus');
  let fontsOk=false; (document.fonts?.ready||Promise.resolve()).then(()=>fontsOk=true); setTimeout(()=>fontsOk=true,2500);
  const t0=performance.now(), delay=RM?150:2000, dur=RM?900:3400;

  function paint(p){
    arc.setAttribute('stroke-dasharray',`${p} ${100-p}`);
    head.setAttribute('transform',`rotate(${p*3.6} 50 50)`);
    segs.forEach((s,i)=>{ const f=Math.max(0,Math.min(1,(p-i*20)/20)); s.firstChild.style.width=(f*100)+'%'; s.classList.toggle('on',f>=1); });
    const si=Math.floor(p/20); if(si>INTRO.seg){ INTRO.seg=si; if(si>0) SFX.tone(520+si*120,.07,'square',.04); }
    const m=MSG.filter(([v])=>p>=v).pop()[1];
    st.innerHTML=`${m} <b>${Math.floor(p)}%</b>`;
  }
  function tick(now){
    if(INTRO.done) return;
    const k=Math.max(0,(now-t0-delay)/dur);
    let target=Math.min(100, k<1 ? 100*(1-Math.pow(1-k,1.6)) : 100);
    if(!fontsOk) target=Math.min(target,92);
    // avanço em “degraus”, como carregamento de cartucho
    if(target-INTRO.p>2.5 || target>=100) INTRO.p=target;
    paint(INTRO.p);
    if(INTRO.p>=100) return finish();
    requestAnimationFrame(tick);
  }
  function finish(){
    if(INTRO.done) return; INTRO.done=true; clearInterval(blinkIv);
    paint(100); st.classList.add('done'); st.innerHTML='PRONTO! ENTRANDO NO DESAFIO';
    $('#inMascot').classList.add('jump'); mHappy=true; mJump=1;
    SFX.seq([784,988,1175,1568],.08,'square',.05);
    try{ BGM.arm(); }catch(e){} // música de fundo começa quando o carregamento chega a 100%
    setTimeout(leave, RM?250:1100);
  }
  let leaving=false;
  function leave(){
    if(!INTRO.on || leaving) return; leaving=true;
    el.classList.add('leaving'); SFX.tone(180,.7,'sawtooth',.04,1800);
    setTimeout(()=>{
      el.classList.add('gone'); INTRO.on=false;
      const pg=document.querySelector('.page'); if(pg){ pg.classList.add('enter'); setTimeout(()=>pg.classList.remove('enter'),900); }
      setTimeout(()=>el.remove(),400);
      try{ resize(); renderAll(); }catch(e){}
      $('#btnStart')?.focus({preventScroll:true});
    }, RM?50:650);
  }
  // PULAR: conclui a barra na hora E sai imediatamente (sem esperar o fim automático).
  function skip(){
    SFX.init();
    if(!INTRO.on) return;
    if(!INTRO.done){ INTRO.done=true; clearInterval(blinkIv); INTRO.p=100; paint(100); mHappy=true; mJump=1;
      st.classList.add('done'); st.innerHTML='PRONTO! ENTRANDO NO DESAFIO'; SFX.seq([784,988,1175,1568],.08,'square',.05); }
    leave();
  }
  const _skipBtn=$('#inSkip');
  if(_skipBtn) _skipBtn.addEventListener('click',e=>{ e.preventDefault(); e.stopPropagation(); skip(); });
  // tocar/clicar em QUALQUER lugar da tela de carregamento também pula
  el.addEventListener('pointerdown',()=>{ SFX.init(); skip(); });
  addEventListener('keydown',e=>{
    if(!INTRO.on) return;
    e.stopImmediatePropagation();
    SFX.init();
    if(['Enter',' ','Escape'].includes(e.key)){ e.preventDefault(); skip(); }
  }, true);
  requestAnimationFrame(tick);
})();

// início
new ResizeObserver(()=>{ resize(); if(!$('#mapModal').hidden) renderMap(); }).observe(canvas);
syncSound(); renderTraps();
resize();
loadDay(S.sel && DIAS[S.sel] && dayUnlocked(S.sel) ? S.sel : hoje());
requestAnimationFrame(loop);
document.fonts?.ready.then(()=>{ renderAll(); });
})();
