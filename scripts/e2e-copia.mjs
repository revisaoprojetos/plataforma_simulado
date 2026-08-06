import { chromium } from 'playwright'
const BASE = 'http://localhost:3000', EMAIL = 'admin@teste.com', SENHA = 'Admin@2026'
const res = []
const b = await chromium.launch({ headless: true })
try {
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } })
  p.setDefaultTimeout(20000)
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200)
  await p.getByRole('button', { name: /admin/i }).first().click(); await p.waitForTimeout(500)
  await p.locator('input[type="email"]').fill(EMAIL); await p.locator('input[type="password"]').fill(SENHA)
  await p.getByRole('button', { name: /entrar no painel/i }).click()
  await p.waitForURL(/\/admin/, { timeout: 25000 }).catch(() => {}); await p.waitForTimeout(2000)
  await p.goto(BASE + '/admin/compartilhar', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1800)

  const selects = p.locator('select')
  const oTexts = await selects.nth(0).locator('option').allTextContents()
  res.push('origem opts: ' + JSON.stringify(oTexts))
  // origem = a que tem "Ensino"
  const oVal = await selects.nth(0).locator('option', { hasText: /Ensino/i }).first().getAttribute('value')
  await selects.nth(0).selectOption(oVal); await p.waitForTimeout(800)
  // destino = "Revisão 2"
  const dVal = await selects.nth(1).locator('option', { hasText: /Revis.*2/i }).first().getAttribute('value')
  await selects.nth(1).selectOption(dVal); await p.waitForTimeout(3800)

  const nBancos = await p.locator('label:has-text("questões")').count()
  res.push('bancos carregados: ' + nBancos)
  const banco = p.locator('label').filter({ has: p.getByText('TESTE', { exact: true }) }).first()
  await banco.locator('input[type="checkbox"]').check()
  res.push('banco TESTE marcado: ' + (await banco.locator('input:checked').count()))

  await p.getByRole('button', { name: /copiar.+banco/i }).first().click(); await p.waitForTimeout(1000)
  await p.getByRole('button', { name: 'Copiar', exact: true }).click().catch(async () => { await p.locator('button', { hasText: /^Copiar$/ }).last().click() })
  await p.waitForTimeout(8000)
  res.push('toast: ' + (await p.getByText(/copiado.*banco|banco.*quest|quest.*es\)/i).count()))
  await p.screenshot({ path: 'scripts/_e2e-copia.png' })
} catch (e) { res.push('ERRO: ' + String(e.message || e).slice(0, 260)) } finally { console.log(res.join('\n')); await b.close() }
