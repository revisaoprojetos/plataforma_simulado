import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []
try {
  const a = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.4 }); a.setDefaultTimeout(30000)
  await a.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(900)
  await a.getByRole('button', { name: /^Admin$/ }).click().catch(()=>{}); await a.waitForTimeout(400)
  await a.locator('input[type=email]').fill('admin@teste.com'); await a.locator('input[type=password]').fill('Admin@2026')
  await a.getByRole('button', { name: /entrar no painel/i }).click(); await a.waitForTimeout(1500)
  await a.getByText(/Clique para entrar|Simulado Revis/i).first().click().catch(()=>{}); await a.waitForTimeout(1800)
  await a.goto('http://localhost:3000/admin/configuracoes', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(3000)
  res.push('aba Seleção existe: ' + (await a.getByRole('tab', { name: /Seleção/i }).count()))
  await a.getByRole('tab', { name: /Seleção/i }).click(); await a.waitForTimeout(1200)
  const body = await a.locator('body').innerText()
  res.push('mostra config + prévia: ' + (/Logo no seletor/i.test(body) && /Pr[ée]via — tela de seleç/i.test(body) && /Escolha a plataforma/i.test(body)))
  await a.screenshot({ path: 'scripts/_selecao.png', fullPage: false })
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,200)) } finally { console.log(res.join('\n')); await b.close() }
