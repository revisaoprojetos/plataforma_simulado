import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(30000)
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500)
  await p.screenshot({ path: 'scripts/_v2-aluno.png' })
  // login admin -> DEVE FICAR no seletor (não redirecionar)
  await p.getByRole('button', { name: /^Admin$/ }).click(); await p.waitForTimeout(500)
  await p.locator('input[type=email]').fill('admin@teste.com'); await p.locator('input[type=password]').fill('Admin@2026')
  await p.getByRole('button', { name: /entrar no painel/i }).click()
  await p.waitForTimeout(5000)
  const url = p.url(); const body = await p.locator('body').innerText()
  res.push('após login admin -> url: ' + url)
  res.push('ficou no seletor (NÃO redirecionou): ' + (/\/login/.test(url) && /Escolha a plataforma/i.test(body)))
  res.push('mostra card da plataforma p/ clicar: ' + /Clique para entrar|Simulado Revis/i.test(body))
  await p.screenshot({ path: 'scripts/_v2-seletor.png' })
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,200)) } finally { console.log(res.join('\n')); await b.close() }
