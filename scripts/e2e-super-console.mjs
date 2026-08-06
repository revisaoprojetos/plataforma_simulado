import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []; const errs = []
try {
  const a = await b.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1.3 }); a.setDefaultTimeout(30000)
  a.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.message).slice(0,160)))
  await a.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(900)
  await a.getByRole('button', { name: /^Admin$/ }).click().catch(()=>{}); await a.waitForTimeout(400)
  await a.locator('input[type=email]').fill('admin@teste.com'); await a.locator('input[type=password]').fill('Admin@2026')
  await a.getByRole('button', { name: /entrar no painel/i }).click(); await a.waitForTimeout(1500)
  await a.getByText(/Configura[çc][õo]es avan[çc]adas/i).first().waitFor({ timeout: 15000 }).catch(()=>{})
  // clica em Plataformas (atalho) -> deve ir p/ /super/plataformas
  await a.getByText(/^Plataformas$/).first().click().catch(()=>{})
  await a.waitForURL(/\/super\/plataformas/, { timeout: 25000 }).catch(()=>{})
  await a.waitForTimeout(1500)
  res.push('URL após clique: ' + a.url())
  const body = await a.locator('body').innerText()
  res.push('console: sidebar "Super-admin global": ' + /Super-admin global/i.test(body))
  res.push('tem "Nova plataforma": ' + /Nova plataforma/i.test(body))
  res.push('tem "Plataformas cadastradas": ' + /Plataformas cadastradas/i.test(body))
  res.push('tem nav Compartilhar/Entrada/Sistema: ' + (/Compartilhar/i.test(body) && /Entrada/i.test(body) && /Sistema/i.test(body)))
  await a.screenshot({ path: 'scripts/_super_console_plat.png', fullPage: false })
  // navega Início (hub)
  await a.goto('http://localhost:3000/super', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(1800)
  const hub = await a.locator('body').innerText()
  res.push('hub "Console do super-admin": ' + /Console do super-admin/i.test(hub))
  res.push('hub "Plataformas ativas": ' + /Plataformas ativas/i.test(hub))
  await a.screenshot({ path: 'scripts/_super_console_hub.png', fullPage: false })
  res.push('erros: ' + (errs.length ? errs.join(' | ') : 'nenhum'))
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,300)) } finally { console.log(res.join('\n')); await b.close() }
