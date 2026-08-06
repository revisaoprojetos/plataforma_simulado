import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const LABEL = process.env.LABEL || 'antes'
const EMAIL = process.env.SC_EMAIL || 'admin@teste.com'
const SENHA = process.env.SC_SENHA || 'Admin@2026'
const BASE = process.env.SC_BASE || 'http://localhost:3000'
const OUT = `docs/progresso/${LABEL}`
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()

// ── Login ADMIN: clicar no botão "Admin" (canto inf. dir.) → e-mail+senha → "Entrar no painel" ──
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Admin', exact: true }).click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(600)
await page.locator('input[type=email]').first().fill(EMAIL).catch(() => {})
await page.locator('input[type=password]').first().fill(SENHA).catch(() => {})
await page.getByRole('button', { name: /Entrar no painel/i }).click({ timeout: 8000 }).catch(() => {})
await page.waitForURL(/\/admin/, { timeout: 20000 }).catch(() => {})
await page.waitForTimeout(2500)

if (!page.url().includes('/admin')) {
  console.log('⚠️ login pode ter falhado — url:', page.url())
  await page.screenshot({ path: `${OUT}/_login-debug.png` })
}

async function shot(path, file) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(3500) // cards + imagens de capa
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: false })
  console.log('shot', file, '→', page.url())
}

// SC_PATHS="/rota:arquivo,/rota2:arquivo2" sobrescreve a lista padrão.
const PADRAO = '/admin/simulados:admin-simulados,/admin/cadernos:admin-cadernos,/admin/banco-questoes:admin-banco'
for (const spec of (process.env.SC_PATHS || PADRAO).split(',')) {
  const [p, f] = spec.split(':')
  await shot(p, `${f}.png`)
}

await browser.close()
console.log('OK →', OUT)
