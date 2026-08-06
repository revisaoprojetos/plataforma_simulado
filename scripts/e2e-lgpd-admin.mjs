import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []
try {
  const a = await b.newPage({ viewport: { width: 1300, height: 900 } }); a.setDefaultTimeout(25000)
  await a.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(800)
  await a.getByRole('button', { name: /admin/i }).first().click(); await a.waitForTimeout(400)
  await a.locator('input[type="email"]').fill('admin@teste.com'); await a.locator('input[type="password"]').fill('Admin@2026')
  await a.getByRole('button', { name: /entrar no painel/i }).click()
  await a.waitForURL(/\/admin/, { timeout: 25000 }).catch(()=>{}); await a.waitForTimeout(1500)
  await a.goto('http://localhost:3000/admin/lgpd', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(2500)
  const at = await a.locator('body').innerText()
  res.push('ADMIN /admin/lgpd carrega (título): ' + /direitos do titular/i.test(at))
  res.push('aviso migração presente (esperado): ' + /Aplique a migração|20260730000002/i.test(at))
  res.push('item sidebar "LGPD": ' + await a.getByRole('link', { name: /^LGPD$/i }).count())
  await a.screenshot({ path: 'scripts/_e2e-lgpd.png' })
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,220)) } finally { console.log(res.join('\n')); await b.close() }
