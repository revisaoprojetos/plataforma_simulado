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
  // aba Seleção
  await a.getByRole('tab', { name: /Seleção/i }).click().catch(()=>{}); await a.waitForTimeout(1200)
  const body = await a.locator('body').innerText()
  res.push('tem "Moldura": ' + /Moldura/i.test(body))
  res.push('tem "Redonda/Arredondada/Quadrada": ' + (/Redonda/i.test(body) && /Arredondada/i.test(body) && /Quadrada/i.test(body)))
  res.push('tem "Sem fundo": ' + /Sem fundo/i.test(body))
  res.push('tem prévia da seleção: ' + /Escolha a plataforma/i.test(body))
  await a.screenshot({ path: 'scripts/_selecao_redonda.png', fullPage: false })
  // muda p/ Quadrada + Sem fundo e re-screenshot
  await a.getByRole('button', { name: /^Quadrada$/ }).click().catch(()=>{}); await a.waitForTimeout(500)
  await a.getByText(/Sem fundo/i).locator('xpath=following-sibling::button[1]').click().catch(()=>{}); await a.waitForTimeout(600)
  await a.screenshot({ path: 'scripts/_selecao_quadrada_semfundo.png', fullPage: false })
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,200)) } finally { console.log(res.join('\n')); await b.close() }
