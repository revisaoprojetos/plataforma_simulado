import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []
try {
  const a = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.4 }); a.setDefaultTimeout(30000)
  await a.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(900)
  await a.getByRole('button', { name: /^Admin$/ }).click().catch(()=>{}); await a.waitForTimeout(400)
  await a.locator('input[type=email]').fill('admin@teste.com'); await a.locator('input[type=password]').fill('Admin@2026')
  await a.getByRole('button', { name: /entrar no painel/i }).click(); await a.waitForTimeout(1500)
  await a.getByText(/Configura[çc][õo]es avan[çc]adas/i).first().waitFor({ timeout: 15000 }).catch(()=>{})
  await a.waitForTimeout(500)
  // no seletor
  const body = await a.locator('body').innerText()
  res.push('seletor "Escolha a plataforma": ' + /Escolha a plataforma/i.test(body))
  res.push('tem "Configurações avançadas": ' + /Configura[çc][õo]es avan[çc]adas/i.test(body))
  res.push('tem atalho Plataformas: ' + /Plataformas/i.test(body))
  res.push('tem atalho Entrada: ' + /Entrada/i.test(body))
  res.push('tem atalho Compartilhar: ' + /Compartilhar/i.test(body))
  res.push('tem atalho Sistema: ' + /Sistema/i.test(body))
  res.push('tem "painel administrativo completo": ' + /painel administrativo completo/i.test(body))
  await a.screenshot({ path: 'scripts/_super_avancado.png', fullPage: false })
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,200)) } finally { console.log(res.join('\n')); await b.close() }
