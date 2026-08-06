import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []
try {
  const a = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.4 }); a.setDefaultTimeout(30000)
  await a.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(900)
  await a.getByRole('button', { name: /^Admin$/ }).click().catch(()=>{}); await a.waitForTimeout(400)
  await a.locator('input[type=email]').fill('admin@teste.com'); await a.locator('input[type=password]').fill('Admin@2026')
  await a.getByRole('button', { name: /entrar no painel/i }).click(); await a.waitForTimeout(1500)
  // seletor -> entra
  await a.getByText(/Clique para entrar|Simulado Revis/i).first().click().catch(()=>{}); await a.waitForTimeout(1800)
  await a.goto('http://localhost:3000/admin/configuracoes', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(3500)
  const body = await a.locator('body').innerText()
  res.push('Identidade sem "Imagem da seleção": ' + !/Imagem da seleç|Formato da imagem de seleç/i.test(body))
  res.push('logo grande renomeada (prova/embed): ' + /prova, embed e entrada/i.test(body))
  res.push('prévia única (sem abas Login/Seleção): ' + !/Pr[ée]via.*Login.*Sele/i.test(body))
  await a.screenshot({ path: 'scripts/_aparencia1.png', fullPage: false })
  // aba Avançado
  await a.getByRole('tab', { name: /Avançado/i }).click().catch(()=>{}); await a.waitForTimeout(1200)
  const av = await a.locator('body').innerText()
  res.push('Avançado sem "Cor da fonte": ' + !/Cor da fonte do sistema/i.test(av))
  res.push('Avançado sem inputs de logo URL: ' + !/URL do Logotipo/i.test(av))
  await a.screenshot({ path: 'scripts/_aparencia2.png', fullPage: false })
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,200)) } finally { console.log(res.join('\n')); await b.close() }
