// Remove as imagens redundantes de pdfs/assets (o canônico agora vive no bucket `imagens`).
// Confirma 0 referências no banco, baixa backup local e só então apaga.
//   DRY-RUN:  node scripts/limpar-pdfs-assets.mjs
//   APLICAR:  node scripts/limpar-pdfs-assets.mjs --aplicar
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local','utf8')
const get=k=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]??'').trim().replace(/^"|"$/g,'')
const URL=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL'), KEY=get('SUPABASE_SERVICE_ROLE_KEY')
const H={apikey:KEY,authorization:`Bearer ${KEY}`,'content-type':'application/json'}
const APLICAR=process.argv.includes('--aplicar')
const j=async p=>(await fetch(URL+'/rest/v1/'+p,{headers:H})).json()
// 1) referências a pdfs/assets no banco?
let refs=0
const scan=s=>{const m=String(s??'').match(/pdfs\/assets\//g);if(m)refs+=m.length}
;(await j('simulado_questoes?select=imagem_url&imagem_url=not.is.null&limit=10000')).forEach(r=>scan(r.imagem_url))
;(await j('simulado_cadernos_designer?select=capa_url,config&limit=10000')).forEach(r=>{scan(r.capa_url);scan(JSON.stringify(r.config))})
;(await j('simulado_tenants?select=tema&limit=200')).forEach(r=>scan(JSON.stringify(r.tema)))
;(await j('simulado_pastas?select=capa_url,capa_card_url&limit=10000')).forEach(r=>{scan(r.capa_url);scan(r.capa_card_url)})
try{(await j('simulado_banners?select=imagem_url&limit=10000')).forEach(r=>scan(r.imagem_url))}catch{}
console.log('referências a pdfs/assets no banco:', refs, '(precisa ser 0 p/ remover com segurança)')
const listar=async pre=>{const o=[];let f=0;while(true){const r=await fetch(URL+'/storage/v1/object/list/pdfs',{method:'POST',headers:H,body:JSON.stringify({prefix:pre,limit:1000,offset:f})});const a=await r.json();if(!Array.isArray(a)||!a.length)break;o.push(...a);if(a.length<1000)break;f+=1000}return o}
const files=(await listar('assets')).filter(x=>x.id&&x.name!=='.emptyFolderPlaceholder')
console.log('imagens em pdfs/assets:', files.length)
if(refs>0){console.log('ABORTA: ainda há referências — não removo.');process.exit(1)}
if(!APLICAR){console.log('\n(DRY-RUN — nada baixado/removido.)');process.exit(0)}
// 2) backup local
mkdirSync('scripts/_backup-pdfs-assets',{recursive:true})
let baixados=0
for(const f of files){ const dl=await fetch(`${URL}/storage/v1/object/public/pdfs/assets/${f.name}`); if(dl.ok){ writeFileSync(`scripts/_backup-pdfs-assets/${f.name}`, Buffer.from(await dl.arrayBuffer())); baixados++ } }
console.log('backup local:', baixados+'/'+files.length, 'em scripts/_backup-pdfs-assets/')
// 3) apagar
const paths=files.filter(()=>true).map(f=>`assets/${f.name}`)
const r=await fetch(`${URL}/storage/v1/object/pdfs`,{method:'DELETE',headers:H,body:JSON.stringify({prefixes:paths})})
console.log('removidos de pdfs/assets:', r.ok?paths.length:'FALHA '+r.status)
