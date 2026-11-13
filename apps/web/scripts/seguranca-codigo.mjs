// Varredura estática do CÓDIGO (regex) — dev/CI. Uso: node scripts/seguranca-codigo.mjs [--dry] [--json] [--falhar]
// Envia achados para POST /api/seguranca/ingest (CRON_SECRET) salvo com --dry. Fingerprints: codigo:<regra>:<arquivo>.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { imprimirResumo, enviar, argv } from './_seguranca-enviar.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const opts = argv()
const PULAR = new Set(['node_modules', '.next', 'pdfjs', 'vendor', '.git', 'scripts'])
const EXT_CODIGO = /\.(ts|tsx|js|jsx|mjs)$/
const EXT_HTML = /\.(htm|html)$/

function* andar(dir) {
  let ents
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of ents) {
    if (PULAR.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* andar(p)
    else yield p
  }
}

const rel = (p) => path.relative(RAIZ, p).split(path.sep).join('/')
const linhaDe = (txt, idx) => txt.slice(0, idx).split('\n').length

/** @type {Map<string, any>} fingerprint -> achado (agrega linhas no detalhe) */
const achados = new Map()
function add(a, linha) {
  const e = achados.get(a.fingerprint)
  if (e) { e.linhas.push(linha); return }
  achados.set(a.fingerprint, { ...a, linhas: [linha] })
}

const SANITIZA = /DOMPurify|sanitiz|sanitize-html|xss\(/i
const AUTH = /getCurrentAccess|checkPermission|accessCan|CRON_SECRET|cronAutorizado|autorizado\(|getUser\(|getSessaoAluno|isSuperAdmin|requireAdmin|webhook_secret|hmac|timingSafeEqual|x-api-key|authorization|INTERNAL_SECRET|RENDER_SECRET|api_key|verificarAssinatura|validarToken|createClient\(|getSession|contextoAdmin|lerSessao\w*|requireAuth|exigir\w*|autorizar\w*|verificarAcesso/i
const METODOS_MUT = /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b|export\s+const\s+(POST|PUT|PATCH|DELETE)\b/
const ROTAS_PUBLICAS = /^app\/api\/(health|public)\//

function analisar(arq) {
  const r = rel(arq)
  let txt
  try { const st = fs.statSync(arq); if (st.size > 3_000_000) return; txt = fs.readFileSync(arq, 'utf8') } catch { return }
  const ehHtml = EXT_HTML.test(arq)

  if (ehHtml) {
    for (const m of txt.matchAll(/\.innerHTML\s*[+]?=/g)) {
      add({ categoria: 'xss', severidade: 'baixo', titulo: `innerHTML em arquivo estático`, arquivo: r, recomendacao: 'Preferir textContent/DOM seguro ou sanitizar o HTML inserido.', fingerprint: `codigo:innerhtml:${r}` }, linhaDe(txt, m.index))
    }
    return
  }

  // 1) dangerouslySetInnerHTML sem sanitização no arquivo
  if (!SANITIZA.test(txt)) {
    for (const m of txt.matchAll(/dangerouslySetInnerHTML/g)) {
      add({ categoria: 'xss', severidade: 'medio', titulo: `dangerouslySetInnerHTML sem sanitização no arquivo`, arquivo: r, recomendacao: 'Sanitizar (DOMPurify/sanitize-html) antes de renderizar ou garantir sanitização na gravação.', fingerprint: `codigo:dangerous-html:${r}` }, linhaDe(txt, m.index))
    }
  }
  // 2) .or(`...${...}`) interpolado (injeção de filtro PostgREST)
  for (const m of txt.matchAll(/\.or\(\s*`([^`]*)`/g)) {
    if (!m[1].includes('${')) continue
    if (/safe\(|sanitiz|limpar|escapar|clean/i.test(m[1])) continue
    // Só valores vindos de ID/UUID/número são seguros; entrada de usuário (email, busca, termo…) é alto.
    const exprs = [...m[1].matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1])
    const USER = /email|busca|termo|search|query|\bq\b|texto|nome|filtro|cpf|telefone/i
    if (exprs.every((e) => /\b(ids?|uuid|tenantId|\w+Id|\w+_id)\b|\.join\(|Number\(|toISOString|Date/i.test(e) && !USER.test(e))) continue
    const usuario = exprs.some((e) => USER.test(e))
    add({ categoria: 'sqli', severidade: usuario ? 'alto' : 'medio', titulo: `.or() com interpolação direta (${usuario ? 'entrada de usuário' : 'valor dinâmico'})`, arquivo: r, recomendacao: 'Sanitizar o valor (padrão emailSafe em lib/integracoes/engine.ts) ou usar .eq()/.ilike() parametrizado.', fingerprint: `codigo:or-interpolado:${r}` }, linhaDe(txt, m.index))
  }
  // 3) rotas de API sem nenhuma checagem de auth reconhecível
  if (/^app\/api\/.+\/route\.ts$/.test(r) && !ROTAS_PUBLICAS.test(r) && !AUTH.test(txt)) {
    const teste = /^app\/api\/(teste|dev)\//.test(r)
    const guardaEnv = /NODE_ENV/.test(txt)
    const mut = METODOS_MUT.test(txt)
    if (teste && !guardaEnv) add({ categoria: 'rotas_expostas', severidade: 'critico', titulo: `Rota de teste/dev sem auth nem trava NODE_ENV`, arquivo: r, recomendacao: 'Remover do build de produção ou exigir NODE_ENV!=production + segredo.', fingerprint: `codigo:rota-sem-auth:${r}` }, 1)
    else if (!teste) add({ categoria: 'rotas_expostas', severidade: mut ? 'alto' : 'medio', titulo: `Rota de API sem checagem de auth/segredo reconhecível`, arquivo: r, recomendacao: 'Exigir sessão, checkPermission, CRON_SECRET ou assinatura HMAC; se for pública de propósito, documentar.', fingerprint: `codigo:rota-sem-auth:${r}` }, 1)
  }
  // 4) createAdminClient em componente cliente
  if (/^\s*['"]use client['"]/m.test(txt.slice(0, 400)) && /import\s*\{[^}]*createAdminClient[^}]*\}\s*from/.test(txt)) {
    add({ categoria: 'chaves', severidade: 'critico', titulo: `createAdminClient em arquivo 'use client'`, arquivo: r, recomendacao: 'Nunca usar service role no cliente; mover para server action/rota de API.', fingerprint: `codigo:admin-client-no-cliente:${r}` }, 1)
  }
  // 5) segredos em padrão conhecido
  if (!/\.env|lock|\.md$/.test(r)) {
    for (const [nome, re] of [['sk-', /\bsk-[A-Za-z0-9_-]{24,}/g], ['jwt', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g], ['aws', /\bAKIA[0-9A-Z]{16}\b/g]]) {
      for (const m of txt.matchAll(re)) {
        add({ categoria: 'chaves', severidade: 'critico', titulo: `Possível segredo hardcoded (${nome})`, arquivo: r, recomendacao: 'Revogar/rotacionar a chave e movê-la para variável de ambiente.', fingerprint: `codigo:segredo-${nome}:${r}` }, linhaDe(txt, m.index))
      }
    }
  }
  // 6) postMessage com targetOrigin '*'
  for (const m of txt.matchAll(/postMessage\([^;\n]*,\s*['"]\*['"]\s*\)/g)) {
    add({ categoria: 'xss', severidade: 'medio', titulo: `postMessage com targetOrigin '*'`, arquivo: r, recomendacao: 'Usar a origem do host validada (allowlist) como targetOrigin.', fingerprint: `codigo:postmessage-wildcard:${r}` }, linhaDe(txt, m.index))
  }
  // 7) innerHTML = em código
  for (const m of txt.matchAll(/\.innerHTML\s*[+]?=/g)) {
    add({ categoria: 'xss', severidade: 'baixo', titulo: `Atribuição a innerHTML`, arquivo: r, recomendacao: 'Preferir textContent ou sanitizar.', fingerprint: `codigo:innerhtml:${r}` }, linhaDe(txt, m.index))
  }
}

for (const sub of ['app', 'components', 'lib']) {
  for (const f of andar(path.join(RAIZ, sub))) if (EXT_CODIGO.test(f)) analisar(f)
}
for (const f of andar(path.join(RAIZ, 'public'))) if (EXT_HTML.test(f)) analisar(f)
for (const f of ['proxy.ts', 'middleware.ts']) { const p = path.join(RAIZ, f); if (fs.existsSync(p)) analisar(p) }

const lista = [...achados.values()].map(({ linhas, ...a }) => ({
  ...a,
  detalhe: `${linhas.length} ocorrência(s); linhas: ${[...new Set(linhas)].slice(0, 12).join(', ')}`,
}))

if (opts.json) console.log(JSON.stringify(lista, null, 2))
const por = imprimirResumo('Varredura de código', lista)
const ok = await enviar({ prefixos: ['codigo:'], achados: lista }, opts)
if (opts.falhar && (por.critico || por.alto)) process.exit(1)
void ok
